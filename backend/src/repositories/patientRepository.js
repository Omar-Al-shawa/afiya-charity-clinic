// الملف الشخصي للمريض: صلاحيات afiyah_app على patients هي UPDATE لأعمدة الملف الشخصي فقط (لا user_id ولا patient_id).
// التعديل يقتصر على أربعة أعمدة؛ والبريد وتاريخ الميلاد والجنس وزمرة الدم للقراءة فقط هنا.

const PROFILE_COLUMNS = 'first_name, last_name, phone, birth_date, address, gender, blood_type';

export async function findPatientProfile(db, userId) {
  const { rows } = await db.query(`SELECT ${PROFILE_COLUMNS} FROM public.patients WHERE user_id = $1`, [userId]);
  return rows[0] ?? null;
}

// يعيد الصف المحدَّث أو null إن لم يكن للحساب ملف مريض
export async function updatePatientProfile(db, userId, { firstName, lastName, phone, address }) {
  const { rows } = await db.query(
    `UPDATE public.patients
        SET first_name = $2, last_name = $3, phone = $4, address = $5
      WHERE user_id = $1
      RETURNING ${PROFILE_COLUMNS}`,
    [userId, firstName, lastName, phone, address],
  );
  return rows[0] ?? null;
}
