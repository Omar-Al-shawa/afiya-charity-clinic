import PasswordChangeForm from '../../components/auth/PasswordChangeForm';
import PageHeader from '../../components/common/PageHeader';
import useDocumentTitle from '../../hooks/useDocumentTitle';

// تغيير الطبيب كلمة مروره الأولية التي حدّدها المدير (النموذج المشترك مع المريض). لا ملف شخصي ولا تعديل بيانات.
// af-patient غلاف تخطيط البطاقة من patient.css (المحمَّل عاماً).
export default function DoctorPasswordPage() {
  useDocumentTitle('كلمة المرور');

  return (
    <>
      <PageHeader
        title="كلمة المرور"
        subtitle="غيّر كلمة المرور التي زوّدتك بها إدارة المجمع."
        breadcrumb={[{ label: 'كلمة المرور' }]}
      />
      <div className="container">
        <div className="af-patient">
          <PasswordChangeForm />
        </div>
      </div>
    </>
  );
}
