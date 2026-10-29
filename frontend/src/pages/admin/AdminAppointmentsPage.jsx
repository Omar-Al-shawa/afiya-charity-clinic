import { useRef, useState } from 'react';
import { fetchAdminAppointments, fetchAdminDoctors } from '../../api/admin';
import { ListSkeleton } from '../../components/admin/PendingBadge';
import AuthField from '../../components/auth/AuthField';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import useAsyncData from '../../hooks/useAsyncData';
import { adminErrorMessage } from '../../utils/adminValidation';
import { formatTime12 } from '../../utils/format';
import { getDateLabels, parseDate } from '../../utils/schedule';

// حجوزات المجمع: قراءة فقط، الأحدث أولاً. الخادم يدعم مرشّحين فقط (التاريخ والطبيب) وترقيماً (تحميل المزيد).
// الحالة بنص وشارة: قادم | سابق | ملغى (phase من الخادم، ولا تُحسب في الواجهة).
const PHASES = {
  upcoming: { label: 'قادم', className: '' },
  past: { label: 'سابق', className: 'af-admin-badge--muted' },
  cancelled: { label: 'ملغى', className: 'af-admin-badge--muted' },
};

const timeText = ({ startTime, endTime }) =>
  endTime ? `${formatTime12(startTime)} – ${formatTime12(endTime)}` : formatTime12(startTime);

function AppointmentItem({ appointment }) {
  const phase = PHASES[appointment.phase] ?? PHASES.past;
  return (
    <article className="af-card af-admin-card" aria-label={`${appointment.patientName} مع ${appointment.doctorName}`}>
      <div className="af-admin-head">
        <h3 className="af-admin-name">{appointment.patientName}</h3>
        <span className={`af-badge ${phase.className}`}>{phase.label}</span>
      </div>
      <ul className="af-meta list-unstyled mb-0">
        <li>
          <i className="bi bi-person-badge" aria-hidden="true" />
          <span>
            {appointment.doctorName} — {appointment.specialtyName}
          </span>
        </li>
        <li>
          <i className="bi bi-calendar-event" aria-hidden="true" />
          <span>{getDateLabels(appointment.date).long}</span>
        </li>
        <li>
          <i className="bi bi-clock" aria-hidden="true" />
          <bdi>{timeText(appointment)}</bdi>
        </li>
      </ul>
    </article>
  );
}

function AppointmentsContent({ initial, filters }) {
  const [appointments, setAppointments] = useState(initial.items);
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
      const next = await fetchAdminAppointments({ ...filters, offset: appointments.length });
      setAppointments((current) => {
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

  if (appointments.length === 0) {
    const filtered = Boolean(filters.date || filters.doctorId);
    return (
      <EmptyState
        icon="bi-calendar-x"
        title={filtered ? 'لا توجد حجوزات مطابقة' : 'لا توجد حجوزات بعد'}
        text={filtered ? 'غيّر التاريخ أو الطبيب أو امسح التصفية.' : undefined}
      />
    );
  }

  return (
    <section aria-labelledby="appointments-title">
      <h2 id="appointments-title" className="af-admin-section-title">
        الحجوزات <span className="af-admin-count">({appointments.length}{hasMore ? '+' : ''})</span>
      </h2>
      <ul className="af-admin-stack list-unstyled mb-0">
        {appointments.map((appointment) => (
          <li key={appointment.id}>
            <AppointmentItem appointment={appointment} />
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

// يجلب الصفحة الأولى للمرشّحين الحاليين؛ يُعاد إنشاء المحتوى (key) عند تغيّرهما فتبدأ القائمة من جديد
function AppointmentsResults({ filters }) {
  const { date, doctorId } = filters;
  const { status, data, retry } = useAsyncData(() => fetchAdminAppointments({ date, doctorId }), [date, doctorId]);

  if (status === 'loading') return <ListSkeleton label="جارٍ تحميل الحجوزات…" count={2} />;
  if (status === 'error') return <ErrorState message="تعذّر تحميل الحجوزات." onRetry={retry} />;
  return <AppointmentsContent key={`${date}|${doctorId}`} initial={data} filters={filters} />;
}

export default function AdminAppointmentsPage() {
  const [date, setDate] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const doctors = useAsyncData(fetchAdminDoctors);

  // تاريخ غير مكتمل أو غير صالح لا يُرسل (الخادم يرفضه)
  const filters = { date: parseDate(date) ? date : '', doctorId };
  const hasFilter = Boolean(date || doctorId);

  return (
    <>
      <form className="af-card af-admin-card af-admin-filters" onSubmit={(event) => event.preventDefault()} aria-label="تصفية الحجوزات" noValidate>
        <AuthField
          id="appointments-date"
          label="التاريخ"
          type="date"
          name="date"
          required={false}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <AuthField
          id="appointments-doctor"
          label="الطبيب"
          as="select"
          name="doctorId"
          required={false}
          value={doctorId}
          onChange={(event) => setDoctorId(event.target.value)}
          disabled={doctors.status !== 'success'}
          hint={doctors.status === 'error' ? 'تعذّر تحميل قائمة الأطباء.' : undefined}
        >
          <option value="">كل الأطباء</option>
          {doctors.status === 'success' &&
            doctors.data.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                د. {doctor.firstName} {doctor.lastName} — {doctor.specialtyName}
                {doctor.isActive ? '' : ' (غير مفعّل)'}
              </option>
            ))}
        </AuthField>
        {hasFilter && (
          <button
            type="button"
            className="btn btn-outline-primary af-admin-filter-clear"
            onClick={() => {
              setDate('');
              setDoctorId('');
            }}
          >
            مسح التصفية
          </button>
        )}
      </form>
      <AppointmentsResults filters={filters} />
    </>
  );
}
