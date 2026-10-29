// استعلامات مواعيد المريض. كلها معلَّمة، ولا تُعاد أي بيانات اتصال للأطباء أو المرضى.
// phase تُحسب في SQL بالوقت الفعلي في دمشق (clinic_local(clock_timestamp())) فيتفق الحجز والسجل والإلغاء على ساعة واحدة.

const APPOINTMENT_SELECT = `SELECT a.appointment_id, a.status, a.appointment_date, a.appointment_time,
       d.doctor_id, d.first_name, d.last_name, s.specialty_id, s.specialty_name, s.appointment_duration,
       CASE WHEN a.status = 'cancelled' THEN 'cancelled'
            WHEN (a.appointment_date + a.appointment_time) > public.clinic_local(clock_timestamp()) THEN 'upcoming'
            ELSE 'past' END AS phase
  FROM public.appointments a
  JOIN public.doctors d ON d.doctor_id = a.doctor_id
  JOIN public.specialties s ON s.specialty_id = d.specialty_id`;

// هوية المريض من حساب الجلسة فقط (users.user_id)؛ null إن لم يكن للحساب ملف مريض
export async function findPatientIdByUserId(db, userId) {
  const { rows } = await db.query('SELECT patient_id FROM public.patients WHERE user_id = $1', [userId]);
  return rows[0]?.patient_id ?? null;
}

// يُستدعى داخل db.withTransaction (READ COMMITTED)؛ المشغّل والفهرسان الفريدان هم المرجع النهائي لصلاحية الحجز.
// status لا يُمرَّر فيأخذ الافتراضي booked
export async function insertAppointment(client, { patientId, doctorId, date, time }) {
  const { rows } = await client.query(
    `INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time)
     VALUES ($1, $2, $3::date, $4::time) RETURNING appointment_id`,
    [patientId, doctorId, date, time],
  );
  return rows[0].appointment_id;
}

export async function findPatientAppointment(db, patientId, appointmentId) {
  const { rows } = await db.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1 AND a.patient_id = $2`, [
    appointmentId,
    patientId,
  ]);
  return rows[0] ?? null;
}

export async function listPatientAppointments(db, patientId) {
  const { rows } = await db.query(
    `${APPOINTMENT_SELECT} WHERE a.patient_id = $1
      ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.appointment_id DESC`,
    [patientId],
  );
  return rows;
}

// إلغاء ذري: الملكية والحالة القائمة وعدم بدء الموعد في عبارة UPDATE واحدة (لا حذف للسجل).
// النتيجة: 'cancelled' أو سبب الرفض: 'not_found' (غير موجود أو لمريض آخر) | 'already_cancelled' | 'started'
export async function cancelAppointment(client, patientId, appointmentId) {
  const updated = await client.query(
    `UPDATE public.appointments
        SET status = 'cancelled'
      WHERE appointment_id = $1 AND patient_id = $2 AND status = 'booked'
        AND (appointment_date + appointment_time) > public.clinic_local(clock_timestamp())
      RETURNING appointment_id`,
    [appointmentId, patientId],
  );
  if (updated.rows.length > 0) return 'cancelled';

  const { rows } = await client.query(
    'SELECT status FROM public.appointments WHERE appointment_id = $1 AND patient_id = $2',
    [appointmentId, patientId],
  );
  if (rows.length === 0) return 'not_found';
  return rows[0].status === 'cancelled' ? 'already_cancelled' : 'started';
}
