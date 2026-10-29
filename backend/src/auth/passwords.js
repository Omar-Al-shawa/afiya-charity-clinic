import bcrypt from 'bcrypt';

// bcrypt يتجاهل ما بعد 72 بايت؛ التسجيل يرفض الأطول، والدخول يعامله كبيانات خاطئة (لا قص صامت)
export const PASSWORD_MAX_BYTES = 72;

export const hashPassword = (password, cost) => bcrypt.hash(password, cost);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
export const exceedsMaxBytes = (password) => Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES;
