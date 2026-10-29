import { useRef, useState } from 'react';
import { fetchDoctorAppointments } from '../../api/doctorPortal';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Skeleton from '../../components/common/Skeleton';
import DoctorAppointmentItem from '../../components/doctor/DoctorAppointmentItem';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { groupAppointments } from '../../utils/appointments';
import { addDays, getDamascusNow } from '../../utils/schedule';

// E: مواعيد الطبيب (قراءة فقط). الخادم يعيد الحجوزات القائمة فقط وبمدى أقصاه 31 يوماً، والملغاة لا تصل إلى الطبيب.
// القادمة: اليوم ثم 30 يوماً (الحجز مقيّد بـ 14 يوماً فيشمل الكل). السابقة: آخر 31 يوماً، ثم نوافذ أقدم بطلب المستخدم.
// الأيام بتقويم دمشق عبر utils/schedule فقط.

const WINDOW_DAYS = 31;

// الطلب الأول: اليوم كله (ما بدأ phase=past وما لم يبدأ phase=upcoming) ثم 30 يوماً، والثاني: آخر 31 يوماً قبل اليوم.
// نافذتا التاريخ لا تتقاطعان، فيُصنَّف كل موعد من استجابة واحدة فقط؛ ولو تقاطعتا عند اليوم لكان لموعد يبدأ بين الطلبين
// المتزامنين phase مختلف في كل منهما فيتكرر أو يسقط. الدمج والتصنيف بـ groupAppointments بحسب phase الخادم دون إعادة حسابه.
async function loadInitial() {
  const today = getDamascusNow().date;
  const pastFrom = addDays(today, -WINDOW_DAYS);
  const [ahead, recent] = await Promise.all([
    fetchDoctorAppointments({ from: today, to: addDays(today, WINDOW_DAYS - 1) }),
    fetchDoctorAppointments({ from: pastFrom, to: addDays(today, -1) }),
  ]);
  const { upcoming, past } = groupAppointments([...ahead, ...recent]);
  return { upcoming, past, pastFrom };
}

function Section({ id, title, count, children }) {
  return (
    <section className="af-dportal-section" aria-labelledby={id}>
      <h2 id={id} className="af-dportal-section-title">
        {title} <span className="af-dportal-count">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function AppointmentsList({ items }) {
  return (
    <ul className="af-card af-dportal-list af-dportal-list--card list-unstyled mb-0">
      {items.map((item) => (
        <DoctorAppointmentItem
          key={item.id}
          date={item.date}
          startTime={item.startTime}
          endTime={item.endTime}
          phase={item.phase}
          patient={item.patient}
          showStatus
        />
      ))}
    </ul>
  );
}

function AppointmentsContent({ initial }) {
  const [past, setPast] = useState(initial.past);
  const [pastFrom, setPastFrom] = useState(initial.pastFrom);
  const [exhausted, setExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState('');
  const loading = useRef(false); // يمنع الطلب المزدوج قبل أن يُعاد الرسم

  // النافذة الأقدم تنتهي قبل بداية الحالية بيوم، فلا تتداخل. إن عادت فارغة يُخفى الزر.
  const loadOlder = async () => {
    if (loading.current) return;
    loading.current = true;
    setLoadingOlder(true);
    setOlderError('');
    const to = addDays(pastFrom, -1);
    const from = addDays(to, -(WINDOW_DAYS - 1));
    try {
      const older = groupAppointments(await fetchDoctorAppointments({ from, to })).past;
      if (older.length === 0) setExhausted(true);
      else setPast((current) => groupAppointments([...current, ...older]).past);
      setPastFrom(from);
    } catch (error) {
      setOlderError(error?.code && typeof error.message === 'string' ? error.message : 'تعذّر تحميل المواعيد الأقدم.');
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  };

  return (
    <>
      <Section id="dappts-upcoming" title="المواعيد القادمة" count={initial.upcoming.length}>
        {initial.upcoming.length === 0 ? (
          <EmptyState icon="bi-calendar-x" title="لا توجد مواعيد قادمة" />
        ) : (
          <AppointmentsList items={initial.upcoming} />
        )}
      </Section>

      <Section id="dappts-past" title="المواعيد السابقة" count={past.length}>
        {past.length === 0 ? (
          <p className="af-muted">لا توجد مواعيد سابقة في الفترة المعروضة.</p>
        ) : (
          <AppointmentsList items={past} />
        )}
        <div role="alert">
          {olderError && (
            <p className="af-auth-error mt-3 mb-0">
              <i className="bi bi-exclamation-circle" aria-hidden="true" />
              <span>{olderError}</span>
            </p>
          )}
        </div>
        {!exhausted && (
          <button type="button" className="btn btn-outline-primary mt-3" disabled={loadingOlder} onClick={loadOlder}>
            {loadingOlder ? 'جارٍ التحميل…' : 'عرض مواعيد أقدم'}
          </button>
        )}
        {exhausted && <p className="af-muted mt-3 mb-0">لا توجد مواعيد أقدم.</p>}
      </Section>
    </>
  );
}

function AppointmentsSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">جارٍ تحميل المواعيد…</span>
      <div className="af-card af-dportal-card" aria-hidden="true">
        <Skeleton className="d-block mb-3" style={{ width: '35%', height: 20 }} />
        <Skeleton className="d-block mb-2" style={{ width: '70%', height: 14 }} />
        <Skeleton className="d-block mb-2" style={{ width: '55%', height: 14 }} />
        <Skeleton className="d-block" style={{ width: '60%', height: 14 }} />
      </div>
    </div>
  );
}

export default function DoctorAppointmentsPage() {
  useDocumentTitle('المواعيد');
  const { status, data, retry } = useAsyncData(loadInitial);

  return (
    <>
      <PageHeader
        title="المواعيد"
        subtitle="مواعيدك القادمة والسابقة مع بيانات المرضى."
        breadcrumb={[{ label: 'المواعيد' }]}
      />
      <div className="container">
        <div className="af-dportal">
          {status === 'loading' && <AppointmentsSkeleton />}
          {status === 'error' && <ErrorState message="تعذّر تحميل المواعيد." onRetry={retry} />}
          {status === 'success' && <AppointmentsContent initial={data} />}
        </div>
      </div>
    </>
  );
}
