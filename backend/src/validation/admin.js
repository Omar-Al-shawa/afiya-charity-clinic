// تحقق مدخلات المدير: إنشاء الاختصاصات والأطباء فوراً، وطلبات التعديل المؤجَّلة (مفاتيح مسموحة فقط؛ وما سواها يُتجاهل).
// قواعد الأسماء والهاتف والبريد وكلمة المرور وتاريخ الميلاد هي قواعد التسجيل نفسها.
import { parsePositiveInt } from '../utils/params.js';
import { checkBirthdate, checkEmail, checkName, checkPassword, checkPhone, normalizeName } from './registration.js';

const SPECIALTY_NAME_MIN = 2;
const SPECIALTY_NAME_MAX = 100;
const DURATION_MIN = 1; // حدّا قيد specialties_duration_ck
const DURATION_MAX = 480;
const IMAGE_URL_MAX = 500;
const BIOGRAPHY_MAX = 2000;
const YEARS_MAX = 60;

const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-]+[\p{L}\p{M}]+)*$/u;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const asObject = (body) => (body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {});
const has = (input, key) => Object.hasOwn(input, key);
const countChars = (text) => [...text].length;

export function checkSpecialtyName(raw) {
  const name = typeof raw === 'string' ? normalizeName(raw) : '';
  if (!name) return { error: 'أدخل اسم الاختصاص.' };
  const length = countChars(name);
  if (length < SPECIALTY_NAME_MIN || length > SPECIALTY_NAME_MAX || !NAME_PATTERN.test(name)) {
    return { error: `اسم الاختصاص من حرفين إلى ${SPECIALTY_NAME_MAX} حرف: حروف ومسافات وشرطات فقط.` };
  }
  return { value: name };
}

// عدد صحيح (رقم أو نص رقمي) ضمن مدى؛ وإلا خطأ
function checkInteger(raw, min, max, message) {
  const value = typeof raw === 'string' && /^\d{1,9}$/.test(raw) ? Number(raw) : raw;
  return Number.isInteger(value) && value >= min && value <= max ? { value } : { error: message };
}

export function checkDuration(raw) {
  if (raw === undefined || raw === null || raw === '') return { error: 'أدخل مدة الموعد.' };
  return checkInteger(raw, DURATION_MIN, DURATION_MAX, `مدة الموعد عدد صحيح من ${DURATION_MIN} إلى ${DURATION_MAX} دقيقة.`);
}

// null (أو فارغ) أو مسار نسبي للجذر يبدأ بـ / (لا // ولا ..) أو رابط HTTPS بلا بيانات اعتماد؛ حتى 500 حرف
export function checkImageUrl(raw) {
  if (raw === undefined || raw === null) return { value: null };
  const message = 'رابط الصورة غير صالح: مسار يبدأ بـ / أو رابط https.';
  if (typeof raw !== 'string') return { error: message };
  const url = raw.trim();
  if (!url) return { value: null };
  if (countChars(url) > IMAGE_URL_MAX || /\s/.test(url) || CONTROL_CHARS.test(url)) return { error: message };
  if (url.startsWith('/')) {
    return !url.startsWith('//') && !url.includes('\\') && !/(^|\/)\.\.(\/|$)/.test(url) ? { value: url } : { error: message };
  }
  try {
    const parsed = new URL(url);
    const ok = parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password;
    return ok ? { value: url } : { error: message };
  } catch {
    return { error: message };
  }
}

export function checkBiography(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: 'السيرة غير صالحة.' };
  const text = raw.trim();
  if (!text) return { value: null };
  return countChars(text) > BIOGRAPHY_MAX ? { error: `السيرة طويلة جداً (${BIOGRAPHY_MAX} حرفاً كحد أقصى).` } : { value: text };
}

export function checkYears(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  return checkInteger(raw, 0, YEARS_MAX, `سنوات الخبرة عدد صحيح من 0 إلى ${YEARS_MAX}.`);
}

function collect() {
  const errors = {};
  const values = {};
  return {
    errors,
    values,
    set(field, result) {
      if (result.error) errors[field] = result.error;
      else values[field] = result.value;
    },
  };
}
const outcome = ({ errors, values }) => ({ valid: Object.keys(errors).length === 0, errors, values });

// ---------- إنشاء فوري ----------

export function validateSpecialtyCreate(body) {
  const input = asObject(body);
  const c = collect();
  c.set('name', checkSpecialtyName(input.name));
  c.set('appointmentDuration', checkDuration(input.appointmentDuration));
  return outcome(c);
}

// كلمة مرور الدخول الأولية يحددها المدير (تُجزّأ بـ bcrypt ولا تُعاد)
export function validateDoctorCreate(body, now = new Date()) {
  const input = asObject(body);
  const c = collect();
  c.set('firstName', checkName(input.firstName, 'أدخل الاسم الأول.'));
  c.set('lastName', checkName(input.lastName, 'أدخل اسم العائلة.'));
  c.set('email', checkEmail(input.email));
  c.set('password', checkPassword(input.password));
  c.set('phone', checkPhone(input.phone));
  c.set('birthdate', checkBirthdate(input.birthdate, now));
  const specialtyId = typeof input.specialtyId === 'number' ? String(input.specialtyId) : input.specialtyId;
  c.set('specialtyId', parsePositiveInt(specialtyId) === null ? { error: 'اختر الاختصاص.' } : { value: parsePositiveInt(specialtyId) });
  c.set('imageUrl', checkImageUrl(input.imageUrl));
  c.set('biography', checkBiography(input.biography));
  c.set('yearsOfExperience', checkYears(input.yearsOfExperience));
  return outcome(c);
}

// ---------- طلبات التعديل المؤجَّلة: تُرجع newData بمفاتيح الأعمدة (snake_case) كما يطبّقها المنفِّذ ----------

const NO_FIELDS = { body: 'أرسل حقلاً واحداً على الأقل للتعديل.' };

export function validateSpecialtyChange(body) {
  const input = asObject(body);
  const c = collect();
  const data = {};
  if (has(input, 'name')) {
    c.set('name', checkSpecialtyName(input.name));
    if (c.values.name) data.specialty_name = c.values.name;
  }
  if (has(input, 'appointmentDuration')) {
    c.set('appointmentDuration', checkDuration(input.appointmentDuration));
    if (c.values.appointmentDuration !== undefined) data.appointment_duration = c.values.appointmentDuration;
  }
  if (Object.keys(c.errors).length === 0 && Object.keys(data).length === 0) c.errors.body = NO_FIELDS.body;
  return { valid: Object.keys(c.errors).length === 0, errors: c.errors, newData: data };
}

// اختصاص الطبيب ثابت بعد الإنشاء: specialtyId يُرفض صراحةً
export function validateDoctorChange(body, now = new Date()) {
  const input = asObject(body);
  const c = collect();
  const data = {};
  if (has(input, 'specialtyId')) c.errors.specialtyId = 'لا يمكن تغيير اختصاص الطبيب.';

  const take = (key, column, result) => {
    c.set(key, result);
    if (!c.errors[key]) data[column] = c.values[key];
  };
  if (has(input, 'firstName')) take('firstName', 'first_name', checkName(input.firstName, 'أدخل الاسم الأول.'));
  if (has(input, 'lastName')) take('lastName', 'last_name', checkName(input.lastName, 'أدخل اسم العائلة.'));
  if (has(input, 'phone')) take('phone', 'phone', checkPhone(input.phone));
  if (has(input, 'email')) take('email', 'email', checkEmail(input.email));
  if (has(input, 'birthdate')) take('birthdate', 'birth_date', checkBirthdate(input.birthdate, now));
  if (has(input, 'imageUrl')) take('imageUrl', 'image_url', checkImageUrl(input.imageUrl));
  if (has(input, 'biography')) take('biography', 'biography', checkBiography(input.biography));
  if (has(input, 'yearsOfExperience')) take('yearsOfExperience', 'years_of_experience', checkYears(input.yearsOfExperience));

  if (Object.keys(c.errors).length === 0 && Object.keys(data).length === 0) c.errors.body = NO_FIELDS.body;
  return { valid: Object.keys(c.errors).length === 0, errors: c.errors, newData: data };
}

export const PENDING_STATUS_FILTERS = ['pending', 'failed', 'executed', 'cancelled', 'all'];
