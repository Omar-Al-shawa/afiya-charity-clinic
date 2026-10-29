import { NavLink, useSearchParams } from 'react-router-dom';
import { getSafeNext } from '../../utils/redirect';

// خياران متجاوران للتنقل بين شاشتي الدخول والتسجيل.
// روابط تنقل عادية (ليست تبويبات ARIA)؛ NavLink يضيف aria-current="page" للرابط النشط.
// يُحمَل next الآمن بين الشاشتين فيبقى مقصد الحجز عند التنقل من الدخول إلى التسجيل وبالعكس.
export default function AuthTabs() {
  const [searchParams] = useSearchParams();
  const next = getSafeNext(searchParams.get('next'));
  const search = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <nav className="af-auth-tabs" aria-label="تسجيل الدخول أو إنشاء حساب">
      <NavLink to={`/login${search}`} className="af-auth-tab">
        تسجيل الدخول
      </NavLink>
      <NavLink to={`/register${search}`} className="af-auth-tab">
        إنشاء حساب
      </NavLink>
    </nav>
  );
}
