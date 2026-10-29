// تحقق نماذج المدير في الواجهة فقط (الخادم هو المرجع؛ أخطاؤه تُربط بالحقول).
// الأسماء والهاتف وتاريخ الميلاد وكلمة المرور تعيد استعمال مدقّقات التسجيل (A8) نفسها.
// كل مدقِّق يعيد رسالة الخطأ بالعربية، أو '' إن كانت القيمة صحيحة.
import { ApiError, NETWORK_ERROR_MESSAGE } from '../api/http';
import {
  normalizeDigits,
  normalizeName,
  normalizePhone,
  validateBirthdate,
  validateFirstName,
  validateLastName,
  validateNewPassword,
  validatePhone,
} from './registrationValidation';
import { validateEmail } from './validation';

export const SPECIALTY_NAME_MIN = 2;
export const SPECIALTY_NAME_MAX = 100;
export const DURATION_MIN = 1;
export const DURATION_MAX = 480;
export const BIOGRAPHY_MAX = 2000;
export const YEARS_MAX = 60;
const EMAIL_MAX = 254;
const IMAGE_URL_MAX = 500;
const PASSWORD_MAX_BYTES = 72; // حد bcrypt كما في الخادم

export const SPECIALTY_FIELDS = ['name', 'appointmentDuration'];
// ترتيب الحقول يحدد أول حقل غير صالح يُنقل إليه التركيز
export const DOCTOR_CREATE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'password',
  'phone',
  'birthdate',
  'specialtyId',
  'imageUrl',
  'biography',
  'yearsOfExperience',
];
// الاختصاص ثابت بعد الإنشاء فلا يدخل نموذج التعديل
export const DOCTOR_EDIT_FIELDS = DOCTOR_CREATE_FIELDS.filter((field) => field !== 'password' && field !== 'specialtyId');

const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-]+[\p{L}\p{M}]+)*$/u;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const countChars = (text) => [...text].length;

// ---------- التطبيع ----------

export function normalizeValue(field, value) {
  switch (field) {
    case 'firstName':
    case 'lastName':
    case 'name':
      return normalizeName(value);
    case 'phone':
      return normalizePhone(value);
    case 'appointmentDuration':
    case 'yearsOfExperience':
      return normalizeDigits(value).trim();
    case 'email':
    case 'imageUrl':
    case 'biography':
      return String(value ?? '').trim();
    default:
      return value;
  }
}

// ---------- المدقِّقات ----------

export function validateSpecialtyName(value) {
  const name = normalizeName(value);
  if (!name) return 'أدخل اسم الاختصاص.';
  const length = countChars(name);
  if (length < SPECIALTY_NAME_MIN || length > SPECIALTY_NAME_MAX || !NAME_PATTERN.test(name)) {
    return `اسم الاختصاص من حرفين إلى ${SPECIALTY_NAME_MAX} حرف: حروف ومسافات وشرطات فقط.`;
  }
  return '';
}

export function validateDuration(value) {
  const text = normalizeDigits(value).trim();
  if (!text) return 'أدخل مدة الموعد.';
  const number = /^\d{1,9}$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(number) || number < DURATION_MIN || number > DURATION_MAX) {
    return `مدة الموعد عدد صحيح من ${DURATION_MIN} إلى ${DURATION_MAX} دقيقة.`;
  }
  return '';
}

function validateAdminEmail(value) {
  const message = validateEmail(value);
  if (message) return message;
  return String(value).trim().length > EMAIL_MAX ? 'أدخل بريداً إلكترونياً صحيحاً.' : '';
}

function validateInitialPassword(value) {
  const message = validateNewPassword(value);
  if (message) return message;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return `كلمة المرور طويلة جداً (الحد الأقصى ${PASSWORD_MAX_BYTES} بايت؛ الحرف العربي يشغل بايتين).`;
  }
  return '';
}

// اختياري: فارغ، أو مسار نسبي للجذر يبدأ بـ / (لا // ولا \ ولا ..)، أو رابط https بلا بيانات اعتماد؛ حتى 500 حرف
export function validateImageUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return '';
  const message = 'رابط الصورة غير صالح: مسار يبدأ بـ / أو رابط https.';
  if (countChars(url) > IMAGE_URL_MAX || /\s/.test(url) || CONTROL_CHARS.test(url)) return message;
  if (url.startsWith('/')) {
    return !url.startsWith('//') && !url.includes('\\') && !/(^|\/)\.\.(\/|$)/.test(url) ? '' : message;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password ? '' : message;
  } catch {
    return message;
  }
}

export function validateBiography(value) {
  const text = String(value ?? '').trim();
  return countChars(text) > BIOGRAPHY_MAX ? `السيرة طويلة جداً (${BIOGRAPHY_MAX} حرفاً كحد أقصى).` : '';
}

export function validateYears(value) {
  const text = normalizeDigits(value).trim();
  if (!text) return '';
  const number = /^\d{1,9}$/.test(text) ? Number(text) : NaN;
  return Number.isInteger(number) && number >= 0 && number <= YEARS_MAX ? '' : `سنوات الخبرة عدد صحيح من 0 إلى ${YEARS_MAX}.`;
}

const VALIDATORS = {
  name: validateSpecialtyName,
  appointmentDuration: validateDuration,
  firstName: validateFirstName,
  lastName: validateLastName,
  email: validateAdminEmail,
  password: validateInitialPassword,
  phone: validatePhone,
  birthdate: (value) => validateBirthdate(value),
  specialtyId: (value) => (value ? '' : 'اختر الاختصاص.'),
  imageUrl: validateImageUrl,
  biography: validateBiography,
  yearsOfExperience: validateYears,
};

export function validateAdminField(field, value) {
  return VALIDATORS[field](value);
}

// يعيد { [field]: رسالة أو '' } لكل حقل في القائمة
export function validateAdminForm(fields, values) {
  return Object.fromEntries(fields.map((field) => [field, validateAdminField(field, values[field])]));
}

export const emptyErrors = (fields) => Object.fromEntries(fields.map((field) => [field, '']));
export const firstInvalid = (fields, errors) => fields.find((field) => errors[field]);

// ---------- قيم النماذج وما يُرسل ----------

export const EMPTY_SPECIALTY_FORM = { name: '', appointmentDuration: '' };
export const EMPTY_DOCTOR_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  birthdate: '',
  specialtyId: '',
  imageUrl: '',
  biography: '',
  yearsOfExperience: '',
};

export const specialtyToForm = (specialty) => ({
  name: specialty.name,
  appointmentDuration: String(specialty.appointmentDuration),
});

export const doctorToForm = (doctor) => ({
  firstName: doctor.firstName,
  lastName: doctor.lastName,
  email: doctor.email,
  phone: doctor.phone,
  birthdate: doctor.birthdate,
  imageUrl: doctor.imageUrl ?? '',
  biography: doctor.biography ?? '',
  yearsOfExperience: doctor.yearsOfExperience === null || doctor.yearsOfExperience === undefined ? '' : String(doctor.yearsOfExperience),
});

const sameValue = (field, a, b) => {
  const left = normalizeValue(field, a);
  const right = normalizeValue(field, b);
  return field === 'email' ? left.toLowerCase() === right.toLowerCase() : left === right;
};

// الحقول المتغيّرة فقط (مطبَّعة) كما ينتظرها PATCH؛ كائن فارغ = لا تغيير
export function changedFields(fields, original, values) {
  const changes = {};
  for (const field of fields) {
    if (!sameValue(field, original[field], values[field])) changes[field] = normalizeValue(field, values[field]);
  }
  return changes;
}

export function specialtyChanges(specialty, values) {
  const changes = changedFields(SPECIALTY_FIELDS, specialtyToForm(specialty), values);
  if ('appointmentDuration' in changes) changes.appointmentDuration = Number(changes.appointmentDuration);
  return changes;
}

export const doctorChanges = (doctor, values) => changedFields(DOCTOR_EDIT_FIELDS, doctorToForm(doctor), values);

// جسم POST /api/admin/doctors: كلمة المرور كما أُدخلت (لا تُقصّ)، والاختياريات الفارغة لا تُرسل
export function doctorCreatePayload(values) {
  const payload = {
    firstName: normalizeValue('firstName', values.firstName),
    lastName: normalizeValue('lastName', values.lastName),
    email: normalizeValue('email', values.email),
    password: values.password,
    phone: normalizeValue('phone', values.phone),
    birthdate: values.birthdate,
    specialtyId: Number(values.specialtyId),
  };
  for (const field of ['imageUrl', 'biography', 'yearsOfExperience']) {
    const value = normalizeValue(field, values[field]);
    if (value) payload[field] = value;
  }
  return payload;
}

export function specialtyCreatePayload(values) {
  return {
    name: normalizeValue('name', values.name),
    appointmentDuration: Number(normalizeValue('appointmentDuration', values.appointmentDuration)),
  };
}

// رسالة الخطأ المعروضة. عند انقطاع الشبكة أثناء كتابة قد يكون الخادم استلم الطلب فعلاً، فيُنبَّه المدير
export function adminErrorMessage(error, { write = false } = {}) {
  if (!(error instanceof ApiError)) return NETWORK_ERROR_MESSAGE;
  if (write && error.status === 0) return `${error.message} قد يكون الطلب وصل؛ حدّث الصفحة وتحقق قبل إعادة المحاولة.`;
  return error.message;
}

// أخطاء الحقول القادمة من الخادم (ضمن الحقول المعروفة فقط)؛ null إن لم توجد
export function serverFieldErrors(error, fields) {
  if (!(error instanceof ApiError) || !error.fields) return null;
  const mapped = Object.fromEntries(
    fields.map((field) => [field, typeof error.fields[field] === 'string' ? error.fields[field] : '']),
  );
  return fields.some((field) => mapped[field]) ? mapped : null;
}
