import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from '../common/Skeleton';
import {
  CHANGE_TYPE_LABELS,
  OVERDUE_MESSAGE,
  describeNewData,
  formatEffectiveDate,
  isOverdue,
} from '../../utils/pendingChanges';

// عناصر مشتركة بين صفحات المدير: شارة الطلب المعلّق، منطقة الرسائل، تأكيد الحذف، وهيكل التحميل.

// ملخص الطلب المعلّق على بطاقة اختصاص أو طبيب. الصف نفسه لم يتغيّر بعد: القيم الجديدة تُعرض هنا فقط.
export default function PendingBadge({ change, showLink = true }) {
  const overdue = isOverdue(change);
  const values = describeNewData(change.newData);

  return (
    <div className="af-admin-pending" role="group" aria-label="طلب معلّق">
      <p className="af-admin-pending-title">
        <i className="bi bi-hourglass-split" aria-hidden="true" />
        <strong>طلب {CHANGE_TYPE_LABELS[change.changeType]} معلّق</strong>
      </p>
      {overdue ? (
        <p className="af-admin-pending-text">{OVERDUE_MESSAGE}</p>
      ) : (
        <p className="af-admin-pending-text">
          لم يُطبَّق بعد. يُنفَّذ يوم <bdi>{formatEffectiveDate(change.effectiveDate)}</bdi>.
        </p>
      )}
      {values.length > 0 && (
        <ul className="af-admin-pending-values list-unstyled mb-0">
          {values.map((item) => (
            <li key={item.key}>
              {item.label}: <bdi>{item.value}</bdi>
            </li>
          ))}
        </ul>
      )}
      {showLink && (
        <Link to="/admin/pending-changes" className="af-admin-pending-link">
          الطلبات المعلّقة
        </Link>
      )}
    </div>
  );
}

// رسالة نجاح/معلومة (role=status، يُنقل إليها التركيز عبر noticeRef) أو خطأ (role=alert)
export function AdminNotice({ message, noticeRef }) {
  return (
    <>
      <div role="status" ref={noticeRef} tabIndex={-1} className="af-admin-live">
        {message && message.kind !== 'error' && (
          <p className="af-note mb-0">
            <i className={`bi ${message.kind === 'info' ? 'bi-info-circle' : 'bi-check-circle'}`} aria-hidden="true" />
            <span>{message.text}</span>
          </p>
        )}
      </div>
      <div role="alert" className="af-admin-alert">
        {message?.kind === 'error' && (
          <p className="af-auth-error mt-0 mb-3">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{message.text}</span>
          </p>
        )}
      </div>
    </>
  );
}

// تأكيد بخطوتين: يُنقل التركيز إلى «تراجع» (الخيار غير المدمِّر) عند الفتح، ويعود إلى returnFocusRef عند الإغلاق
export function ConfirmBar({ label, text, confirmLabel, busyLabel, busy, onConfirm, onCancel, returnFocusRef }) {
  const keepRef = useRef(null);

  useEffect(() => {
    keepRef.current?.focus();
    const target = returnFocusRef?.current;
    return () => target?.focus();
  }, [returnFocusRef]);

  return (
    <div className="af-admin-confirm" role="group" aria-label={label}>
      <p className="af-admin-confirm-text">{text}</p>
      <div className="af-admin-actions">
        <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" ref={keepRef} className="btn btn-outline-primary" disabled={busy} onClick={onCancel}>
          تراجع
        </button>
      </div>
    </div>
  );
}

export function ListSkeleton({ label, count = 3 }) {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="af-admin-stack" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="af-card af-admin-card">
            <Skeleton className="d-block mb-3" style={{ width: '35%', height: 20 }} />
            <Skeleton className="d-block mb-2" style={{ width: '55%', height: 14 }} />
            <Skeleton className="d-block" style={{ width: '25%', height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
