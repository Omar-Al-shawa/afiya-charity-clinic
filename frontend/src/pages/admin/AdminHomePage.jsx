import { Link } from 'react-router-dom';
import { fetchPendingChanges } from '../../api/admin';
import { ADMIN_SECTIONS } from '../../components/admin/AdminLayout';
import ErrorState from '../../components/common/ErrorState';
import Skeleton from '../../components/common/Skeleton';
import useAsyncData from '../../hooks/useAsyncData';
import { isOverdue } from '../../utils/pendingChanges';

const SECTION_DETAILS = {
  '/admin/specialties': { icon: 'bi-heart-pulse', text: 'إضافة اختصاص جديد، وطلب تعديل اسمه أو مدة موعده أو حذفه.' },
  '/admin/doctors': { icon: 'bi-person-badge', text: 'إضافة طبيب بحسابه، وطلب تعديل بياناته أو حذفه.' },
  '/admin/patients': { icon: 'bi-people', text: 'قائمة المرضى المسجّلين وبياناتهم، للاطلاع فقط.' },
  '/admin/appointments': { icon: 'bi-calendar-check', text: 'حجوزات المجمع مع تصفية بالتاريخ أو الطبيب، للاطلاع فقط.' },
  '/admin/pending-changes': { icon: 'bi-hourglass-split', text: 'متابعة الطلبات المؤجَّلة وإلغاء ما لم يحن موعد تنفيذه.' },
};

function PendingSummary() {
  const { status, data, retry } = useAsyncData(fetchPendingChanges);

  if (status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="visually-hidden">جارٍ تحميل ملخص الطلبات المعلّقة…</span>
        <Skeleton className="d-block" style={{ width: '40%', height: 18 }} />
      </div>
    );
  }
  if (status === 'error') return <ErrorState message="تعذّر تحميل ملخص الطلبات المعلّقة." onRetry={retry} />;

  const overdue = data.filter((change) => isOverdue(change)).length;
  const waiting = data.filter((change) => change.status === 'pending').length - overdue;
  const failed = data.filter((change) => change.status === 'failed').length;
  const items = [
    { label: 'طلبات معلّقة', value: waiting },
    { label: 'حان موعدها ولم تُعالَج', value: overdue },
    { label: 'طلبات فاشلة', value: failed },
  ];

  return (
    <section className="af-card af-admin-card" aria-labelledby="admin-pending-title">
      <h2 id="admin-pending-title" className="af-admin-card-title">
        الطلبات المؤجَّلة
      </h2>
      <p className="af-muted">
        إضافة الاختصاصات والأطباء فورية، أما تعديل أو حذف الموجود منها فيُسجَّل طلباً يُنفَّذ بعد 14 يوماً.
      </p>
      <dl className="af-admin-summary">
        {items.map((item) => (
          <div key={item.label} className="af-admin-summary-item">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <Link to="/admin/pending-changes" className="btn btn-outline-primary align-self-start">
        عرض الطلبات المعلّقة
      </Link>
    </section>
  );
}

export default function AdminHomePage() {
  const sections = ADMIN_SECTIONS.filter((section) => SECTION_DETAILS[section.to]);

  return (
    <>
      <PendingSummary />
      <section aria-labelledby="admin-sections-title">
        <h2 id="admin-sections-title" className="af-admin-section-title">
          أقسام الإدارة
        </h2>
        <ul className="af-admin-grid list-unstyled mb-0">
          {sections.map((section) => (
            <li key={section.to}>
              <Link to={section.to} className="af-card af-admin-card af-admin-link-card">
                <i className={`bi ${SECTION_DETAILS[section.to].icon}`} aria-hidden="true" />
                <span className="af-admin-link-title">{section.label}</span>
                <span className="af-muted">{SECTION_DETAILS[section.to].text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
