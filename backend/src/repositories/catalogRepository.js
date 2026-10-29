// استعلامات القراءة العامة فقط (SELECT). لا تُختار أي حقول خاصة: لا هاتف ولا بريد ولا تاريخ الميلاد الخام للعرض.
// السيرة (النبذة التعريفية) عامة لكنها تُختار في استعلام الطبيب الواحد فقط (findDoctor) لا في القائمة.
// التواريخ تعود نصوصاً "YYYY-MM-DD" بفضل محلّلات النوع في db/pool.js. الطبيب الظاهر هو من حسابه is_active فقط.

export async function listSpecialties(db) {
  const { rows } = await db.query(
    `SELECT s.specialty_id, s.specialty_name, s.appointment_duration, count(u.user_id)::int AS doctors_count
       FROM public.specialties s
       LEFT JOIN public.doctors d ON d.specialty_id = s.specialty_id
       LEFT JOIN public.users u ON u.user_id = d.user_id AND u.is_active
      GROUP BY s.specialty_id
      ORDER BY s.specialty_id`,
  );
  return rows;
}

const DOCTOR_COLUMNS = `d.doctor_id, d.first_name, d.last_name, d.birth_date, d.years_of_experience, d.image_url,
       d.specialty_id, s.specialty_name, s.appointment_duration`;
const DOCTOR_FROM = `FROM public.doctors d
  JOIN public.users u ON u.user_id = d.user_id AND u.is_active
  JOIN public.specialties s ON s.specialty_id = d.specialty_id`;

// specialtyId: رقم أو null (بلا تصفية)
export async function listDoctors(db, specialtyId) {
  const { rows } = await db.query(
    `SELECT ${DOCTOR_COLUMNS} ${DOCTOR_FROM} WHERE ($1::int IS NULL OR d.specialty_id = $1::int) ORDER BY d.doctor_id`,
    [specialtyId],
  );
  return rows;
}

export async function findDoctor(db, doctorId) {
  const { rows } = await db.query(`SELECT ${DOCTOR_COLUMNS}, d.biography ${DOCTOR_FROM} WHERE d.doctor_id = $1`, [doctorId]);
  return rows[0] ?? null;
}

// مدة اختصاص الطبيب الحالية وblock_from: أبكر تاريخ سريان (بتوقيت دمشق) لتغيير pending على الطبيب أو اختصاصه (قاعدة AF106)
export async function findAvailabilityContext(db, doctorId) {
  const { rows } = await db.query(
    `SELECT s.appointment_duration,
            (SELECT min(public.clinic_local(pc.execute_at)::date)
               FROM public.pending_changes pc
              WHERE pc.status = 'pending' AND (pc.doctor_id = d.doctor_id OR pc.specialty_id = d.specialty_id)) AS block_from
       FROM public.doctors d
       JOIN public.users u ON u.user_id = d.user_id AND u.is_active
       JOIN public.specialties s ON s.specialty_id = d.specialty_id
      WHERE d.doctor_id = $1`,
    [doctorId],
  );
  return rows[0] ?? null;
}

// حجوزات الطبيب القائمة فقط (status = 'booked')؛ الملغاة لا تحجب أي موعد. التاريخ والوقت فقط، بلا أي بيانات مريض
export async function listBookedSlots(db, doctorId, fromDate, toDate) {
  const { rows } = await db.query(
    `SELECT appointment_date, appointment_time
       FROM public.appointments
      WHERE doctor_id = $1 AND status = 'booked' AND appointment_date BETWEEN $2::date AND $3::date`,
    [doctorId, fromDate, toDate],
  );
  return rows.map((row) => ({ date: row.appointment_date, time: row.appointment_time }));
}
