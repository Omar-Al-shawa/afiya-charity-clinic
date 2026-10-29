import { Link } from 'react-router-dom';

// رأس الصفحة المشترك: مسار تنقل (الرئيسية ‹ ...) وعنوان H1 ونص فرعي اختياري.
// breadcrumb: عناصر بعد "الرئيسية"، والأخير هو الصفحة الحالية ولا يكون رابطاً.
// مثال: [{ label: 'الأطباء', to: '/doctors' }, { label: 'اسم الطبيب' }]
export default function PageHeader({ title, subtitle, breadcrumb = [] }) {
  return (
    <header className="af-page-header">
      <div className="container">
        {breadcrumb.length > 0 && (
          <nav aria-label="مسار التنقل">
            <ol className="af-breadcrumb">
              <li>
                <Link to="/">الرئيسية</Link>
              </li>
              {breadcrumb.map((item, index) => {
                const isLast = index === breadcrumb.length - 1;
                return (
                  <li key={item.label}>
                    {/* سهم الفاصل نحو اليسار هو اتجاه "التالي" في RTL */}
                    <i className="bi bi-chevron-left" aria-hidden="true" />
                    {isLast || !item.to ? (
                      <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
                    ) : (
                      <Link to={item.to}>{item.label}</Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}
