import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AuthTabs from './AuthTabs';

// القالب المشترك لشاشتي الدخول (A7) والتسجيل (A8): البطاقة والتبويبات والرسم.
// يبقى مركَّباً عند التنقل بين /login و/register، فلا يُعاد رسم الرسم ولا تنزيله.

// نفس نقطة كسر Bootstrap lg: الرسم يُرسَم (ويُحمَّل) من هذا العرض فما فوق فقط
const DESKTOP_QUERY = '(min-width: 992px)';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event) => setIsDesktop(event.matches);
    setIsDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export default function AuthLayout() {
  const isDesktop = useIsDesktop();
  // نموذج التسجيل أطول من الدخول: يُحاذى الرسم قرب الأعلى هناك فقط، ويبقى توسيط A7 كما هو في /login
  const isRegister = useLocation().pathname === '/register';

  return (
    <section className="af-auth">
      <div className="container">
        <div className="row g-4 g-xl-5 justify-content-center align-items-center">
          <div className="col-12 col-sm-10 col-md-8 col-lg-6">
            <div className="af-card af-auth-card">
              <AuthTabs />
              <Outlet />
            </div>
          </div>

          {/* الرسم تزييني: لا يُنشأ العنصر دون 992px فلا يُحمَّل الملف على الجوال */}
          {isDesktop && (
            <div className={`col-lg-6 d-none d-lg-block${isRegister ? ' af-auth-art-col--top' : ''}`}>
              <div className="af-auth-art">
                <img
                  src="/images/auth/login-illustration.jpeg"
                  width="1254"
                  height="1254"
                  alt=""
                  decoding="async"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
