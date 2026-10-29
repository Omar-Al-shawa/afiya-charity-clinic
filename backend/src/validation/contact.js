// التحقق من نموذج "تواصل معنا" في الخادم: نفس قواعد الواجهة (utils/contactValidation.js) ونفس رسائلها العربية.
import { NAME_PATTERN, checkEmail, normalizeName } from './registration.js';

const NAME_MIN = 2;
const NAME_MAX = 100;
const SUBJECT_MIN = 3;
const SUBJECT_MAX = 100;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

// محارف التحكم (ومنها CR وLF) ومحارف فصل الأسطر Unicode: مرفوضة في الاسم والبريد لأنها تُدرج في رأس/سطر الرسالة.
// الرسالة تسمح بالسطر الجديد والجدولة فقط (\n و\r و\t)؛ وCRLF تُوحَّد إلى \n قبل الفحص.
const CONTROL_ANY = /[\u{0}-\u{1f}\u{7f}-\u{9f}\u{2028}\u{2029}]/u;
const CONTROL_EXCEPT_NEWLINE = /[\u{0}-\u{8}\u{b}\u{c}\u{e}-\u{1f}\u{7f}-\u{9f}\u{2028}\u{2029}]/u;

const str = (value) => (typeof value === 'string' ? value : '');
const countChars = (text) => [...text].length;

function checkName(raw) {
  const input = str(raw);
  if (CONTROL_ANY.test(input)) return { error: `أدخل اسماً صحيحاً من حرفين إلى ${NAME_MAX} حرف، دون أرقام أو رموز.` };
  const name = normalizeName(input);
  if (!name) return { error: 'أدخل اسمك.' };
  const length = countChars(name);
  if (length < NAME_MIN || length > NAME_MAX || !NAME_PATTERN.test(name)) {
    return { error: `أدخل اسماً صحيحاً من حرفين إلى ${NAME_MAX} حرف، دون أرقام أو رموز.` };
  }
  return { value: name };
}

function checkContactEmail(raw) {
  const input = str(raw);
  if (CONTROL_ANY.test(input)) return { error: 'أدخل بريداً إلكترونياً صحيحاً.' };
  return checkEmail(input); // يقصّ الفراغ ويحوّل لأحرف صغيرة ويشترط ASCII وحداً أقصى 254
}

// الموضوع نص حر يدخل في رأس البريد (Subject): محارف التحكم (ومنها CR وLF) مرفوضة، والمسافات المتتالية تُوحَّد
function checkSubject(raw) {
  const input = str(raw);
  if (CONTROL_ANY.test(input)) return { error: 'الموضوع يحتوي على محارف غير مسموحة.' };
  const subject = input.trim().replace(/\s+/g, ' ');
  if (!subject) return { error: 'أدخل موضوع الرسالة.' };
  const length = countChars(subject);
  if (length < SUBJECT_MIN) return { error: `الموضوع قصير جداً؛ اكتب ${SUBJECT_MIN} أحرف على الأقل.` };
  if (length > SUBJECT_MAX) return { error: `الموضوع طويل جداً (${SUBJECT_MAX} حرف كحد أقصى).` };
  return { value: subject };
}

function checkMessage(raw) {
  const normalized = str(raw).replace(/\r\n?/g, '\n');
  if (CONTROL_EXCEPT_NEWLINE.test(normalized)) return { error: 'الرسالة تحتوي على محارف غير مسموحة.' };
  const message = normalized.trim();
  if (!message) return { error: 'اكتب رسالتك.' };
  const length = countChars(message);
  if (length < MESSAGE_MIN) return { error: `الرسالة قصيرة جداً؛ اكتب ${MESSAGE_MIN} أحرف على الأقل.` };
  if (length > MESSAGE_MAX) return { error: `الرسالة طويلة جداً (${MESSAGE_MAX} حرف كحد أقصى).` };
  return { value: message };
}

// يعيد { valid, errors, values }؛ الحقول غير المعروفة تُهمل
export function validateContact(body) {
  const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const values = {};
  const set = (field, result) => {
    if (result.error) errors[field] = result.error;
    else values[field] = result.value;
  };
  set('name', checkName(input.name));
  set('email', checkContactEmail(input.email));
  set('subject', checkSubject(input.subject));
  set('message', checkMessage(input.message));
  return { valid: Object.keys(errors).length === 0, errors, values };
}
