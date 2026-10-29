import { NavLink, Outlet, useLocation } from 'react-router-dom';
import PageHeader from '../common/PageHeader';
import useDocumentTitle from '../../hooks/useDocumentTitle';

// أقسام لوحة الإدارة: التبويبات وعناوين الصفحات من مصدر واحد. شريط التنقل الرئيسي لا يتغيّر.
export const ADMIN_SECTIONS = [
  { to: '/admin', label: 'الرئيسية', title: 'لوحة الإدارة', subtitle: 'إدارة اختصاصات المجمع وأطبائه ومتابعة المرضى والحجوزات.', end: true },
  { to: '/admin/specialties', label: 'الاختصاصات', title: 'إدارة الاختصاصات', subtitle: 'إضافة الاختصاصات وطلب تعديلها أو حذفها.' },
  { to: '/admin/doctors', label: 'الأطباء', title: 'إدارة الأطباء', subtitle: 'إضافة الأطباء وطلب تعديل بياناتهم أو حذفهم.' },
  { to: '/admin/patients', label: 'المرضى', title: 'المرضى المسجّلون', subtitle: 'عرض المرضى المسجّلين للاطلاع فقط.' },
  { to: '/admin/appointments', label: 'الحجوزات', title: 'حجوزات المجمع', subtitle: 'عرض حجوزات المجمع للاطلاع فقط.' },
  { to: '/admin/pending-changes', label: 'الطلبات المعلّقة', title: 'الطلبات المعلّقة', subtitle: 'تعديلات وحذوفات مؤجَّلة لم تُطبَّق بعد.' },
  { to: '/admin/password', label: 'كلمة المرور', title: 'كلمة المرور', subtitle: 'غيّر كلمة مرور حساب المدير.' },
];

// تخطيط مسارات /admin: رأس الصفحة، ثم روابط الأقسام، ثم الصفحة الفرعية (Outlet)
export default function AdminLayout() {
  const { pathname } = useLocation();
  const section = ADMIN_SECTIONS.find((item) => item.to === pathname.replace(/\/+$/, '')) ?? ADMIN_SECTIONS[0];
  useDocumentTitle(section.title);

  return (
    <>
      <PageHeader
        title={section.title}
        subtitle={section.subtitle}
        breadcrumb={section.to === '/admin' ? [{ label: 'لوحة الإدارة' }] : [{ label: 'لوحة الإدارة', to: '/admin' }, { label: section.label }]}
      />
      <div className="container">
        <div className="af-admin">
          <nav className="af-admin-tabs" aria-label="أقسام الإدارة">
            {ADMIN_SECTIONS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="af-admin-tab">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </div>
      </div>
    </>
  );
}
