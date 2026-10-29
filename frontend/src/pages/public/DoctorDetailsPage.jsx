import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Skeleton from '../../components/common/Skeleton';
import DoctorAvatar from '../../components/cards/DoctorAvatar';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { fetchDoctorById } from '../../api/doctors';
import {
  BOOKING_WINDOW_DAYS,
  CLOSED_DAY_LABEL,
  WORKING_DAYS_LABEL,
  WORKING_HOURS,
} from '../../utils/constants';
import { formatMinutes, formatTime12, formatYears } from '../../utils/format';
import { parsePositiveIntParam } from '../../utils/queryParams';

const DOCTORS_BREADCRUMB = { label: 'الأطباء', to: '/doctors' };

function InfoRow({ icon, label, children }) {
  return (
    <div className="af-info-row">
      <i className={`bi ${icon}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        {children}
      </div>
    </div>
  );
}

// الانتقال إلى صفحة حجز الموعد الخاصة بالطبيب (A6)
function BookingAction({ doctorId }) {
  return (
    <div className="af-card af-info-card">
      <h2 className="h5 mb-0">حجز موعد</h2>
      <p className="af-muted mb-0">
        يمكنك تصفّح معلومات الطبيب دون حساب، ويلزم تسجيل الدخول لتأكيد الحجز.
      </p>
      <div>
        <Link to={`/doctors/${doctorId}/book`} className="btn btn-primary btn-lg af-details-book">
          <i className="bi bi-calendar-check" aria-hidden="true" />
          احجز موعداً
        </Link>
      </div>
    </div>
  );
}

function DoctorProfile({ doctor }) {
  const { fullName, specialtyId, specialtyName, age, yearsOfExperience, appointmentDuration, imageUrl } = doctor;
  // النبذة التعريفية اختيارية: تظهر نصاً عادياً (React يهرّب أي وسوم) وفقط إن وُجد نص غير فارغ
  const biography = typeof doctor.biography === 'string' ? doctor.biography.trim() : '';

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-4">
        {/* الصورة تزيينية داخل DoctorAvatar (alt فارغ)، فيُعطى الإطار اسماً مفهوماً لقارئ الشاشة */}
        <div className="af-card af-doctor-portrait">
          <div className="af-doctor-media" role="img" aria-label={`صورة ${fullName}`}>
            <DoctorAvatar src={imageUrl} />
          </div>
        </div>
      </div>

      <div className="col-12 col-lg-8">
        <div className="af-details-stack">
          <section className="af-card af-info-card" aria-labelledby="doctor-info-title">
            <h2 id="doctor-info-title" className="h5 mb-0">
              معلومات الطبيب
            </h2>
            <InfoRow icon="bi-person-badge" label="الاسم">
              <span>{fullName}</span>
            </InfoRow>
            <InfoRow icon="bi-clipboard2-pulse" label="التخصص">
              <span>
                <Link to={`/doctors?specialty=${specialtyId}`}>{specialtyName}</Link>
              </span>
            </InfoRow>
            <InfoRow icon="bi-person" label="العمر">
              <span>{formatYears(age)}</span>
            </InfoRow>
            {yearsOfExperience != null && (
              <InfoRow icon="bi-award" label="سنوات الخبرة">
                <span>{formatYears(yearsOfExperience)}</span>
              </InfoRow>
            )}
            {biography && (
              <InfoRow icon="bi-card-text" label="نبذة تعريفية">
                <span style={{ whiteSpace: 'pre-line' }}>{biography}</span>
              </InfoRow>
            )}
          </section>

          <section className="af-card af-info-card" aria-labelledby="doctor-schedule-title">
            <h2 id="doctor-schedule-title" className="h5 mb-0">
              الدوام والمواعيد
            </h2>
            <InfoRow icon="bi-calendar-week" label="أيام الدوام">
              <span>{WORKING_DAYS_LABEL}</span>
              <span className="af-muted">{CLOSED_DAY_LABEL} عطلة</span>
            </InfoRow>
            <InfoRow icon="bi-clock" label="ساعات الدوام">
              <span>
                <bdi>
                  {formatTime12(WORKING_HOURS.open)} – {formatTime12(WORKING_HOURS.close)}
                </bdi>
              </span>
              <span className="af-muted">بتوقيت دمشق</span>
            </InfoRow>
            <InfoRow icon="bi-stopwatch" label="مدة الموعد">
              <span>{formatMinutes(appointmentDuration)}</span>
            </InfoRow>
            <InfoRow icon="bi-calendar-check" label="فترة الحجز">
              {/* "يوماً" صحيحة للأعداد من 11 إلى 99 */}
              <span>الحجز متاح خلال {BOOKING_WINDOW_DAYS} يوماً من اليوم</span>
            </InfoRow>
          </section>

          <BookingAction doctorId={doctor.id} />
        </div>
      </div>
    </div>
  );
}

// أجزاء الهيكل: كل سطر داخل كتلة بارتفاع سطر النص الفعلي، فتتطابق ارتفاعات الصفوف مع الصفحة المحمّلة
function SkeletonLine({ width }) {
  return (
    <span className="d-block">
      <Skeleton style={{ width, height: 16 }} />
    </span>
  );
}

function SkeletonRow({ lines = 2 }) {
  return (
    <div className="af-info-row">
      <Skeleton className="af-skeleton--circle" style={{ flex: 'none', width: 44, height: 44 }} />
      <div className="flex-grow-1">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonLine key={i} width={i === 0 ? '30%' : '55%'} />
        ))}
      </div>
    </div>
  );
}

function SkeletonCard({ rows, children }) {
  return (
    <div className="af-card af-info-card">
      <h2 className="h5 mb-0">
        <Skeleton style={{ width: '35%', height: 18 }} />
      </h2>
      {rows.map((lines, i) => (
        <SkeletonRow key={i} lines={lines} />
      ))}
      {children}
    </div>
  );
}

// هيكل التحميل: يطابق بنية الصفحة (صورة مربعة وثلاث بطاقات) لتقليل القفز عند وصول البيانات
function DoctorDetailsSkeleton() {
  return (
    <div className="row g-4" role="status" aria-busy="true">
      <span className="visually-hidden">جارٍ تحميل بيانات الطبيب…</span>
      <div className="col-12 col-lg-4">
        <div className="af-card af-doctor-portrait" aria-hidden="true">
          <div className="af-doctor-media">
            <Skeleton className="d-block w-100 h-100" style={{ borderRadius: 0 }} />
          </div>
        </div>
      </div>
      <div className="col-12 col-lg-8">
        <div className="af-details-stack" aria-hidden="true">
          <SkeletonCard rows={[2, 2, 2, 2]} />
          <SkeletonCard rows={[3, 3, 2, 2]} />
          <div className="af-card af-info-card">
            <h2 className="h5 mb-0">
              <Skeleton style={{ width: '25%', height: 18 }} />
            </h2>
            <div>
              <SkeletonLine width="90%" />
              <SkeletonLine width="60%" />
            </div>
            <Skeleton className="d-block af-details-book" style={{ height: 52 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctorDetails({ id }) {
  const doctorId = parsePositiveIntParam(id);
  // المعرّف غير الصالح لا يطلب بيانات: يظهر "غير موجود" مباشرة
  const { status, data: doctor, retry } = useAsyncData(
    () => (doctorId === null ? Promise.resolve(null) : fetchDoctorById(doctorId)),
    [doctorId],
  );

  const notFound = doctorId === null || (status === 'success' && doctor === null);
  const shown = !notFound && status === 'success' ? doctor : null;

  useDocumentTitle(shown ? shown.fullName : notFound ? 'الطبيب غير موجود' : 'ملف الطبيب');

  return (
    <>
      <PageHeader
        title={shown ? shown.fullName : notFound ? 'الطبيب غير موجود' : 'ملف الطبيب'}
        subtitle={shown ? shown.specialtyName : !notFound && status === 'loading' ? <Skeleton style={{ width: 160, height: 16 }} /> : undefined}
        breadcrumb={[DOCTORS_BREADCRUMB, { label: shown ? shown.fullName : 'ملف الطبيب' }]}
      />

      <div className="container af-doctor-details">
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

        {!notFound && status === 'loading' && <DoctorDetailsSkeleton />}

        {!notFound && status === 'error' && (
          <ErrorState message="تعذّر تحميل بيانات الطبيب." onRetry={retry}>
            <Link to="/doctors">العودة إلى الأطباء</Link>
          </ErrorState>
        )}

        {shown && <DoctorProfile doctor={shown} />}
      </div>
    </>
  );
}

// A5: ملف الطبيب (عام: بلا تسجيل دخول). المعرّف من الرابط /doctors/:id والبيانات من fetchDoctorById().
// key بالمعرّف: عند الانتقال من طبيب إلى آخر تبدأ الحالة من جديد (تحميل) فلا تظهر بيانات الطبيب السابق.
export default function DoctorDetailsPage() {
  const { id } = useParams();
  return <DoctorDetails key={id} id={id} />;
}
