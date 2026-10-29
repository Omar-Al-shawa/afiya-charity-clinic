import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Logo from '../common/Logo';
import ThemeToggle from '../common/ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import { CLINIC_NAME, NAV_LINKS } from '../../utils/constants';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const AREA_LINKS = {
  admin: { to: '/admin', label: 'لوحة الإدارة' },
};
// روابط الدور (للمريض والطبيب فقط). end: «جدولي» لا يبقى نشطاً داخل /doctor/appointments
const ROLE_LINKS = {
  patient: {
    className: 'af-patient-nav-link',
    links: [
      { to: '/patient/appointments', label: 'مواعيدي' },
      { to: '/patient/profile', label: 'ملفي الشخصي' },
    ],
  },
  doctor: {
    className: 'af-dportal-nav-link',
    links: [
      { to: '/doctor', label: 'جدولي', end: true },
      { to: '/doctor/appointments', label: 'المواعيد' },
      { to: '/doctor/password', label: 'كلمة المرور' },
    ],
  },
};
// نقطة التحول بين الشريط الكامل والقائمة المنزلقة. المريض والطبيب لديهما روابط إضافية لا تتسع في الشريط قبل 1400px،
// فيستعملان القائمة المنزلقة (وفيها هذه الروابط) دون ذلك؛ الزائر والمدير على 992px كما كانا.
const BREAKPOINTS = {
  standard: { bar: 'd-none d-lg-flex', menu: 'd-lg-none', query: '(min-width: 992px)' },
  wide: { bar: 'd-none d-xxl-flex', menu: 'd-xxl-none', query: '(min-width: 1400px)' },
};
const LOGOUT_ERROR_MESSAGE = 'تعذّر تسجيل الخروج. تحقق من اتصالك وحاول مرة أخرى.';

// أزرار الحساب بحسب حالة الجلسة، وتُستعمل في الشريط وفي القائمة المنزلقة.
// التحقق جارٍ: أزرار الزائر نفسها مخفية بصرياً (invisible) فلا يقفز التخطيط ولا يومض الدخول للمسجَّل.
function AccountActions({ onLogout, loggingOut }) {
  const { status, user, retry } = useAuth();

  if (status === 'loading') {
    return (
      <>
        <span className="btn btn-outline-primary invisible" aria-hidden="true">تسجيل الدخول</span>
        <span className="btn btn-primary invisible" aria-hidden="true">إنشاء حساب</span>
      </>
    );
  }

  if (status === 'error') {
    return (
      <button type="button" className="btn btn-outline-primary" onClick={retry}>
        <i className="bi bi-arrow-clockwise" aria-hidden="true" /> تعذّر الاتصال، أعد المحاولة
      </button>
    );
  }

  if (status === 'authenticated') {
    const name = user.role === 'admin' ? 'المدير' : user.firstName ?? 'حسابي';
    const area = AREA_LINKS[user.role];
    const roleLinks = ROLE_LINKS[user.role];
    return (
      <>
        <span className="d-inline-flex align-items-center justify-content-center gap-2 fw-semibold align-self-center">
          <i className="bi bi-person-circle" aria-hidden="true" />
          {name}
        </span>
        {roleLinks?.links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={`btn btn-sm btn-outline-primary ${roleLinks.className}`}
          >
            {link.label}
          </NavLink>
        ))}
        {area && (
          <Link to={area.to} className="btn btn-outline-primary">
            {area.label}
          </Link>
        )}
        <button type="button" className="btn btn-primary" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
        </button>
      </>
    );
  }

  return (
    <>
      <Link to="/login" className="btn btn-outline-primary">
        تسجيل الدخول
      </Link>
      <Link to="/register" className="btn btn-primary">
        إنشاء حساب
      </Link>
    </>
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout, status, user } = useAuth();
  const bp = status === 'authenticated' && ROLE_LINKS[user.role] ? BREAKPOINTS.wide : BREAKPOINTS.standard;
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const { pathname } = useLocation();
  const menuButtonRef = useRef(null);
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);

  const closeMenu = () => setMenuOpen(false);

  // تُمسح الحالة بعد تأكيد الخادم فقط (داخل logout)؛ عند الفشل تبقى الجلسة وتظهر رسالة، وتُغلق القائمة المنزلقة لتظهر
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(false);
    try {
      await logout();
    } catch {
      setLogoutError(true);
      setMenuOpen(false);
    } finally {
      setLoggingOut(false);
    }
  };

  // القائمة المغلقة غير قابلة للتركيز ولا تظهر لقارئ الشاشة (inert).
  // useLayoutEffect يعمل قبل أي useEffect، فتُرفع inert قبل نقل التركيز عند الفتح.
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.inert = !menuOpen;
  }, [menuOpen]);

  // إغلاق القائمة عند الانتقال إلى صفحة أخرى
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // القائمة المنزلقة: Esc للإغلاق، وحصر التنقل بـ Tab داخلها، ومنع تمرير الصفحة خلفها
  useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // عند التكبير إلى عرض الشريط الكامل تُغلق القائمة المنزلقة تلقائياً
    const desktop = window.matchMedia(bp.query);
    const onBreakpoint = (event) => {
      if (event.matches) setMenuOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onBreakpoint);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onBreakpoint);
      document.body.style.overflow = '';
      menuButtonRef.current?.focus();
    };
  }, [menuOpen, bp.query]);

  return (
    <>
      <header className="af-navbar">
        <div className="container af-navbar-inner">
          <Link to="/" className="af-brand" aria-label={`${CLINIC_NAME} - الرئيسية`}>
            {/* الشعار الكامل على الشاشات الكبيرة جداً، والمختصر (الرمز + عافية) فيما دونها */}
            <Logo variant="full" className="d-none d-xl-inline-flex" />
            <Logo variant="compact" className="d-inline-flex d-xl-none" />
          </Link>

          <nav className={`af-nav ${bp.bar}`} aria-label="التنقل الرئيسي">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="af-nav-link">
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="af-navbar-actions">
            <ThemeToggle />
            <div className={`${bp.bar} gap-2`}>
              <AccountActions onLogout={handleLogout} loggingOut={loggingOut} />
            </div>
            <button
              type="button"
              ref={menuButtonRef}
              className={`af-icon-btn ${bp.menu}`}
              aria-label="فتح القائمة"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
            >
              <i className="bi bi-list" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {logoutError && (
        <div className="container">
          <p className="af-auth-error mt-2 mb-0" role="alert">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{LOGOUT_ERROR_MESSAGE}</span>
          </p>
        </div>
      )}

      {/* قائمة منزلقة من اليمين للتابلت والجوال (كلاسات Bootstrap offcanvas بدون جافاسكربت Bootstrap).
          role و aria-modal و aria-label تظهر فقط عند الفتح، والمغلقة: aria-hidden + inert */}
      <div
        id="mobile-menu"
        ref={panelRef}
        className={`offcanvas offcanvas-start ${bp.menu} ${menuOpen ? 'show' : ''}`}
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen ? 'true' : undefined}
        aria-label={menuOpen ? 'القائمة الرئيسية' : undefined}
        aria-hidden={menuOpen ? undefined : 'true'}
        tabIndex={-1}
      >
        <div className="offcanvas-header">
          <Logo variant="compact" />
          <button
            type="button"
            ref={closeButtonRef}
            className="af-icon-btn"
            aria-label="إغلاق القائمة"
            onClick={closeMenu}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="offcanvas-body d-flex flex-column">
          <nav aria-label="التنقل في القائمة">
            <ul className="af-mobile-nav list-unstyled mb-0">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={link.end} className="af-mobile-link">
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="d-grid gap-2 mt-auto pt-4">
            <AccountActions onLogout={handleLogout} loggingOut={loggingOut} />
          </div>
        </div>
      </div>
      {menuOpen && <div className={`offcanvas-backdrop fade show ${bp.menu}`} onClick={closeMenu} />}
    </>
  );
}
