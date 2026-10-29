import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Skeleton from '../../components/common/Skeleton';
import DoctorAvatar from '../../components/cards/DoctorAvatar';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useAuth } from '../../context/AuthContext';
import { fetchDoctorById } from '../../api/doctors';
import { createAppointment, fetchDoctorAvailability } from '../../api/appointments';
import { classifyBookingError, BOOKING_PATIENT_ONLY_MESSAGE } from '../../utils/appointments';
import { formatMinutes, formatTime12 } from '../../utils/format';
import { parsePositiveIntParam } from '../../utils/queryParams';
import { buildLoginPath } from '../../utils/redirect';
import { getDateLabels, isValidTime } from '../../utils/schedule';

const DOCTORS_BREADCRUMB = { label: 'الأطباء', to: '/doctors' };
const NOT_SELECTED = 'لم يُحدَّد بعد';

// يبني ?date=YYYY-MM-DD&time=HH:mm بنقطتين حرفيتين (URLSearchParams يكتبهما %3A). القيمتان متحقَّق منهما مسبقاً
// (أرقام وشرطتان ونقطتان فقط)، وأي معاملات أخرى تبقى كما هي.
function buildSearch(params, date, time) {
  const rest = new URLSearchParams(params);
  rest.delete('date');
  rest.delete('time');
  const parts = [];
  if (date) parts.push(`date=${date}`);
  if (time) parts.push(`time=${time}`);
  if (rest.toString()) parts.push(rest.toString());
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

const hasAvailableSlot = (day) => day.slots.some((slot) => !slot.booked);
const formatRange = (slot) => `${formatTime12(slot.startTime)} – ${formatTime12(slot.endTime)}`;

// الطبيب والتوافر يُحمَّلان معاً. null إن لم يوجد الطبيب أو كان غير مفعّل (أي تعذّر العثور عليه).
const loadBooking = (doctorId) =>
  Promise.all([fetchDoctorById(doctorId), fetchDoctorAvailability(doctorId)]).then(
    ([doctor, availability]) => (doctor && availability ? { doctor, availability } : null),
  );

function SummaryRow({ icon, label, children, muted = false }) {
  return (
    <div className="af-info-row">
      <i className={`bi ${icon}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span className={muted ? 'af-muted' : undefined}>{children}</span>
      </div>
    </div>
  );
}

function BookingWorkspace({ doctor, initialAvailability }) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { status: authStatus, user } = useAuth();
  const replaceSelection = (date, time) =>
    navigate({ search: buildSearch(searchParams, date, time) }, { replace: true });
  // booking (جارٍ الإرسال) | booked (تم الحجز) | failed (فشل مع رسالة) | null
  const [confirmState, setConfirmState] = useState(null);
  const [result, setResult] = useState(null); // { appointment } عند النجاح، أو { kind, message, code } عند الفشل
  const sending = useRef(false); // يمنع الإرسال المزدوج حتى عند النقر السريع قبل إعادة الرسم
  const [restoreNotice, setRestoreNotice] = useState(false);

  const { days, slotDuration, bookingRestrictedFrom } = availability;
  const restrictedFrom = /^\d{4}-\d{2}-\d{2}$/.test(bookingRestrictedFrom ?? '') ? bookingRestrictedFrom : null;
  const anyAvailable = days.some((day) => !day.closed && hasAvailableSlot(day));

  // ---- الاختيار الحالي: مصدره الرابط (?date=&time=) ويُتحقَّق منه دائماً مقابل التوافر ----
  const dateParam = searchParams.get('date');
  const timeParam = searchParams.get('time');
  const defaultDay = days.find((day) => !day.closed && hasAvailableSlot(day)) ?? null;
  const requestedDay = days.find((day) => day.date === dateParam && !day.closed) ?? null;
  const selectedDay = requestedDay ?? defaultDay;
  // الوقت يُقبل فقط مع تاريخ صالح صُرِّح به في الرابط (وقت بلا تاريخ، أو لتاريخ مرفوض، لا يُطبَّق على اليوم الافتراضي)
  const selectedSlot =
    requestedDay && isValidTime(timeParam)
      ? requestedDay.slots.find((slot) => slot.startTime === timeParam && !slot.booked) ?? null
      : null;

  const wantedDate = selectedDay ? selectedDay.date : null;
  const wantedTime = selectedSlot ? selectedSlot.startTime : null;

  // يُبقي الرابط مطابقاً للاختيار المرئي: تاريخ خارج النافذة أو جمعة أو موعد محجوز/منتهٍ/غير صالح يُزال
  // بـ replace (دون خطوة في السجل)، وتظهر ملاحظة إن كان المعامل المرفوض قد طُلب صراحةً.
  useEffect(() => {
    if (dateParam === wantedDate && timeParam === wantedTime) return;
    // المعامل الفارغ (?date=&time=) لا يُعدّ طلباً مرفوضاً
    const requestedDate = dateParam !== null && dateParam !== '';
    const requestedTime = timeParam !== null && timeParam !== '';
    if ((requestedDate && dateParam !== wantedDate) || (requestedTime && wantedTime === null)) {
      setRestoreNotice(true);
    }
    navigate({ search: buildSearch(searchParams, wantedDate, wantedTime) }, { replace: true });
  }, [dateParam, timeParam, wantedDate, wantedTime, searchParams, navigate]);

  const select = (date, time) => {
    // أثناء إرسال الحجز لا يتغيّر الاختيار، فيطابق الموعدُ المرسَل ما يراه المريض
    if (sending.current) return;
    setRestoreNotice(false);
    // اختيار يوم أو وقت آخر عمداً يمسح نتيجة المحاولة السابقة (نجاح أو خطأ) فلا تُلتبس بالاختيار الجديد
    setConfirmState(null);
    setResult(null);
    replaceSelection(date, time);
  };

  // تحديث التوافر بعد الحجز أو رفضه: اختياري، فلا يمنع عرض النتيجة إن فشل
  const refreshAvailability = async () => {
    try {
      const fresh = await fetchDoctorAvailability(doctor.id);
      if (fresh) setAvailability(fresh);
    } catch {
      /* تبقى القائمة الحالية والرسالة ظاهرة */
    }
  };

  // الزائر يُنقل إلى الدخول ويعود بالموعد المختار (في الرابط). المريض المسجَّل يُرسل الحجز، والخادم هو المرجع في
  // التوفر والتعارض. الطبيب والمدير لا يرسلان أي طلب. لا يُرسل معرّف المريض (يُؤخذ من الجلسة).
  const confirm = async () => {
    if (sending.current || !selectedDay || !selectedSlot) return;
    const loginPath = buildLoginPath(`${location.pathname}${location.search}`);
    if (authStatus === 'guest') {
      navigate(loginPath);
      return;
    }
    if (authStatus !== 'authenticated') return;
    if (user.role !== 'patient') {
      setResult({ kind: 'forbidden', message: BOOKING_PATIENT_ONLY_MESSAGE });
      setConfirmState('failed');
      return;
    }

    sending.current = true;
    setResult(null);
    setConfirmState('booking');
    const { date } = selectedDay;
    const time = selectedSlot.startTime;
    try {
      const appointment = await createAppointment({ doctorId: doctor.id, date, time });
      setResult({ appointment });
      setConfirmState('booked');
      replaceSelection(date, null);
      refreshAvailability();
    } catch (error) {
      const outcome = classifyBookingError(error);
      if (outcome.kind === 'login') {
        setConfirmState(null);
        navigate(loginPath);
        return;
      }
      setResult({ ...outcome, code: error?.code });
      setConfirmState('failed');
      if (outcome.kind === 'refresh') {
        replaceSelection(date, null);
        refreshAvailability();
      }
    } finally {
      sending.current = false;
    }
  };

  const labels = selectedDay ? getDateLabels(selectedDay.date) : null;
  const slotsAllBooked = selectedDay && selectedDay.slots.length > 0 && !hasAvailableSlot(selectedDay);

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-8">
        <div className="af-booking-stack">
          <section className="af-card af-info-card af-booking-doctor" aria-label="الطبيب">
            <div className="af-booking-avatar">
              <DoctorAvatar src={doctor.imageUrl} />
            </div>
            <div>
              <h2 className="h5 mb-1">{doctor.fullName}</h2>
              <span className="af-badge mb-2">{doctor.specialtyName}</span>
              <p className="af-muted mb-0">مدة الموعد: {formatMinutes(slotDuration)}</p>
            </div>
          </section>

          <p className="af-note mb-0">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <span>يمكنك تصفّح المواعيد دون حساب، ويلزم تسجيل الدخول لتأكيد الحجز.</span>
          </p>

          {/* تغيير إداري معلّق يقيّد الحجز: التاريخ من الخادم (bookingRestrictedFrom)، ولا تُذكر تفاصيل التغيير. يظهر في حالتي التوافر والفراغ */}
          {restrictedFrom && (
            <p className="af-note mb-0">
              <i className="bi bi-info-circle" aria-hidden="true" />
              <span>
                لا تتوفر مواعيد للحجز لدى هذا الطبيب ابتداءً من <bdi>{getDateLabels(restrictedFrom).long}</bdi>، بسبب تغيير إداري
                مجدول يخص الطبيب أو اختصاصه.
              </span>
            </p>
          )}

          {anyAvailable ? (
            <>
              <fieldset className="af-card af-info-card af-booking-fieldset">
                <legend className="af-booking-legend">اختر اليوم</legend>
                <div className="af-date-grid">
                  {days.map((day) => {
                    const parts = getDateLabels(day.date);
                    const noSlots = !day.closed && !hasAvailableSlot(day);
                    const note = day.closed ? 'عطلة' : noSlots ? 'لا مواعيد' : null;
                    return (
                      <div className="af-date-option" key={day.date}>
                        <input
                          type="radio"
                          name="booking-date"
                          id={`date-${day.date}`}
                          className="af-date-input visually-hidden"
                          checked={selectedDay?.date === day.date}
                          disabled={day.closed}
                          onChange={() => select(day.date, null)}
                        />
                        <label
                          htmlFor={`date-${day.date}`}
                          className={`af-date-label${noSlots ? ' af-date-label--empty' : ''}`}
                        >
                          <span className="af-date-weekday">{parts.weekday}</span>
                          <span className="af-date-day">{parts.day}</span>
                          <span className="af-date-month">{parts.month}</span>
                          {note && <span className="af-date-note">{note}</span>}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="af-card af-info-card af-booking-fieldset">
                <legend className="af-booking-legend">
                  اختر الوقت{labels ? ` — ${labels.long}` : ''}
                </legend>
                <div role="status">
                  {restoreNotice && !confirmState && (
                    <p className="af-note mb-3">
                      <i className="bi bi-info-circle" aria-hidden="true" />
                      <span>تعذّر استعادة الموعد المطلوب لأنه غير متاح. اختر موعداً آخر.</span>
                    </p>
                  )}
                  {slotsAllBooked && (
                    <p className="af-note mb-3">
                      <i className="bi bi-info-circle" aria-hidden="true" />
                      <span>جميع مواعيد هذا اليوم محجوزة. اختر يوماً آخر.</span>
                    </p>
                  )}
                </div>
                {selectedDay && selectedDay.slots.length === 0 ? (
                  <EmptyState icon="bi-clock-history" title="انتهت مواعيد هذا اليوم" text="اختر يوماً آخر." />
                ) : (
                  <div className="af-slot-grid">
                    {selectedDay?.slots.map((slot) => (
                      <div className="af-slot-option" key={slot.startTime}>
                        <input
                          type="radio"
                          name="booking-time"
                          id={`slot-${slot.startTime.replace(':', '')}`}
                          className="af-slot-input visually-hidden"
                          checked={selectedSlot?.startTime === slot.startTime}
                          disabled={slot.booked}
                          onChange={() => select(selectedDay.date, slot.startTime)}
                        />
                        <label
                          htmlFor={`slot-${slot.startTime.replace(':', '')}`}
                          className="af-slot-label"
                        >
                          <i className="bi bi-check2 af-slot-check" aria-hidden="true" />
                          <span className="af-slot-time">{formatTime12(slot.startTime)}</span>
                          <span className="visually-hidden">
                            ، حتى {formatTime12(slot.endTime)}
                            {slot.booked ? '، محجوز' : ''}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </fieldset>
            </>
          ) : (
            <div className="af-card">
              <EmptyState
                icon="bi-calendar-x"
                title="لا توجد مواعيد متاحة حالياً"
                text="لا تتوفر مواعيد لهذا الطبيب خلال الأيام الـ14 القادمة. حاول لاحقاً."
              >
                <Link to={`/doctors/${doctor.id}`} className="btn btn-outline-primary">
                  العودة إلى ملف الطبيب
                </Link>
              </EmptyState>
            </div>
          )}
        </div>
      </div>

      <div className="col-12 col-lg-4">
        <aside className="af-card af-info-card af-booking-summary" aria-labelledby="booking-summary-title">
          <h2 id="booking-summary-title" className="h5 mb-0">
            ملخص الموعد
          </h2>
          <SummaryRow icon="bi-person-badge" label="الطبيب">
            {doctor.fullName}
          </SummaryRow>
          <SummaryRow icon="bi-clipboard2-pulse" label="التخصص">
            {doctor.specialtyName}
          </SummaryRow>
          <SummaryRow icon="bi-calendar-event" label="التاريخ" muted={!selectedSlot}>
            {selectedSlot ? labels.long : NOT_SELECTED}
          </SummaryRow>
          <SummaryRow icon="bi-clock" label="الوقت" muted={!selectedSlot}>
            {selectedSlot ? <bdi>{formatRange(selectedSlot)}</bdi> : NOT_SELECTED}
          </SummaryRow>
          <SummaryRow icon="bi-stopwatch" label="مدة الموعد">
            {formatMinutes(slotDuration)}
          </SummaryRow>

          {/* إعلان مخفي بصرياً لقارئ الشاشة عند تغيّر الاختيار */}
          <p className="visually-hidden" role="status">
            {selectedSlot ? `تم اختيار الموعد: ${labels.long}، ${formatRange(selectedSlot)}` : ''}
          </p>

          <div>
            <p id="booking-hint" className="af-muted mb-3">
              {selectedSlot ? 'راجع التفاصيل ثم اضغط «تأكيد الحجز».' : 'اختر يوماً ثم موعداً لعرض تفاصيل الحجز.'}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-lg w-100"
              disabled={
                !selectedSlot ||
                confirmState === 'booking' ||
                (authStatus !== 'guest' && authStatus !== 'authenticated')
              }
              aria-describedby="booking-hint"
              onClick={confirm}
            >
              <i className="bi bi-calendar-check" aria-hidden="true" />
              {confirmState === 'booking' ? 'جارٍ تأكيد الحجز…' : 'تأكيد الحجز'}
            </button>

            <div role="status">
              {confirmState === 'booked' && result?.appointment && (
                <p className="af-note mt-3 mb-0">
                  <i className="bi bi-check-circle" aria-hidden="true" />
                  <span>
                    <strong className="d-block">تم حجز موعدك بنجاح.</strong>
                    <span className="d-block">{getDateLabels(result.appointment.date).long}</span>
                    <bdi className="d-block">
                      {result.appointment.endTime
                        ? `${formatTime12(result.appointment.startTime)} – ${formatTime12(result.appointment.endTime)}`
                        : formatTime12(result.appointment.startTime)}
                    </bdi>
                    <Link to="/patient/appointments">عرض مواعيدي</Link>
                  </span>
                </p>
              )}
            </div>
            <div role="alert">
              {confirmState === 'failed' && result?.message && (
                <p className="af-note mt-3 mb-0">
                  <i className="bi bi-exclamation-circle" aria-hidden="true" />
                  <span>
                    {result.message}
                    {(result.kind === 'check' || result.code === 'AF108') && (
                      <>
                        {' '}
                        <Link to="/patient/appointments">عرض مواعيدي</Link>
                      </>
                    )}
                  </span>
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// هيكل التحميل: أقسام الصفحة الرئيسية (الطبيب، الأيام، الأوقات) وبطاقة الملخص
function BookingSkeleton() {
  return (
    <div className="row g-4" role="status" aria-busy="true">
      <span className="visually-hidden">جارٍ تحميل المواعيد…</span>
      <div className="col-12 col-lg-8">
        <div className="af-booking-stack" aria-hidden="true">
          <div className="af-card af-info-card af-booking-doctor">
            <Skeleton className="af-skeleton--circle" style={{ flex: 'none', width: 72, height: 72 }} />
            <div className="flex-grow-1">
              <Skeleton className="d-block mb-2" style={{ width: '45%', height: 20 }} />
              <Skeleton className="d-block" style={{ width: '30%', height: 16 }} />
            </div>
          </div>
          <div className="af-card af-info-card">
            <Skeleton className="d-block" style={{ width: '25%', height: 20 }} />
            <div className="af-date-grid">
              {Array.from({ length: 14 }, (_, i) => (
                <Skeleton key={i} className="d-block" style={{ height: 72 }} />
              ))}
            </div>
          </div>
          <div className="af-card af-info-card">
            <Skeleton className="d-block" style={{ width: '40%', height: 20 }} />
            <div className="af-slot-grid">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="d-block" style={{ height: 44 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="col-12 col-lg-4">
        <div className="af-card af-info-card" aria-hidden="true">
          <Skeleton className="d-block" style={{ width: '40%', height: 20 }} />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="d-block" style={{ width: `${60 + (i % 2) * 15}%`, height: 16 }} />
          ))}
          <Skeleton className="d-block" style={{ height: 52 }} />
        </div>
      </div>
    </div>
  );
}

function AppointmentBooking({ id }) {
  const doctorId = parsePositiveIntParam(id);
  // المعرّف غير الصالح لا يطلب بيانات: تظهر حالة "غير موجود" مباشرة
  const { status, data, retry } = useAsyncData(
    () => (doctorId === null ? Promise.resolve(null) : loadBooking(doctorId)),
    [doctorId],
  );

  const notFound = doctorId === null || (status === 'success' && data === null);
  const shown = !notFound && status === 'success' ? data : null;

  useDocumentTitle(
    shown ? `حجز موعد مع ${shown.doctor.fullName}` : notFound ? 'الطبيب غير موجود' : 'حجز موعد',
  );

  return (
    <>
      <PageHeader
        title={notFound ? 'الطبيب غير موجود' : 'حجز موعد'}
        subtitle={
          shown ? (
            `${shown.doctor.fullName} — ${shown.doctor.specialtyName}`
          ) : !notFound && status === 'loading' ? (
            <Skeleton style={{ width: 200, height: 16 }} />
          ) : undefined
        }
        breadcrumb={[
          DOCTORS_BREADCRUMB,
          ...(shown ? [{ label: shown.doctor.fullName, to: `/doctors/${shown.doctor.id}` }] : []),
          { label: 'حجز موعد' },
        ]}
      />

      <div className="container af-booking">
        {notFound && (
          <EmptyState
            icon="bi-person-x"
            title="لم نعثر على هذا الطبيب"
            text="قد يكون الرابط غير صحيح أو أن الطبيب غير متاح حالياً."
          >
            <Link to="/doctors" className="btn btn-primary">
              العودة إلى الأطباء
            </Link>
          </EmptyState>
        )}

        {!notFound && status === 'loading' && <BookingSkeleton />}

        {!notFound && status === 'error' && (
          <ErrorState message="تعذّر تحميل مواعيد الطبيب." onRetry={retry}>
            <Link to="/doctors">العودة إلى الأطباء</Link>
          </ErrorState>
        )}

        {shown && <BookingWorkspace doctor={shown.doctor} initialAvailability={shown.availability} />}
      </div>
    </>
  );
}

// A6: حجز موعد مع طبيب (عام: التصفح بلا تسجيل دخول، وتأكيد الحجز للمريض المسجَّل فقط).
// المعرّف من الرابط /doctors/:id/book، والاختيار من ?date=YYYY-MM-DD&time=HH:mm، والمواعيد من الخادم، وتأكيد الحجز عبر POST /api/appointments.
// key بالمعرّف: عند تغيير الطبيب تبدأ الحالة من جديد.
export default function AppointmentBookingPage() {
  const { id } = useParams();
  return <AppointmentBooking key={id} id={id} />;
}
