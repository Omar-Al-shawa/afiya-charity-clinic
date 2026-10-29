// التحقق من تعديل الملف الشخصي وتغيير كلمة المرور؛ يعيد استعمال قواعد التسجيل نفسها دون تغييرها.
import { ADMIN_PASSWORD_MIN } from '../auth/adminSetup.js';
import { checkAddress, checkName, checkPassword, checkPhone } from './registration.js';

const asObject = (body) => (body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {});

// الحقول الأربعة القابلة للتعديل فقط وكلها إلزامية؛ أي حقل آخر في الطلب (بريد، تاريخ ميلاد، جنس، دور، ...) يُتجاهل
export function validateProfileUpdate(body) {
  const input = asObject(body);
  const errors = {};
  const values = {};
  const set = (field, result) => {
    if (result.error) errors[field] = result.error;
    else values[field] = result.value;
  };
  set('firstName', checkName(input.firstName, 'أدخل الاسم الأول.'));
  set('lastName', checkName(input.lastName, 'أدخل اسم العائلة.'));
  set('phone', checkPhone(input.phone));
  set('address', checkAddress(input.address));
  return { valid: Object.keys(errors).length === 0, errors, values };
}

// كلمة المرور الحالية تُطلب فقط (لا قواعد طول عليها: قد تسبق القواعد الحالية)؛ الجديدة بقواعد التسجيل: 8 أحرف على الأقل و72 بايت كحد أقصى.
// role دور جلسة المستخدم: المدير وحده حدّه الأدنى 12 حرفاً (كإنشاء حسابه)؛ غيره يبقى 8
export function validatePasswordChange(body, role) {
  const input = asObject(body);
  const errors = {};
  const values = {};

  if (typeof input.currentPassword !== 'string' || !input.currentPassword) {
    errors.currentPassword = 'أدخل كلمة المرور الحالية.';
  } else values.currentPassword = input.currentPassword;

  const next = checkPassword(input.newPassword, role === 'admin' ? ADMIN_PASSWORD_MIN : undefined);
  if (next.error) errors.newPassword = next.error.replace('أدخل كلمة المرور.', 'أدخل كلمة المرور الجديدة.');
  else values.newPassword = next.value;

  if (typeof input.confirmPassword !== 'string' || !input.confirmPassword) {
    errors.confirmPassword = 'أكّد كلمة المرور الجديدة.';
  } else if (!errors.newPassword && input.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'تأكيد كلمة المرور غير مطابق.';
  }

  return { valid: Object.keys(errors).length === 0, errors, values };
}
