import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import ErrorState from '../common/ErrorState';
import Skeleton from '../common/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { resolvePostLoginPath } from '../../utils/redirect';

// يغلّف /login و/register: المستخدم المسجَّل يُنقل إلى next الآمن لدوره أو إلى صفحته الرئيسية.
// هنا المكان الوحيد لإعادة التوجيه بعد الدخول، فلا تتنقل صفحة الدخول بنفسها.
// الحالات تُعالَج كما في RequireRole: التحقق ← حالة تحميل، تعذّر التحقق ← ErrorState مع إعادة المحاولة،
// مسجَّل ← إعادة توجيه، زائر ← النموذج.
export default function GuestOnly() {
  const { status, user, retry } = useAuth();
  const [searchParams] = useSearchParams();

  if (status === 'loading') {
    return (
      <div className="container py-5" role="status" aria-busy="true">
        <span className="visually-hidden">جارٍ التحقق من الجلسة…</span>
        <Skeleton style={{ width: 220, height: 20 }} />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="container py-5">
        <ErrorState message="تعذّر التحقق من الجلسة." onRetry={retry} />
      </div>
    );
  }
  if (status === 'authenticated') {
    return <Navigate to={resolvePostLoginPath(user, searchParams.get('next'))} replace />;
  }
  return <Outlet />;
}
