// تحقق نموذج تغيير كلمة المرور في الواجهة؛ الخادم هو المرجع (الرسائل نفسها). كل دالة تعيد رسالة الخطأ أو ''.
import { PASSWORD_MIN, validateNewPassword } from './registrationValidation';

export const PASSWORD_CHANGE_FIELDS = ['currentPassword', 'newPassword', 'confirmPassword'];

// حد المدير الأدنى كما في الخادم (adminSetup.js)؛ المريض والطبيب يبقيان على PASSWORD_MIN (8)
export const ADMIN_PASSWORD_MIN = 12;

// «8 أحرف على الأقل» / «12 حرفاً على الأقل»
export const minLengthHint = (minLength = PASSWORD_MIN) =>
  `${minLength} ${minLength <= 10 ? 'أحرف' : 'حرفاً'} على الأقل`;

// الحالية: مطلوبة فقط (قد تسبق القواعد الحالية)، ولا تُقصّ
export function validateCurrentPassword(value) {
  return value ? '' : 'أدخل كلمة المرور الحالية.';
}

// الجديدة بقواعد التسجيل (8 أحرف على الأقل، بلا قصّ)؛ minLength أعلى من 8 (المدير) يضيف فحص عدد الأحرف
export function validateChangedPassword(value, minLength = PASSWORD_MIN) {
  const error = validateNewPassword(value);
  if (error) return error === 'أدخل كلمة المرور.' ? 'أدخل كلمة المرور الجديدة.' : error;
  if ([...value].length < minLength) return `كلمة المرور يجب ألا تقل عن ${minLength} ${minLength <= 10 ? 'أحرف' : 'حرفاً'}.`;
  return '';
}

// التأكيد: مطلوب، ويُقارَن بالجديدة فقط إن كانت الجديدة صالحة (كما يفعل الخادم)
export function validateConfirmPassword(value, newPassword, minLength = PASSWORD_MIN) {
  if (!value) return 'أكّد كلمة المرور الجديدة.';
  if (!validateChangedPassword(newPassword, minLength) && value !== newPassword) return 'تأكيد كلمة المرور غير مطابق.';
  return '';
}

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }, minLength = PASSWORD_MIN) {
  return {
    currentPassword: validateCurrentPassword(currentPassword),
    newPassword: validateChangedPassword(newPassword, minLength),
    confirmPassword: validateConfirmPassword(confirmPassword, newPassword, minLength),
  };
}
