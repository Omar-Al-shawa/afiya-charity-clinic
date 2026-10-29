import { Navigate, Outlet, useLocation } from 'react-router-dom';
import ErrorState from '../common/ErrorState';
import Skeleton from '../common/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { accessDecision, buildLoginPath, homePathFor } from '../../utils/redirect';

// حارس المسارات المحمية بالدور (مسار تخطيط يعرض Outlet عند السماح).
// زائر ← الدخول مع next؛ دور غير مسموح ← الصفحة الرئيسية لدوره؛ تعذّر التحقق من الجلسة ← حالة خطأ مع إعادة المحاولة.
export default function RequireRole({ roles }) {
  const { status, user, retry } = useAuth();
  const { pathname, search } = useLocation();
  const decision = accessDecision(status, user, roles);

  if (decision === 'wait') {
    return (
      <div className="container py-5" role="status" aria-busy="true">
        <span className="visually-hidden">جارٍ التحقق من الجلسة…</span>
        <Skeleton style={{ width: 220, height: 20 }} />
      </div>
    );
  }
  if (decision === 'error') {
    return (
      <div className="container py-5">
        <ErrorState message="تعذّر التحقق من الجلسة." onRetry={retry} />
      </div>
    );
  }
  if (decision === 'login') return <Navigate to={buildLoginPath(`${pathname}${search}`)} replace />;
  if (decision === 'forbidden') return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}
