import { useRef, useState } from 'react';
import { cancelPendingChange, fetchPendingChanges } from '../../api/admin';
import { AdminNotice, ConfirmBar, ListSkeleton } from '../../components/admin/PendingBadge';
import AuthField from '../../components/auth/AuthField';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import useAsyncData from '../../hooks/useAsyncData';
import { adminErrorMessage } from '../../utils/adminValidation';
import {
  OVERDUE_MESSAGE,
  STATUS_LABELS,
  canCancelChange,
  changeTitle,
  describeNewData,
  formatEffectiveDate,
  isOverdue,
} from '../../utils/pendingChanges';

// الطلبات المعلّقة (تعديلات وحذوفات مؤجَّلة 14 يوماً). الإلغاء متاح للمعلّق قبل وقت سريانه فقط؛ الخادم هو المرجع (AF122).
// الطلبات المستحقة تعالجها الخلفية تلقائياً قبل الطلبات المعتمدة عليها (وعند الإقلاع)، ولا تنفّذ الواجهة شيئاً. وسجل حذف الاختصاصات المنفَّذة لا يُحفظ.
const FILTERS = [
  { value: '', label: 'المعلّقة والفاشلة' },
  { value: 'pending', label: 'المعلّقة فقط' },
  { value: 'failed', label: 'الفاشلة' },
  { value: 'executed', label: 'المنفَّذة' },
  { value: 'cancelled', label: 'الملغاة' },
  { value: 'all', label: 'الكل' },
];
const STALE_CODES = ['AF122', 'PENDING_CHANGE_NOT_FOUND'];

function ChangeCard({ change, onCancelled, onStale }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const cancelRef = useRef(null);

  const values = describeNewData(change.newData);
  const overdue = isOverdue(change);
  const cancellable = canCancelChange(change);

  const confirmCancel = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const updated = await cancelPendingChange(change.id);
      setConfirming(false);
      onCancelled(updated);
    } catch (err) {
      setError(adminErrorMessage(err, { write: true }));
      if (STALE_CODES.includes(err?.code)) {
        setConfirming(false);
        onStale();
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <article className="af-card af-admin-card" aria-labelledby={`change-${change.id}-title`}>
      <div className="af-admin-head">
        <h3 id={`change-${change.id}-title`} className="af-admin-name">
          {changeTitle(change)}
        </h3>
        <span className={`af-badge ${change.status === 'pending' ? '' : 'af-admin-badge--muted'}`}>
          {STATUS_LABELS[change.status] ?? change.status}
        </span>
      </div>
      <ul className="af-meta list-unstyled mb-0">
        <li>
          <i className="bi bi-calendar-event" aria-hidden="true" />
          <span>
            تاريخ السريان: <bdi>{formatEffectiveDate(change.effectiveDate)}</bdi>
          </span>
        </li>
      </ul>
      {values.length > 0 && (
        <ul className="af-admin-pending-values list-unstyled mb-0">
          {values.map((item) => (
            <li key={item.key}>
              {item.label} الجديد: <bdi>{item.value}</bdi>
            </li>
          ))}
        </ul>
      )}
      {change.changeType === 'delete' && change.target.type === 'doctor' && (
        <p className="af-muted mb-0">عند التنفيذ يُعطَّل حساب الطبيب وتبقى سجلاته محفوظة.</p>
      )}
      {change.status === 'failed' && (
        <p className="af-auth-error mb-0">
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          <span>
            تعذّر تنفيذ هذا الطلب{change.failureReason ? <>. السبب: <bdi dir="auto">{change.failureReason}</bdi></> : '.'}
          </span>
        </p>
      )}
      {overdue && (
        <p className="af-note mb-0">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span>{OVERDUE_MESSAGE}</span>
        </p>
      )}

      {confirming && (
        <ConfirmBar
          label={`تأكيد إلغاء الطلب: ${changeTitle(change)}`}
          text="سيُلغى الطلب فلا يُطبَّق أبداً، وتبقى البيانات الحالية كما هي."
          confirmLabel="تأكيد إلغاء الطلب"
          busyLabel="جارٍ الإلغاء…"
          busy={busy}
          onConfirm={confirmCancel}
          onCancel={() => setConfirming(false)}
          returnFocusRef={cancelRef}
        />
      )}
      <div role="alert" className="af-admin-alert">
        {error && (
          <p className="af-auth-error mt-3 mb-0">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
      {cancellable && !confirming && (
        <div className="af-admin-card-actions">
          <button type="button" ref={cancelRef} className="btn btn-outline-danger" onClick={() => { setError(''); setConfirming(true); }}>
            <i className="bi bi-x-circle" aria-hidden="true" /> إلغاء الطلب
          </button>
        </div>
      )}
    </article>
  );
}

function ChangesContent({ initial, status }) {
  const [changes, setChanges] = useState(initial);
  const [message, setMessage] = useState(null);
  const noticeRef = useRef(null);

  const handleCancelled = (updated) => {
    setChanges((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setMessage({ kind: 'success', text: `أُلغي الطلب: ${changeTitle(updated)}.` });
    setTimeout(() => noticeRef.current?.focus(), 0);
  };

  // طلب تغيّرت حالته على الخادم (نُفِّذ أو أُلغي أو حان موعده): تُجلب القائمة من جديد؛ إن فشل الجلب تبقى الحالية
  const reload = async () => {
    try {
      setChanges(await fetchPendingChanges(status));
    } catch {
      /* تبقى القائمة الحالية ورسالة الخطأ ظاهرة */
    }
  };

  return (
    <>
      <AdminNotice message={message} noticeRef={noticeRef} />
      {changes.length === 0 ? (
        <EmptyState
          icon="bi-hourglass-split"
          title="لا توجد طلبات"
          text={status === 'executed' || status === 'all' ? 'لا تُحفظ سجلات حذف الاختصاصات المنفَّذة، لذا قد لا تظهر هنا.' : undefined}
        />
      ) : (
        <ul className="af-admin-stack list-unstyled mb-0">
          {changes.map((change) => (
            <li key={change.id}>
              <ChangeCard change={change} onCancelled={handleCancelled} onStale={reload} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ChangesResults({ status: filter }) {
  const { status, data, retry } = useAsyncData(() => fetchPendingChanges(filter), [filter]);

  if (status === 'loading') return <ListSkeleton label="جارٍ تحميل الطلبات…" count={2} />;
  if (status === 'error') return <ErrorState message="تعذّر تحميل الطلبات المعلّقة." onRetry={retry} />;
  return <ChangesContent key={filter} initial={data} status={filter} />;
}

export default function AdminPendingChangesPage() {
  const [filter, setFilter] = useState('');

  return (
    <>
      <p className="af-note mb-0">
        <i className="bi bi-info-circle" aria-hidden="true" />
        <span>
          تعديل أو حذف الاختصاصات والأطباء الموجودين لا يُطبَّق فوراً: يُسجَّل طلب يُنفَّذ بعد 14 يوماً (عند 12:00 ص بتوقيت دمشق من تاريخ السريان)،
          ويمكن إلغاؤه قبل ذلك.
        </span>
      </p>
      <form className="af-card af-admin-card af-admin-filters" onSubmit={(event) => event.preventDefault()} aria-label="تصفية الطلبات" noValidate>
        <AuthField
          id="changes-status"
          label="عرض"
          as="select"
          name="status"
          required={false}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          {FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </AuthField>
      </form>
      <ChangesResults status={filter} />
    </>
  );
}
