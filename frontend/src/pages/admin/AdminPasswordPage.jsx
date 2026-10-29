import PasswordChangeForm from '../../components/auth/PasswordChangeForm';
import { ADMIN_PASSWORD_MIN } from '../../utils/passwordChangeValidation';

// تغيير المدير كلمة مروره (النموذج المشترك مع المريض والطبيب) بحدّ أدنى 12 حرفاً كإنشاء حسابه. لا ملف شخصي ولا تعديل بيانات.
// رأس الصفحة والحاوية وغلاف af-admin (وفيه متغير حدّ الحقول) يوفّرها AdminLayout.
export default function AdminPasswordPage() {
  return <PasswordChangeForm minLength={ADMIN_PASSWORD_MIN} />;
}
