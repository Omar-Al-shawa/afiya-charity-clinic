// بوابة الطبيب (قراءة فقط): كل استعلام مقيَّد بـ doctor_id المستخرج من حساب الجلسة.
// من بيانات المريض تُختار الأعمدة الثلاثة المسموحة فقط: الاسم الأول واسم العائلة والهاتف (لا معرّف مريض ولا بريد ولا غيرها).

export async function findDoctorContext(db, userId) {
  const { rows } = await db.query(
    `SELECT d.doctor_id, s.appointment_duration
       FROM public.doctors d
       JOIN public.specialties s ON s.specialty_id = d.specialty_id
      WHERE d.user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

// الحجوزات القائمة فقط (status = 'booked') للطبيب نفسه ضمن المدى [from, to]؛ phase بالوقت الفعلي في دمشق
export async function listDoctorBookings(db, doctorId, fromDate, toDate) {
  const { rows } = await db.query(
    `SELECT a.appointment_id, a.appointment_date, a.appointment_time,
            p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.phone AS patient_phone,
            CASE WHEN (a.appointment_date + a.appointment_time) > public.clinic_local(clock_timestamp())
                 THEN 'upcoming' ELSE 'past' END AS phase
       FROM public.appointments a
       JOIN public.patients p ON p.patient_id = a.patient_id
      WHERE a.doctor_id = $1 AND a.status = 'booked' AND a.appointment_date BETWEEN $2::date AND $3::date
      ORDER BY a.appointment_date, a.appointment_time, a.appointment_id`,
    [doctorId, fromDate, toDate],
  );
  return rows.map((row) => ({
    id: row.appointment_id,
    date: row.appointment_date,
    time: row.appointment_time.slice(0, 5),
    phase: row.phase,
    patient: { firstName: row.patient_first_name, lastName: row.patient_last_name, phone: row.patient_phone },
  }));
}
