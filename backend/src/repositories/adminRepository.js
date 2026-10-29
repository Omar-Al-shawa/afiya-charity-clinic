// استعلامات إدارة الاختصاصات والأطباء والطلبات المعلّقة. كلها معلَّمة.
// لا UPDATE ولا DELETE لأي طبيب أو اختصاص موجود (صلاحيات afiyah_app إدراج فقط): كل تعديل أو حذف يمر عبر pending_changes.
// طلب التغيير يُدرَج بأربعة أعمدة فقط؛ created_at وexecute_at تملؤهما القاعدة (execute_at بتقويم دمشق + 14 يوماً بالمشغّل).

// ---------- الاختصاصات ----------

const SPECIALTY_SELECT = `SELECT s.specialty_id, s.specialty_name, s.appointment_duration,
       count(d.doctor_id)::int AS doctors_count,
       (count(*) FILTER (WHERE u.is_active))::int AS active_doctors_count
  FROM public.specialties s
  LEFT JOIN public.doctors d ON d.specialty_id = s.specialty_id
  LEFT JOIN public.users u ON u.user_id = d.user_id`;

export async function listAdminSpecialties(db) {
  const { rows } = await db.query(`${SPECIALTY_SELECT} GROUP BY s.specialty_id ORDER BY s.specialty_id`);
  return rows;
}

export async function findAdminSpecialty(db, specialtyId) {
  const { rows } = await db.query(`${SPECIALTY_SELECT} WHERE s.specialty_id = $1 GROUP BY s.specialty_id`, [specialtyId]);
  return rows[0] ?? null;
}

export async function insertSpecialty(db, { name, appointmentDuration }) {
  const { rows } = await db.query(
    'INSERT INTO public.specialties (specialty_name, appointment_duration) VALUES ($1, $2) RETURNING specialty_id',
    [name, appointmentDuration],
  );
  return rows[0].specialty_id;
}

export async function specialtyExists(db, specialtyId) {
  const { rows } = await db.query('SELECT 1 FROM public.specialties WHERE specialty_id = $1', [specialtyId]);
  return rows.length > 0;
}

// تحقق مسبق (أفضل جهد) من تكرار الاسم لاختصاص آخر؛ القيد الفريد هو المرجع النهائي
export async function specialtyNameTaken(db, name, exceptSpecialtyId) {
  const { rows } = await db.query(
    'SELECT 1 FROM public.specialties WHERE specialty_name = $1 AND specialty_id <> $2',
    [name, exceptSpecialtyId],
  );
  return rows.length > 0;
}

// ---------- الأطباء ----------

const DOCTOR_SELECT = `SELECT d.doctor_id, d.first_name, d.last_name, d.birth_date, d.phone, d.image_url, d.biography,
       d.years_of_experience, d.specialty_id, s.specialty_name, s.appointment_duration, u.email, u.is_active
  FROM public.doctors d
  JOIN public.users u ON u.user_id = d.user_id
  JOIN public.specialties s ON s.specialty_id = d.specialty_id`;

export async function listAdminDoctors(db) {
  const { rows } = await db.query(`${DOCTOR_SELECT} ORDER BY d.doctor_id`);
  return rows;
}

export async function findAdminDoctor(db, doctorId) {
  const { rows } = await db.query(`${DOCTOR_SELECT} WHERE d.doctor_id = $1`, [doctorId]);
  return rows[0] ?? null;
}

// حالة الطبيب وحسابه (للتحقق قبل تسجيل طلب): null إن لم يوجد
export async function findDoctorState(db, doctorId) {
  const { rows } = await db.query(
    `SELECT d.doctor_id, d.user_id, u.is_active
       FROM public.doctors d JOIN public.users u ON u.user_id = d.user_id
      WHERE d.doctor_id = $1`,
    [doctorId],
  );
  return rows[0] ?? null;
}

export async function emailTaken(db, email, exceptUserId) {
  const { rows } = await db.query('SELECT 1 FROM public.users WHERE email = $1 AND user_id <> $2', [email, exceptUserId]);
  return rows.length > 0;
}

// يُستدعى داخل db.withTransaction (READ COMMITTED) فيُنشأ الحساب والطبيب معاً أو لا شيء؛ الدور 'doctor' ثابت في النص
export async function createDoctorAccount(client, { email, passwordHash, doctor }) {
  const user = await client.query(
    `INSERT INTO public.users (email, password_hash, role) VALUES ($1, $2, 'doctor') RETURNING user_id`,
    [email, passwordHash],
  );
  const { rows } = await client.query(
    `INSERT INTO public.doctors (user_id, specialty_id, first_name, last_name, birth_date, phone, image_url, biography, years_of_experience)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING doctor_id`,
    [
      user.rows[0].user_id,
      doctor.specialtyId,
      doctor.firstName,
      doctor.lastName,
      doctor.birthdate,
      doctor.phone,
      doctor.imageUrl,
      doctor.biography,
      doctor.yearsOfExperience,
    ],
  );
  return rows[0].doctor_id;
}

// ---------- الطلبات المعلّقة ----------

const PENDING_SELECT = `SELECT pc.change_id, pc.doctor_id, pc.specialty_id, pc.change_type, pc.new_data, pc.status,
       pc.created_at, pc.execute_at, pc.failure_reason,
       public.clinic_local(pc.execute_at)::date AS effective_date,
       d.first_name AS doctor_first_name, d.last_name AS doctor_last_name, s.specialty_name
  FROM public.pending_changes pc
  LEFT JOIN public.doctors d ON d.doctor_id = pc.doctor_id
  LEFT JOIN public.specialties s ON s.specialty_id = pc.specialty_id`;

const LIST_LIMIT = 500;

export async function listPendingChanges(db, statuses) {
  const { rows } = await db.query(
    `${PENDING_SELECT} WHERE pc.status = ANY($1::text[]) ORDER BY pc.change_id DESC LIMIT ${LIST_LIMIT}`,
    [statuses],
  );
  return rows;
}

export async function findPendingChange(db, changeId) {
  const { rows } = await db.query(`${PENDING_SELECT} WHERE pc.change_id = $1`, [changeId]);
  return rows[0] ?? null;
}

// target: { doctorId } أو { specialtyId }؛ newData كائن للتعديل وغير موجود للحذف
export async function insertPendingChange(db, { doctorId = null, specialtyId = null, changeType, newData }) {
  const { rows } = await db.query(
    `INSERT INTO public.pending_changes (doctor_id, specialty_id, change_type, new_data)
     VALUES ($1, $2, $3, $4::jsonb) RETURNING change_id`,
    [doctorId, specialtyId, changeType, newData === undefined ? null : JSON.stringify(newData)],
  );
  return rows[0].change_id;
}

// الإلغاء عبر الدالة المعتمدة (تأخذ أقفال التنفيذ نفسها، وتُرفض AF122 إن لم يعد الطلب معلّقاً أو حان موعده)
export async function cancelPendingChange(db, changeId) {
  await db.query('SELECT public.cancel_pending_change($1)', [changeId]);
}
