// تحقق حقول تسجيل المريض (A8) في الواجهة فقط؛ الخادم هو المرجع الفعلي لاحقاً.
// كل مدقِّق يعيد رسالة الخطأ بالعربية، أو '' إن كانت القيمة صحيحة.
// التواريخ نصوص "YYYY-MM-DD" بتوقيت دمشق (utils/schedule.js)، ولا تُحوَّل إلى Date محلي.
import { addDays, getDamascusNow, parseDate } from './schedule';
import { validateEmail } from './validation';

export const GENDERS = [
  { value: 'male', label: 'ذكر' },
  { value: 'female', label: 'أنثى' },
];
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
// «لا أعلم»: خيار مقبول لمن لا يعرف زمرته؛ قيمة مستقلة وليست زمرة دم ولا تُحوَّل إلى واحدة
export const BLOOD_TYPE_UNKNOWN = 'unknown';

// ترتيب الحقول: يحدد أول حقل غير صالح يُنقل إليه التركيز
export const FIELD_ORDER = [
  'firstName',
  'lastName',
  'email',
  'password',
  'phone',
  'birthdate',
  'address',
  'gender',
  'bloodType',
];

export const NAME_MIN = 2;
export const NAME_MAX = 50;
export const PASSWORD_MIN = 8;
export const ADDRESS_MAX = 200;
export const MIN_BIRTHDATE = '1900-01-01';

// آخر تاريخ ميلاد مسموح: أمس بتوقيت دمشق (يجب أن يسبق اليوم)
export function getMaxBirthdate(now = new Date()) {
  return addDays(getDamascusNow(now).date, -1);
}

const countChars = (text) => [...text].length;

// ---------- التطبيع (يُطبَّق على الخروج من الحقل وقبل التحقق) ----------

// ٠-٩ (عربية-هندية) و۰-۹ (فارسية) ← 0-9
export function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizePhone(value) {
  return normalizeDigits(value).trim();
}

// قص الأطراف وتوحيد المسافات الداخلية
export function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeField(field, value) {
  switch (field) {
    case 'firstName':
    case 'lastName':
      return normalizeName(value);
    case 'email':
    case 'address':
      return String(value ?? '').trim();
    case 'phone':
      return normalizePhone(value);
    default:
      return value;
  }
}

// ---------- المدقِّقات ----------

// حروف يونيكود (عربية ولاتينية) مع علامات التشكيل، وبينها مسافة أو شرطة أو فاصلة عليا؛ بلا أرقام أو رموز أخرى
const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-]+[\p{L}\p{M}]+)*$/u;

function validateName(value, requiredMessage) {
  const name = normalizeName(value);
  if (!name) return requiredMessage;
  const length = countChars(name);
  if (length < NAME_MIN || length > NAME_MAX || !NAME_PATTERN.test(name)) {
    return `يجب أن يكون الاسم من حرفين إلى ${NAME_MAX} حرفاً، دون أرقام أو رموز.`;
  }
  return '';
}

export const validateFirstName = (value) => validateName(value, 'أدخل الاسم الأول.');
export const validateLastName = (value) => validateName(value, 'أدخل اسم العائلة.');

// منفصل عن validatePassword الخاص بالدخول (الذي يرفض الفارغ فقط)؛ لا قصّ ولا قواعد تعقيد
export function validateNewPassword(value) {
  if (!value) return 'أدخل كلمة المرور.';
  if (countChars(value) < PASSWORD_MIN) return `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN} أحرف.`;
  return '';
}

const PHONE_PATTERN = /^09\d{8}$/;

export function validatePhone(value) {
  const phone = normalizePhone(value);
  if (!phone) return 'أدخل رقم الهاتف.';
  if (!PHONE_PATTERN.test(phone)) return 'أدخل رقماً من 10 أرقام يبدأ بـ 09، مثل 0912345678.';
  return '';
}

// badInput: المتصفح يعيد قيمة فارغة لتاريخ مكتوب جزئياً؛ نميّزه عن الحقل الفارغ
export function validateBirthdate(value, { badInput = false, now = new Date() } = {}) {
  if (!value) return badInput ? 'أدخل تاريخ ميلاد صحيحاً.' : 'أدخل تاريخ الميلاد.';
  if (!parseDate(value)) return 'أدخل تاريخ ميلاد صحيحاً.';
  if (value < MIN_BIRTHDATE) return 'يجب ألا يكون تاريخ الميلاد قبل عام 1900.';
  if (value >= getDamascusNow(now).date) return 'يجب أن يكون تاريخ الميلاد في الماضي.';
  return '';
}

export function validateAddress(value) {
  const address = String(value ?? '').trim();
  if (!address) return 'أدخل عنوان السكن.';
  if (countChars(address) > ADDRESS_MAX) return `العنوان طويل جداً (${ADDRESS_MAX} حرفاً كحد أقصى).`;
  return '';
}

export function validateGender(value) {
  return GENDERS.some((g) => g.value === value) ? '' : 'اختر الجنس.';
}

// اختيارية (التقرير): تُترك دون اختيار أو «لا أعلم»، وفي الحالتين يخزّن الخادم NULL؛ أي قيمة أخرى غير مقبولة
export function validateBloodType(value) {
  return value === '' || BLOOD_TYPES.includes(value) || value === BLOOD_TYPE_UNKNOWN ? '' : 'اختر زمرة الدم.';
}

const VALIDATORS = {
  firstName: validateFirstName,
  lastName: validateLastName,
  email: validateEmail,
  password: validateNewPassword,
  phone: validatePhone,
  birthdate: validateBirthdate,
  address: validateAddress,
  gender: validateGender,
  bloodType: validateBloodType,
};

// ctx: { badInput, now } للتاريخ فقط
export function validateField(field, value, ctx) {
  return VALIDATORS[field](value, ctx);
}

export function validateRegistration(values, ctx) {
  return Object.fromEntries(FIELD_ORDER.map((field) => [field, validateField(field, values[field], ctx)]));
}
