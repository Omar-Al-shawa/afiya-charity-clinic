// التحقق من تسجيل المريض في الخادم: نفس قواعد الواجهة (utils/registrationValidation.js) ونفس رسائلها العربية.
import { PASSWORD_MAX_BYTES, exceedsMaxBytes } from '../auth/passwords.js';
import { damascusToday } from '../utils/schedule.js';

const NAME_MIN = 2;
const NAME_MAX = 50;
const PASSWORD_MIN = 8;
const EMAIL_MAX = 254;
const ADDRESS_MAX = 200;
const MIN_BIRTHDATE = '1900-01-01';
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BLOOD_TYPE_UNKNOWN = 'unknown';

export const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-]+[\p{L}\p{M}]+)*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const ASCII_PATTERN = /^[\x21-\x7e]+$/; // بريد ASCII فقط: يضمن أن lower() في JS وPostgreSQL متطابقان (قيد users_email_ck)
const PHONE_PATTERN = /^09\d{8}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const str = (value) => (typeof value === 'string' ? value : '');
const countChars = (text) => [...text].length;

export const normalizeDigits = (value) =>
  value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

export const normalizeName = (value) => value.trim().replace(/\s+/g, ' ');

function isRealDate(value) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function checkName(raw, requiredMessage) {
  const value = normalizeName(str(raw));
  if (!value) return { error: requiredMessage };
  const length = countChars(value);
  if (length < NAME_MIN || length > NAME_MAX || !NAME_PATTERN.test(value)) {
    return { error: `يجب أن يكون الاسم من حرفين إلى ${NAME_MAX} حرفاً، دون أرقام أو رموز.` };
  }
  return { value };
}

// الحقول التالية مشتركة مع تعديل الملف الشخصي (validation/profile.js)؛ كل منها يعيد { value } أو { error }
// minLength الافتراضي 8 (المريض والطبيب)؛ المدير يمرّر حدّه الأعلى عند تغيير كلمة مروره
export function checkPassword(raw, minLength = PASSWORD_MIN) {
  const password = str(raw);
  if (!password) return { error: 'أدخل كلمة المرور.' };
  if (countChars(password) < minLength) {
    return { error: `كلمة المرور يجب ألا تقل عن ${minLength} ${minLength <= 10 ? 'أحرف' : 'حرفاً'}.` };
  }
  if (exceedsMaxBytes(password)) {
    return { error: `كلمة المرور طويلة جداً (الحد الأقصى ${PASSWORD_MAX_BYTES} بايت؛ الحرف العربي يشغل بايتين).` };
  }
  return { value: password };
}

export function checkPhone(raw) {
  const phone = normalizeDigits(str(raw)).trim();
  if (!phone) return { error: 'أدخل رقم الهاتف.' };
  if (!PHONE_PATTERN.test(phone)) return { error: 'أدخل رقماً من 10 أرقام يبدأ بـ 09، مثل 0912345678.' };
  return { value: phone };
}

export function checkAddress(raw) {
  const address = str(raw).trim();
  if (!address) return { error: 'أدخل عنوان السكن.' };
  if (countChars(address) > ADDRESS_MAX) return { error: `العنوان طويل جداً (${ADDRESS_MAX} حرفاً كحد أقصى).` };
  return { value: address };
}

export function checkEmail(raw) {
  const email = str(raw).trim().toLowerCase();
  if (!email) return { error: 'أدخل البريد الإلكتروني.' };
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email) || !ASCII_PATTERN.test(email)) {
    return { error: 'أدخل بريداً إلكترونياً صحيحاً.' };
  }
  return { value: email };
}

export function checkBirthdate(raw, now = new Date()) {
  const birthdate = str(raw);
  if (!birthdate) return { error: 'أدخل تاريخ الميلاد.' };
  if (!isRealDate(birthdate)) return { error: 'أدخل تاريخ ميلاد صحيحاً.' };
  if (birthdate < MIN_BIRTHDATE) return { error: 'يجب ألا يكون تاريخ الميلاد قبل عام 1900.' };
  if (birthdate >= damascusToday(now)) return { error: 'يجب أن يكون تاريخ الميلاد في الماضي.' };
  return { value: birthdate };
}

// يعيد { valid, errors, values }؛ values مطبَّعة وجاهزة للإدراج (bloodType: القيمة أو null)
export function validateRegistration(body, now = new Date()) {
  const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const values = {};
  const set = (field, result) => {
    if (result.error) errors[field] = result.error;
    else values[field] = result.value;
  };

  set('firstName', checkName(input.firstName, 'أدخل الاسم الأول.'));
  set('lastName', checkName(input.lastName, 'أدخل اسم العائلة.'));

  set('email', checkEmail(input.email));

  set('password', checkPassword(input.password));

  set('phone', checkPhone(input.phone));

  set('birthdate', checkBirthdate(input.birthdate, now));

  set('address', checkAddress(input.address));

  if (input.gender === 'male' || input.gender === 'female') values.gender = input.gender;
  else errors.gender = 'اختر الجنس.';

  // «لا أعلم» أو عدم الاختيار تُخزَّن NULL؛ ولا تتحول أبداً إلى زمرة فعلية
  const blood = input.bloodType;
  if (blood === undefined || blood === null || blood === '' || blood === BLOOD_TYPE_UNKNOWN) values.bloodType = null;
  else if (BLOOD_TYPES.includes(blood)) values.bloodType = blood;
  else errors.bloodType = 'اختر زمرة الدم.';

  return { valid: Object.keys(errors).length === 0, errors, values };
}
