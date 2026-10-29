import { Link } from 'react-router-dom';
import { LogoMark } from '../../components/common/Logo';
import SpecialtyCard, { SpecialtyCardSkeleton } from '../../components/cards/SpecialtyCard';
import DoctorCard, { DoctorCardSkeleton } from '../../components/cards/DoctorCard';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { fetchSpecialties } from '../../api/specialties';
import { fetchDoctors } from '../../api/doctors';
import {
  CLINIC_NAME,
  CLOSED_DAY_LABEL,
  WORKING_DAYS_LABEL,
  WORKING_HOURS,
} from '../../utils/constants';
import { formatTime12 } from '../../utils/format';

// التخصصات والأطباء المعروضون في الرئيسية (معرّفات البيانات التجريبية الحالية)
const FEATURED_SPECIALTY_IDS = [18, 2, 15, 14, 1, 19];
const FEATURED_DOCTOR_SPECIALTY_IDS = [18, 2, 15, 14];

const TRUST_ITEMS = [
  { icon: 'bi-heart', title: 'خدمات مجانية بالكامل', text: 'جميع الاستشارات والخدمات الطبية في المجمع بلا أي تكلفة.' },
  { icon: 'bi-person-badge', title: 'أطباؤنا', text: 'تعرّف على أطباء المجمع وتخصصاتهم.' },
  { icon: 'bi-calendar-check', title: 'حجز إلكتروني سهل', text: 'اختر الطبيب والموعد المناسب واحجز من أي جهاز.' },
];

const STEPS = [
  { icon: 'bi-clipboard2-pulse', title: 'اختر التخصص', text: 'تصفّح التخصصات الطبية المتاحة في المجمع.' },
  { icon: 'bi-person-badge', title: 'اختر الطبيب', text: 'تعرّف على الأطباء واطّلع على ملف كل طبيب.' },
  { icon: 'bi-calendar-check', title: 'اختر الموعد', text: 'حدّد اليوم والوقت المناسبين من المواعيد المتاحة.' },
  { icon: 'bi-check-circle', title: 'أكّد الحجز', text: 'سجّل دخولك وأكّد حجزك. الخدمة مجانية.' },
];

function SectionHead({ id, title, subtitle, linkTo, linkLabel }) {
  return (
    <div className="af-section-head">
      <div>
        <h2 id={id}>{title}</h2>
        {subtitle && <p className="af-muted mb-0">{subtitle}</p>}
      </div>
      {linkTo && (
        <Link to={linkTo} className="af-section-link">
          {linkLabel}
          <i className="bi bi-arrow-left" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

// عند فشل تحميل قسم لا نعطّل الصفحة كلها: رسالة قصيرة مع إعادة المحاولة ورابط للدليل الكامل
function SectionError({ message, linkTo, linkLabel, onRetry }) {
  return (
    <div className="af-inline-note" role="alert">
      <span>{message}</span>
      <button type="button" className="btn btn-outline-primary" onClick={onRetry}>
        إعادة المحاولة
      </button>
      <Link to={linkTo}>{linkLabel}</Link>
    </div>
  );
}

function FeaturedSpecialties() {
  const { status, data, retry } = useAsyncData(fetchSpecialties);

  return (
    <section className="af-section" aria-labelledby="specialties-title">
      <div className="container">
        <SectionHead
          id="specialties-title"
          title="التخصصات الطبية"
          subtitle="اختر التخصص للوصول إلى أطبائه ومواعيدهم."
          linkTo="/specialties"
          linkLabel="كل التخصصات"
        />
        {status === 'loading' && (
          <div className="row g-3" role="status" aria-busy="true">
            <span className="visually-hidden">جارٍ تحميل التخصصات…</span>
            {FEATURED_SPECIALTY_IDS.map((id) => (
              <div className="col-12 col-sm-6 col-lg-4" key={id}>
                <SpecialtyCardSkeleton />
              </div>
            ))}
          </div>
        )}
        {status === 'error' && (
          <SectionError
            message="تعذّر تحميل التخصصات."
            linkTo="/specialties"
            linkLabel="عرض كل التخصصات"
            onRetry={retry}
          />
        )}
        {status === 'success' && (
          <div className="row g-3">
            {FEATURED_SPECIALTY_IDS.map((id) => data.find((s) => s.id === id))
              .filter(Boolean)
              .map((specialty) => (
                <div className="col-12 col-sm-6 col-lg-4" key={specialty.id}>
                  <SpecialtyCard specialty={specialty} />
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FeaturedDoctors() {
  const { status, data, retry } = useAsyncData(fetchDoctors);

  return (
    <section className="af-section pt-0" aria-labelledby="doctors-title">
      <div className="container">
        <SectionHead
          id="doctors-title"
          title="أطباؤنا"
          subtitle="تعرّف على بعض أطباء المجمع."
          linkTo="/doctors"
          linkLabel="كل الأطباء"
        />
        {status === 'loading' && (
          <div className="row g-3" role="status" aria-busy="true">
            <span className="visually-hidden">جارٍ تحميل الأطباء…</span>
            {FEATURED_DOCTOR_SPECIALTY_IDS.map((id) => (
              <div className="col-12 col-sm-6 col-lg-3" key={id}>
                <DoctorCardSkeleton />
              </div>
            ))}
          </div>
        )}
        {status === 'error' && (
          <SectionError
            message="تعذّر تحميل الأطباء."
            linkTo="/doctors"
            linkLabel="عرض كل الأطباء"
            onRetry={retry}
          />
        )}
        {status === 'success' && (
          <div className="row g-3">
            {FEATURED_DOCTOR_SPECIALTY_IDS.map((specialtyId) =>
              data.find((d) => d.specialtyId === specialtyId),
            )
              .filter(Boolean)
              .map((doctor) => (
                <div className="col-12 col-sm-6 col-lg-3" key={doctor.id}>
                  <DoctorCard doctor={doctor} />
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  useDocumentTitle('');

  return (
    <>
      {/* البطل */}
      <section className="af-hero" aria-labelledby="hero-title">
        <div className="container">
          {/* رمز المجمع وحده فوق الصورة، في أعلى اليسار (زخرفي) */}
          <LogoMark className="af-hero-logo" />
          <div className="row align-items-center g-4">
            <div className="col-12 col-lg-7">
              <p className="af-hero-kicker">{CLINIC_NAME}</p>
              <span className="af-free-badge">
                <i className="bi bi-heart-fill" aria-hidden="true" />
                جميع الخدمات مجانية
              </span>
              <h1 id="hero-title" className="mb-3">
                رعاية طبية مجانية لكل من يحتاجها
              </h1>
              <p className="af-hero-lead">
                احجز موعدك مع أطباء المجمع في مختلف التخصصات عبر الإنترنت، بسهولة ودون أي تكلفة.
              </p>
              <div className="d-grid d-sm-flex gap-2">
                <Link to="/doctors" className="btn btn-primary btn-lg">
                  <i className="bi bi-calendar-check" aria-hidden="true" />
                  احجز موعداً
                </Link>
                <Link to="/specialties" className="btn btn-outline-primary btn-lg">
                  تصفّح التخصصات
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* شريط الثقة */}
      <section className="af-section pb-0" aria-label="مزايا المجمع">
        <div className="container">
          <div className="row g-3">
            {TRUST_ITEMS.map((item) => (
              <div className="col-12 col-md-4" key={item.title}>
                <div className="af-card af-trust-card h-100">
                  <span className="af-trust-icon" aria-hidden="true">
                    <i className={`bi ${item.icon}`} />
                  </span>
                  <div>
                    <h3 className="h5">{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* كيف تحجز موعدك؟ */}
      <section className="af-section" aria-labelledby="how-title">
        <div className="container">
          <SectionHead id="how-title" title="كيف تحجز موعدك؟" />
          <ol className="af-steps row g-3">
            {STEPS.map((step, index) => (
              <li className="col-12 col-sm-6 col-lg-3" key={step.title}>
                <div className="af-card af-step">
                  <span className="af-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="h5">{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="af-step-note">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <span>
              يمكنك تصفّح المواعيد دون حساب، ويلزم تسجيل الدخول لتأكيد الحجز. الحجز متاح خلال 14 يوماً
              من اليوم.
            </span>
          </p>
        </div>
      </section>

      <FeaturedSpecialties />
      <FeaturedDoctors />

      {/* ساعات العمل */}
      <section className="container pb-5" aria-label="ساعات العمل">
        <div className="af-card af-hours">
          <span className="af-hours-icon" aria-hidden="true">
            <i className="bi bi-clock" />
          </span>
          <div className="af-hours-text">
            <strong>ساعات العمل</strong>
            <span>
              {WORKING_DAYS_LABEL}،{' '}
              <bdi>
                {formatTime12(WORKING_HOURS.open)} – {formatTime12(WORKING_HOURS.close)}
              </bdi>
            </span>{' '}
            <span className="af-hours-closed">{CLOSED_DAY_LABEL} عطلة</span>
          </div>
          <div className="af-hours-links">
            <Link to="/about" className="btn btn-outline-primary">
              عن المجمع
            </Link>
            <Link to="/contact" className="btn btn-outline-primary">
              تواصل معنا
            </Link>
          </div>
        </div>
      </section>

      {/* دعوة الدعم */}
      <section className="container pb-5" aria-labelledby="donate-title">
        <div className="af-donate">
          <div>
            <h2 id="donate-title" className="h3">
              ساهم في استمرار الخدمة المجانية
            </h2>
            <p>دعمك يساعد المجمع على مواصلة تقديم الرعاية الطبية لمن يحتاجها.</p>
          </div>
          <Link to="/donations" className="btn btn-accent btn-lg">
            <i className="bi bi-heart" aria-hidden="true" />
            طرق التبرع
          </Link>
        </div>
      </section>
    </>
  );
}
