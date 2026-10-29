// عروض المدير للمرضى والحجوزات: SELECT فقط بأعمدة صريحة ومعاملات (لا password_hash ولا أي سر ولا بيانات اتصال في الحجوزات).
// الترقيم: يُجلب صف زائد واحد لمعرفة hasMore دون استعلام عدّ.

function paged(rows, limit) {
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// ---------- المرضى ----------

export async function listPatients(db, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT p.patient_id, p.first_name, p.last_name, p.phone, u.email
       FROM public.patients p
       JOIN public.users u ON u.user_id = p.user_id
      ORDER BY p.patient_id
      LIMIT $1 OFFSET $2`,
    [limit + 1, offset],
  );
  return paged(rows, limit);
}

export async function findPatient(db, patientId) {
  const { rows } = await db.query(
    `SELECT p.patient_id, p.first_name, p.last_name, p.phone, u.email,
            p.birth_date, p.address, p.gender, p.blood_type
       FROM public.patients p
       JOIN public.users u ON u.user_id = p.user_id
      WHERE p.patient_id = $1`,
    [patientId],
  );
  return rows[0] ?? null;
}

// ---------- الحجوزات ----------

// phase بالوقت الفعلي في دمشق، بنفس تعبير سجل المريض (appointmentRepository.js)
const APPOINTMENT_SELECT = `SELECT a.appointment_id, a.status, a.appointment_date, a.appointment_time,
       d.doctor_id, d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
       s.specialty_id, s.specialty_name, s.appointment_duration,
       p.patient_id, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
       CASE WHEN a.status = 'cancelled' THEN 'cancelled'
            WHEN (a.appointment_date + a.appointment_time) > public.clinic_local(clock_timestamp()) THEN 'upcoming'
            ELSE 'past' END AS phase
  FROM public.appointments a
  JOIN public.doctors d ON d.doctor_id = a.doctor_id
  JOIN public.specialties s ON s.specialty_id = d.specialty_id
  JOIN public.patients p ON p.patient_id = a.patient_id`;

// date وdoctorId: قيمة أو null (بلا تصفية)؛ الأحدث أولاً
export async function listAppointments(db, { date, doctorId, limit, offset }) {
  const { rows } = await db.query(
    `${APPOINTMENT_SELECT}
      WHERE ($1::date IS NULL OR a.appointment_date = $1::date)
        AND ($2::int IS NULL OR a.doctor_id = $2::int)
      ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.appointment_id DESC
      LIMIT $3 OFFSET $4`,
    [date, doctorId, limit + 1, offset],
  );
  return paged(rows, limit);
}
