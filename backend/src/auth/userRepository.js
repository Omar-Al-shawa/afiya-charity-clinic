// كل الاستعلامات معلَّمة (parameterized). صلاحيات afiyah_app: إدراج users(email, password_hash, role) وpatients فقط.

const ACCOUNT_COLUMNS = `u.user_id, u.email, u.role, u.is_active,
       COALESCE(p.first_name, d.first_name) AS first_name,
       COALESCE(p.last_name, d.last_name) AS last_name`;
const ACCOUNT_JOINS = `FROM public.users u
  LEFT JOIN public.patients p ON p.user_id = u.user_id
  LEFT JOIN public.doctors d ON d.user_id = u.user_id`;

// للدخول فقط: يتضمن password_hash ولا يُعاد إلى العميل أبداً
export async function findAccountByEmail(db, email) {
  const { rows } = await db.query(
    `SELECT ${ACCOUNT_COLUMNS}, u.password_hash ${ACCOUNT_JOINS} WHERE u.email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findAccountById(db, userId) {
  const { rows } = await db.query(`SELECT ${ACCOUNT_COLUMNS} ${ACCOUNT_JOINS} WHERE u.user_id = $1`, [userId]);
  return rows[0] ?? null;
}

// الشكل الآمن للواجهة (بلا password_hash ولا is_active)
export function toPublicUser(row) {
  return {
    id: row.user_id,
    email: row.email,
    role: row.role,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
  };
}

// يُستدعى داخل db.withTransaction (READ COMMITTED) بعميل المعاملة؛ الدور 'patient' ثابت في النص وليس معاملاً
export async function createPatientAccount(client, { email, passwordHash, patient }) {
  const { rows } = await client.query(
    `INSERT INTO public.users (email, password_hash, role) VALUES ($1, $2, 'patient') RETURNING user_id`,
    [email, passwordHash],
  );
  const userId = rows[0].user_id;
  await client.query(
    `INSERT INTO public.patients (user_id, first_name, last_name, phone, birth_date, address, gender, blood_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      patient.firstName,
      patient.lastName,
      patient.phone,
      patient.birthdate,
      patient.address,
      patient.gender,
      patient.bloodType,
    ],
  );
  return userId;
}

// تغيير كلمة المرور: يقرأ hash المستخدم نفسه ويحدّث password_hash فقط (الصلاحية الوحيدة على users)؛ لا يُعاد إلى العميل أبداً
export async function findPasswordHash(db, userId) {
  const { rows } = await db.query('SELECT password_hash FROM public.users WHERE user_id = $1', [userId]);
  return rows[0]?.password_hash ?? null;
}

export async function updatePasswordHash(db, userId, passwordHash) {
  await db.query('UPDATE public.users SET password_hash = $2 WHERE user_id = $1', [userId, passwordHash]);
}
