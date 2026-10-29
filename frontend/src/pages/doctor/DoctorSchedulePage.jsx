import { useSearchParams } from 'react-router-dom';
import { fetchDoctorSchedule } from '../../api/doctorPortal';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Skeleton from '../../components/common/Skeleton';
import DoctorAppointmentItem from '../../components/doctor/DoctorAppointmentItem';
import { useAuth } from '../../context/AuthContext';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { addDays, getDamascusNow, getDateLabels, parseDate } from '../../utils/schedule';

// E: جدول الطبيب (يومي أو أسبوعي). للقراءة فقط؛ الخادم يحدّد الطبيب من الجلسة ولا يقيّد التاريخ بنافذة حجز المريض.
// العرض والتاريخ في الرابط (?view=week&date=YYYY-MM-DD) ويُكتبان بـ replace؛ اليوم الحالي بتوقيت دمشق.

const VIEWS = [
  { value: 'day', label: 'يومي' },
  { value: 'week', label: 'أسبوعي' },
];

const rangeLabel = (from, to) => {
  const a = getDateLabels(from);
  const b = getDateLabels(to);
  return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
};

// يومٌ واحد: الموعد المحجوز فقط (شبكة الفترات الفارغة لا تُعرض)، بترتيب الوقت كما يعيده الخادم
function DayAppointments({ day }) {
  const booked = day.slots.filter((slot) => slot.booked && slot.appointment);
  if (day.closed) return <p className="af-dportal-day-note">عطلة</p>;
  if (booked.length === 0) return <p className="af-dportal-day-note">لا توجد مواعيد.</p>;
  return (
    <ul className="af-dportal-list list-unstyled mb-0">
      {booked.map((slot) => (
        <DoctorAppointmentItem
          key={slot.appointment.id}
          startTime={slot.startTime}
          endTime={slot.past ? null : slot.endTime}
          phase={slot.past ? 'past' : 'upcoming'}
          patient={slot.appointment.patient}
        />
      ))}
    </ul>
  );
}

function ScheduleSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">جارٍ تحميل الجدول…</span>
      <div className="af-dportal-days" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="af-card af-dportal-card">
            <Skeleton className="d-block mb-3" style={{ width: '40%', height: 20 }} />
            <Skeleton className="d-block mb-2" style={{ width: '70%', height: 14 }} />
            <Skeleton className="d-block" style={{ width: '55%', height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DoctorSchedulePage() {
  useDocumentTitle('جدولي');
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = getDamascusNow().date;
  const view = searchParams.get('view') === 'week' ? 'week' : 'day';
  const dateParam = searchParams.get('date');
  const date = parseDate(dateParam) ? dateParam : today;

  const { status, data, retry } = useAsyncData(() => fetchDoctorSchedule({ view, date }), [view, date]);

  const go = (nextView, nextDate) => {
    const params = {};
    if (nextView === 'week') params.view = 'week';
    if (nextDate !== today) params.date = nextDate;
    setSearchParams(params, { replace: true });
  };

  const step = view === 'week' ? 7 : 1;
  const isCurrent = view === 'week' ? status === 'success' && data.from <= today && today <= data.to : date === today;
  const greeting = user?.firstName ? `مرحباً د. ${user.firstName} ${user.lastName ?? ''}`.trim() : 'مرحباً بك';

  return (
    <>
      <PageHeader title="جدولي" subtitle={greeting} breadcrumb={[{ label: 'جدولي' }]} />
      <div className="container">
        <div className="af-dportal">
          <div className="af-dportal-toolbar">
            <div className="af-dportal-views" role="group" aria-label="نوع العرض">
              {VIEWS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`btn ${view === item.value ? 'btn-primary' : 'btn-outline-primary'}`}
                  aria-pressed={view === item.value}
                  onClick={() => go(item.value, date)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="af-dportal-nav" role="group" aria-label="التنقل في الجدول">
              <button type="button" className="btn btn-outline-primary" onClick={() => go(view, addDays(date, -step))}>
                <i className="bi bi-chevron-right" aria-hidden="true" /> {view === 'week' ? 'الأسبوع السابق' : 'اليوم السابق'}
              </button>
              <button type="button" className="btn btn-outline-primary" disabled={isCurrent} onClick={() => go(view, today)}>
                {view === 'week' ? 'هذا الأسبوع' : 'اليوم'}
              </button>
              <button type="button" className="btn btn-outline-primary" onClick={() => go(view, addDays(date, step))}>
                {view === 'week' ? 'الأسبوع التالي' : 'اليوم التالي'} <i className="bi bi-chevron-left" aria-hidden="true" />
              </button>
            </div>
          </div>

          {status === 'loading' && <ScheduleSkeleton />}
          {status === 'error' && <ErrorState message="تعذّر تحميل الجدول." onRetry={retry} />}
          {status === 'success' && view === 'day' && (
            <section className="af-card af-dportal-card" aria-labelledby="schedule-title">
              <h2 id="schedule-title" className="af-dportal-title">
                {getDateLabels(data.days[0].date).long}
                {data.days[0].date === today && <span className="af-badge ms-2">اليوم</span>}
              </h2>
              <DayAppointments day={data.days[0]} />
            </section>
          )}
          {status === 'success' && view === 'week' && (
            <section aria-labelledby="schedule-title">
              <h2 id="schedule-title" className="af-dportal-range">
                {rangeLabel(data.from, data.to)}
              </h2>
              <div className="af-dportal-days">
                {data.days.map((day) => (
                  <section key={day.date} className="af-card af-dportal-card" aria-labelledby={`day-${day.date}`}>
                    <h3 id={`day-${day.date}`} className="af-dportal-title">
                      {getDateLabels(day.date).long}
                      {day.date === today && <span className="af-badge ms-2">اليوم</span>}
                    </h3>
                    <DayAppointments day={day} />
                  </section>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
