import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

// القالب العام: يستخدمه الزائر والمريض
export default function PublicLayout() {
  const { pathname } = useLocation();

  // العودة لأعلى الصفحة عند الانتقال بين الصفحات
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a href="#main-content" className="af-skip-link">
        تخطَّ إلى المحتوى
      </a>
      <Navbar />
      <main id="main-content" className="af-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
