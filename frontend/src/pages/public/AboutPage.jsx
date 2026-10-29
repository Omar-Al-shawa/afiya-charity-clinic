import { Link } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import {
  CLINIC_NAME,
  CLOSED_DAY_LABEL,
  WORKING_DAYS_LABEL,
  WORKING_HOURS,
} from '../../utils/constants';
import { formatTime12 } from '../../utils/format';

const FREE_SERVICES = [
  'استشارات طبية في تخصصات متعددة',
  'حجز المواعيد عبر الإنترنت دون أي رسوم',
  'تصفّح الأطباء ومواعيدهم المتاحة قبل الحجز',
];

// A2: عن المجمع. صفحة ثابتة، ولا تحتوي إلا على معلومات معتمدة في المتطلبات.
export default function AboutPage() {
  useDocumentTitle('عن المجمع');

  return (
    <>
      <PageHeader
        title={`عن ${CLINIC_NAME}`}
        subtitle="تعرّف على رسالتنا وخدماتنا."
        breadcrumb={[{ label: 'عن المجمع' }]}
      />

      <div className="container">
        <div className="af-about">
          <section className="af-about-section" aria-labelledby="mission-title">
            <h2 id="mission-title">رسالتنا</h2>
            <p>
              يقدّم {CLINIC_NAME} خدماته الطبية مجاناً لكل من يحتاجها، إيماناً بأن الرعاية الصحية حق
              للجميع، وبأن الوصول إليها يجب أن يكون سهلاً ودون تكلفة.
            </p>
          </section>

          <section className="af-about-section" aria-labelledby="who-title">
            <h2 id="who-title">من نحن</h2>
            <p>
              مجمع طبي خيري في دمشق، يضم عيادات في عدة تخصصات طبية يعمل فيها أطباء متعددون. وللتسهيل
              على المرضى، يتيح الموقع تصفّح التخصصات والأطباء وحجز المواعيد عبر الإنترنت.
            </p>
          </section>

          <section className="af-about-section" aria-labelledby="services-title">
            <h2 id="services-title">خدماتنا المجانية</h2>
            <p>جميع الاستشارات والخدمات الطبية في المجمع مجانية، ولا يُطلب من المريض أي مقابل.</p>
            <ul className="af-service-list">
              {FREE_SERVICES.map((service) => (
                <li key={service}>
                  <i className="bi bi-check2-circle" aria-hidden="true" />
                  <span>{service}</span>
                </li>
              ))}
            </ul>
            <p className="af-note">
              <i className="bi bi-info-circle" aria-hidden="true" />
              <span>هذا الموقع لا يستقبل أي مدفوعات.</span>
            </p>
          </section>

          <section className="af-about-section" aria-labelledby="hours-title">
            <h2 id="hours-title">ساعات العمل والموقع</h2>
            <div className="af-card af-info-card">
              <div className="af-info-row">
                <i className="bi bi-clock" aria-hidden="true" />
                <div>
                  <strong>ساعات العمل</strong>
                  <span>
                    {WORKING_DAYS_LABEL}،{' '}
                    <bdi>
                      {formatTime12(WORKING_HOURS.open)} – {formatTime12(WORKING_HOURS.close)}
                    </bdi>
                  </span>
                  <span className="af-muted">{CLOSED_DAY_LABEL} عطلة</span>
                </div>
              </div>
              <div className="af-info-row">
                <i className="bi bi-geo-alt" aria-hidden="true" />
                <div>
                  <strong>العنوان</strong>
                  <span>دمشق - البرامكة، بجانب ملعب تشرين</span>
                </div>
              </div>
            </div>
          </section>

          <div className="af-about-cta">
            <Link to="/doctors" className="btn btn-primary">
              <i className="bi bi-people" aria-hidden="true" />
              تصفّح الأطباء
            </Link>
            <Link to="/contact" className="btn btn-outline-primary">
              <i className="bi bi-envelope" aria-hidden="true" />
              تواصل معنا
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
