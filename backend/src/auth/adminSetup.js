// منطق إنشاء حساب المدير الوحيد (يستدعيه scripts/create-admin.js فقط؛ لا مسار HTTP لإنشاء مدير).
// لا يُسجَّل شيء هنا؛ ولا تظهر كلمة المرور أو الـ hash في أي رسالة خطأ.
import { exceedsMaxBytes, hashPassword } from './passwords.js';
import { checkEmail } from '../validation/registration.js';

export const ADMIN_PASSWORD_MIN = 12;
export const ADMIN_BCRYPT_COST = 12;

export class AdminSetupError extends Error {
  // code: INVALID_INPUT | ADMIN_EXISTS | EMAIL_TAKEN
  constructor(code, message, fields) {
    super(message);
    this.name = 'AdminSetupError';
    this.code = code;
    this.fields = fields;
  }
}

export function checkAdminPassword(raw) {
  const password = typeof raw === 'string' ? raw : '';
  if ([...password].length < ADMIN_PASSWORD_MIN) {
    return { error: `Administrator password must be at least ${ADMIN_PASSWORD_MIN} characters.` };
  }
  if (exceedsMaxBytes(password)) {
    return { error: 'Administrator password is too long (72 bytes maximum; an Arabic letter takes 2 bytes).' };
  }
  return { value: password };
}

// يعيد { valid, errors, values }؛ البريد يُطبَّع بقواعد التسجيل نفسها (أحرف صغيرة، ASCII، حد أقصى 254)
export function validateAdminInput({ email, password }) {
  const errors = {};
  const values = {};
  const emailResult = checkEmail(email);
  if (emailResult.error) errors.email = 'Enter a valid email address.';
  else values.email = emailResult.value;
  const passwordResult = checkAdminPassword(password);
  if (passwordResult.error) errors.password = passwordResult.error;
  else values.password = passwordResult.value;
  return { valid: Object.keys(errors).length === 0, errors, values };
}

export async function adminExists(db) {
  const { rows } = await db.query(`SELECT 1 FROM public.users WHERE role = 'admin' LIMIT 1`);
  return rows.length > 0;
}

const adminExistsError = () => new AdminSetupError('ADMIN_EXISTS', 'An administrator account already exists. Nothing was changed.');

// ينشئ المدير إن لم يوجد مدير. لا يعدّل حساباً موجوداً أبداً. الفهرس الفريد users_one_admin هو الحارس الأخير عند السباق.
export async function createAdminAccount(db, { email, password, bcryptCost = ADMIN_BCRYPT_COST }) {
  const { valid, errors, values } = validateAdminInput({ email, password });
  if (!valid) throw new AdminSetupError('INVALID_INPUT', 'Invalid administrator details.', errors);

  if (await adminExists(db)) throw adminExistsError();

  const passwordHash = await hashPassword(values.password, bcryptCost);
  try {
    const userId = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.users (email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING user_id`,
        [values.email, passwordHash],
      );
      return rows[0].user_id;
    });
    return { userId, email: values.email };
  } catch (err) {
    if (err?.code === '23505' && err.constraint === 'users_one_admin') throw adminExistsError();
    if (err?.code === '23505' && err.constraint === 'users_email_key') {
      throw new AdminSetupError('EMAIL_TAKEN', 'This email address is already registered to another account. Nothing was changed.');
    }
    throw err;
  }
}
