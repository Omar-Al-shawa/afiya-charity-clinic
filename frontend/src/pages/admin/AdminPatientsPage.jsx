import { useRef, useState } from 'react';
import { fetchPatient, fetchPatients } from '../../api/admin';
import { ListSkeleton } from '../../components/admin/PendingBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import useAsyncData from '../../hooks/useAsyncData';
import { adminErrorMessage } from '../../utils/adminValidation';
import { GENDERS } from '../../utils/registrationValidation';
import { getDateLabels } from '../../utils/schedule';

// المرضى المسجّلون: قراءة فقط. القائمة بالترقيم (تحميل المزيد عند hasMore)، والتفاصيل تُجلب عند فتح البطاقة.

function PatientDetails({ patientId }) {
  const { status, data, retry } = useAsyncData(() => fetchPatient(patientId), [patientId]);

  if (status === 'loading') {
    return (
      <p className="af-muted mb-0" role="status">
        جارٍ تحميل التفاصيل…
      </p>
    );
  }
  if (status === 'error') return <ErrorState message="تعذّر تحميل تفاصيل المريض." onRetry={retry} />;

  const gender = GENDERS.find((item) => item.value === data.gender)?.label ?? '—';
  const rows = [
    { label: 'تاريخ الميلاد', value: data.birthdate ? getDateLabels(data.birthdate).long : '—' },
    { label: 'الجنس', value: gender },
    { label: 'زمرة الدم', value: data.bloodType ? <bdi dir="ltr">{data.bloodType}</bdi> : 'لا أعلم' },
    { label: 'عنوان السكن', value: data.address || '—' },
  ];
  return (
    <dl className="af-admin-details">
      {rows.map((row) => (
        <div key={row.label} className="af-admin-details-row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PatientCard({ patient }) {
  const [open, setOpen] = useState(false);
  const { id, firstName, lastName, email, phone } = patient;

  return (
    <article className="af-card af-admin-card" aria-labelledby={`patient-${id}-name`}>
      <div className="af-admin-head">
        <h3 id={`patient-${id}-name`} className="af-admin-name">
          {firstName} {lastName}
        </h3>
      </div>
      <dl className="af-admin-details">
        <div className="af-admin-details-row">
          <dt>البريد الإلكتروني</dt>
          <dd>
            <bdi dir="ltr">{email}</bdi>
          </dd>
        </div>
        <div className="af-admin-details-row">
          <dt>رقم الهاتف</dt>
          <dd>
            <bdi dir="ltr">{phone}</bdi>
          </dd>
        </div>
      </dl>
      {open && <PatientDetails patientId={id} />}
      <div className="af-admin-card-actions">
        <button
          type="button"
          className="btn btn-outline-primary"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
        </button>
      </div>
    </article>
  );
}

function PatientsContent({ initial }) {
  const [patients, setPatients] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const sending = useRef(false);

  const loadMore = async () => {
    if (sending.current) return;
    sending.current = true;
    setLoadingMore(true);
    setMoreError('');
    try {
      const next = await fetchPatients({ offset: patients.length });
      // تسجيل مريض جديد أثناء التصفح قد يكرّر صفاً عند حدود الصفحة: يُتجاهل المكرَّر
      setPatients((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...next.items.filter((item) => !known.has(item.id))];
      });
      setHasMore(next.hasMore);
    } catch (error) {
      setMoreError(adminErrorMessage(error));
    } finally {
      sending.current = false;
      setLoadingMore(false);
    }
  };

  if (patients.length === 0) {
    return <EmptyState icon="bi-people" title="لا يوجد مرضى مسجّلون بعد" text="سيظهر المرضى هنا بعد تسجيلهم في الموقع." />;
  }

  return (
    <section aria-labelledby="patients-title">
      <h2 id="patients-title" className="af-admin-section-title">
        المرضى <span className="af-admin-count">({patients.length}{hasMore ? '+' : ''})</span>
      </h2>
      <ul className="af-admin-stack list-unstyled mb-0">
        {patients.map((patient) => (
          <li key={patient.id}>
            <PatientCard patient={patient} />
          </li>
        ))}
      </ul>
      <div role="alert" className="af-admin-alert">
        {moreError && (
          <p className="af-auth-error mt-3 mb-0">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{moreError}</span>
          </p>
        )}
      </div>
      {hasMore && (
        <div className="af-admin-more">
          <button type="button" className="btn btn-outline-primary" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'جارٍ التحميل…' : 'تحميل المزيد'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function AdminPatientsPage() {
  const { status, data, retry } = useAsyncData(fetchPatients);

  if (status === 'loading') return <ListSkeleton label="جارٍ تحميل المرضى…" />;
  if (status === 'error') return <ErrorState message="تعذّر تحميل المرضى." onRetry={retry} />;
  return <PatientsContent initial={data} />;
}
