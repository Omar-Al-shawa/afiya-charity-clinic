import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelAppointment, fetchMyAppointments } from '../../api/appointments';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Skeleton from '../../components/common/Skeleton';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { classifyCancelError, groupAppointments } from '../../utils/appointments';
import { formatTime12 } from '../../utils/format';
import { getDateLabels } from '../../utils/schedule';

// D3: مواعيد المريض (القادمة والسابقة والملغاة). الخادم هو المرجع في الحالة وفي إمكانية الإلغاء (canCancel).
// الإلغاء بخطوتين داخل البطاقة: «إلغاء الموعد» ثم «تأكيد الإلغاء»؛ ولا يُرسل طلب قبل التأكيد.

const SECTIONS = [
  { key: 'upcoming', title: 'المواعيد القادمة', empty: 'لا توجد مواعيد قادمة.', badge: 'قادم' },
  { key: 'past', title: 'المواعيد السابقة', empty: 'لا توجد مواعيد سابقة.', badge: 'سابق' },
  { key: 'cancelled', title: 'المواعيد الملغاة', empty: 'لا توجد مواعيد ملغاة.', badge: 'ملغى' },
];

// القادم: من الوقت إلى النهاية. السابق والملغى: وقت البداية فقط (الخادم لا يعيد النهاية لهما)
const timeText = ({ startTime, endTime }) =>
  endTime ? `${formatTime12(startTime)} – ${formatTime12(endTime)}` : formatTime12(startTime);

function AppointmentCard({ appointment, badge, confirming, cancelling, disabled, onAskCancel, onKeep, onConfirm }) {
  const askRef = useRef(null);
  const keepRef = useRef(null);
  const wasConfirming = useRef(false);

  // التركيز على «تراجع» (الخيار غير المدمِّر) عند فتح التأكيد، ثم العودة إلى «إلغاء الموعد» عند التراجع
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) askRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const { id, phase, canCancel, date, doctorName, specialtyName } = appointment;

  return (
    <article
      className={`af-card af-patient-appt af-patient-appt--${phase}`}
      aria-labelledby={`appt-${id}-doctor`}
    >
      <div className="af-patient-appt-main">
        <div className="af-patient-appt-head">
          <h3 id={`appt-${id}-doctor`} className="af-patient-appt-doctor">
            {doctorName}
          </h3>
          <span className={`af-badge af-patient-badge af-patient-badge--${phase}`}>{badge}</span>
        </div>
        <ul className="af-meta list-unstyled mb-0">
          <li>
            <i className="bi bi-heart-pulse" aria-hidden="true" />
            <span>{specialtyName}</span>
          </li>
          <li>
            <i className="bi bi-calendar-event" aria-hidden="true" />
            <span>{getDateLabels(date).long}</span>
          </li>
          <li>
            <i className="bi bi-clock" aria-hidden="true" />
            <bdi>{timeText(appointment)}</bdi>
          </li>
        </ul>
      </div>

      {canCancel && (
        <div className="af-patient-appt-actions">
          {confirming ? (
            <div className="af-patient-confirm" role="group" aria-label="تأكيد إلغاء الموعد">
              <p className="af-patient-confirm-text">هل تريد إلغاء هذا الموعد؟</p>
              <div className="af-patient-confirm-buttons">
                <button type="button" className="btn btn-danger" disabled={cancelling} onClick={() => onConfirm(id)}>
                  {cancelling ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
                </button>
                <button
                  type="button"
                  ref={keepRef}
                  className="btn btn-outline-primary"
                  disabled={cancelling}
                  onClick={onKeep}
                >
                  تراجع
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              ref={askRef}
              className="btn btn-outline-danger"
              disabled={disabled}
              onClick={() => onAskCancel(id)}
            >
              <i className="bi bi-x-circle" aria-hidden="true" /> إلغاء الموعد
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function AppointmentsSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">جارٍ تحميل مواعيدك…</span>
      <div className="af-patient-stack" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="af-card af-patient-appt">
            <div className="af-patient-appt-main">
              <Skeleton className="d-block mb-3" style={{ width: '40%', height: 20 }} />
              <Skeleton className="d-block mb-2" style={{ width: '30%', height: 14 }} />
              <Skeleton className="d-block mb-2" style={{ width: '50%', height: 14 }} />
              <Skeleton className="d-block" style={{ width: '25%', height: 14 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppointmentsContent({ initial }) {
  // نسخة محلية من القائمة: تُحدَّث بعد الإلغاء أو إعادة التحميل دون إعادة جلب كاملة عند النجاح
  const [appointments, setAppointments] = useState(initial);
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [message, setMessage] = useState(null); // { kind: 'success' | 'error', text }
  const sending = useRef(false); // يمنع الإرسال المزدوج قبل أن يُعاد الرسم
  const messageRef = useRef(null);

  const grouped = groupAppointments(appointments);

  // بعد حالة تغيّرت على الخادم (أو تعذّر التأكد منها) تُجلب القائمة من جديد؛ إن فشل الجلب تبقى الحالية
  const reload = async () => {
    try {
      setAppointments(await fetchMyAppointments());
    } catch {
      /* تبقى القائمة الحالية والرسالة ظاهرة */
    }
  };

  const askCancel = (id) => {
    if (sending.current) return;
    setMessage(null);
    setConfirmingId(id);
  };

  const confirmCancel = async (id) => {
    if (sending.current) return;
    sending.current = true;
    setCancellingId(id);
    setMessage(null);
    try {
      const updated = await cancelAppointment(id);
      setAppointments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setConfirmingId(null);
      setMessage({ kind: 'success', text: 'تم إلغاء الموعد.' });
      // البطاقة تنتقل إلى «الملغاة» فيُنقل التركيز إلى الرسالة حتى لا يضيع
      setTimeout(() => messageRef.current?.focus(), 0);
    } catch (error) {
      const outcome = classifyCancelError(error);
      if (outcome.kind === 'login') {
        // الجلسة انتهت: معالج 401 العام وحارس المسار يعيدان المستخدم إلى الدخول
        setConfirmingId(null);
      } else if (outcome.kind === 'refresh') {
        setConfirmingId(null);
        setMessage({ kind: 'error', text: outcome.message });
        await reload();
      } else {
        setMessage({ kind: 'error', text: outcome.message });
      }
    } finally {
      sending.current = false;
      setCancellingId(null);
    }
  };

  if (appointments.length === 0) {
    return (
      <EmptyState icon="bi-calendar-x" title="لا توجد مواعيد بعد" text="احجز موعدك الأول مع أحد أطباء المجمع.">
        <Link to="/doctors" className="btn btn-primary">
          تصفّح الأطباء
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <div role="status" ref={messageRef} tabIndex={-1} className="af-patient-live">
        {message?.kind === 'success' && (
          <p className="af-note mb-0">
            <i className="bi bi-check-circle" aria-hidden="true" />
            <span>{message.text}</span>
          </p>
        )}
      </div>
      <div role="alert">
        {message?.kind === 'error' && (
          <p className="af-auth-error mt-0 mb-3">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{message.text}</span>
          </p>
        )}
      </div>

      {SECTIONS.map(({ key, title, empty, badge }) => (
        <section key={key} className="af-patient-section" aria-labelledby={`appts-${key}-title`}>
          <h2 id={`appts-${key}-title`} className="af-patient-section-title">
            {title} <span className="af-patient-count">({grouped[key].length})</span>
          </h2>
          {grouped[key].length === 0 ? (
            <p className="af-muted">{empty}</p>
          ) : (
            <ul className="af-patient-stack list-unstyled mb-0">
              {grouped[key].map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard
                    appointment={appointment}
                    badge={badge}
                    confirming={confirmingId === appointment.id}
                    cancelling={cancellingId === appointment.id}
                    disabled={cancellingId !== null}
                    onAskCancel={askCancel}
                    onKeep={() => setConfirmingId(null)}
                    onConfirm={confirmCancel}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

export default function MyAppointmentsPage() {
  useDocumentTitle('مواعيدي');
  const { status, data, retry } = useAsyncData(fetchMyAppointments);

  return (
    <>
      <PageHeader
        title="مواعيدي"
        subtitle="تابع مواعيدك القادمة والسابقة والملغاة."
        breadcrumb={[{ label: 'مواعيدي' }]}
      />
      <div className="container">
        <div className="af-patient">
          {status === 'loading' && <AppointmentsSkeleton />}
          {status === 'error' && <ErrorState message="تعذّر تحميل مواعيدك." onRetry={retry} />}
          {status === 'success' && <AppointmentsContent initial={data} />}
        </div>
      </div>
    </>
  );
}
