// تحقق نموذج "تواصل معنا" (A10) في الواجهة فقط؛ الخادم هو المرجع الفعلي لاحقاً.
// كل مدقِّق يعيد رسالة الخطأ بالعربية، أو '' إن كانت القيمة صحيحة.
import { normalizeName } from './registrationValidation';
import { validateEmail } from './validation';

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 100;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

// ترتيب الحقول: يحدد أول حقل غير صالح يُنقل إليه التركيز
export const FIELD_ORDER = ['name', 'email', 'subject', 'message'];

const countChars = (text) => [...text].length;

// نفس سياسة الأسماء في التسجيل (A8): حروف يونيكود مع علامات التشكيل، وبينها مسافة أو شرطة أو فاصلة عليا؛ بلا أرقام أو رموز
const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-]+[\p{L}\p{M}]+)*$/u;

export function validateName(value) {
  const name = normalizeName(value);
  if (!name) return 'أدخل اسمك.';
  const length = countChars(name);
  if (length < NAME_MIN || length > NAME_MAX || !NAME_PATTERN.test(name)) {
    return `أدخل اسماً صحيحاً من حرفين إلى ${NAME_MAX} حرف، دون أرقام أو رموز.`;
  }
  return '';
}

// الصيغة والفراغ من validateEmail كما هي؛ هنا يُضاف الحد الأقصى فقط
export function validateContactEmail(value) {
  const error = validateEmail(value);
  if (error) return error;
  if (countChars(String(value).trim()) > EMAIL_MAX) return 'البريد الإلكتروني طويل جداً.';
  return '';
}

// محارف التحكم (ومنها CR وLF) مرفوضة لأن الموضوع يدخل في رأس البريد؛ المسافات المتتالية تُوحَّد (كما يفعل الخادم)
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

export function normalizeSubject(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function validateSubject(value) {
  if (CONTROL_CHARS.test(String(value ?? ''))) return 'الموضوع يحتوي على محارف غير مسموحة.';
  const subject = normalizeSubject(value);
  if (!subject) return 'أدخل موضوع الرسالة.';
  const length = countChars(subject);
  if (length < SUBJECT_MIN) return `الموضوع قصير جداً؛ اكتب ${SUBJECT_MIN} أحرف على الأقل.`;
  if (length > SUBJECT_MAX) return `الموضوع طويل جداً (${SUBJECT_MAX} حرف كحد أقصى).`;
  return '';
}

// يُقصّ الفراغ في الطرفين للتحقق فقط؛ الأسطر الجديدة وعلامات الترقيم مسموحة، ولا يُقتطع النص الملصوق
export function validateMessage(value) {
  const message = String(value ?? '').trim();
  if (!message) return 'اكتب رسالتك.';
  const length = countChars(message);
  if (length < MESSAGE_MIN) return `الرسالة قصيرة جداً؛ اكتب ${MESSAGE_MIN} أحرف على الأقل.`;
  if (length > MESSAGE_MAX) return `الرسالة طويلة جداً (${MESSAGE_MAX} حرف كحد أقصى).`;
  return '';
}

// يُطبَّق عند الخروج من الحقل وقبل الإرسال
export function normalizeContactField(field, value) {
  if (field === 'name') return normalizeName(value);
  if (field === 'subject') return normalizeSubject(value);
  return String(value ?? '').trim();
}

const VALIDATORS = { name: validateName, email: validateContactEmail, subject: validateSubject, message: validateMessage };

export function validateField(field, value) {
  return VALIDATORS[field](value);
}

export function validateContact(values) {
  return Object.fromEntries(FIELD_ORDER.map((field) => [field, validateField(field, values[field])]));
}
