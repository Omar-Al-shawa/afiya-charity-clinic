import { Link } from 'react-router-dom';
import Logo from '../common/Logo';
import {
  CLINIC_NAME,
  CLOSED_DAY_LABEL,
  NAV_LINKS,
  WORKING_DAYS_LABEL,
  WORKING_HOURS,
} from '../../utils/constants';
import { formatTime12 } from '../../utils/format';

export default function Footer() {
  return (
    <footer className="af-footer">
      <div className="container">
        <div className="row g-4 py-5">
          <div className="col-12 col-lg-4">
            <Logo variant="full" />
            <p className="af-muted mt-3 mb-0">
              مجمع طبي خيري في دمشق، يقدّم خدماته الطبية مجاناً ويتيح حجز المواعيد عبر الإنترنت.
            </p>
          </div>

          <div className="col-6 col-lg-2">
            <h2 className="af-footer-title">روابط سريعة</h2>
            <ul className="list-unstyled mb-0">
              {NAV_LINKS.map((link) => (
                <li key={link.to} className="mb-2">
                  <Link to={link.to} className="af-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-6 col-lg-3">
            <h2 className="af-footer-title">تواصل معنا</h2>
            <ul className="list-unstyled mb-0 af-footer-contact">
              <li>
                <i className="bi bi-geo-alt" aria-hidden="true" />
                <span>دمشق - البرامكة، بجانب ملعب تشرين</span>
              </li>
              <li>
                <i className="bi bi-telephone" aria-hidden="true" />
                {/* الرقم والبريد لاتينيان: dir=ltr يحفظ ترتيبهما داخل الصفحة العربية */}
                <a href="tel:+963932132132" dir="ltr" className="af-footer-link">
                  +963 932 132 132
                </a>
              </li>
              <li>
                <i className="bi bi-envelope" aria-hidden="true" />
                <a href="mailto:Aafya_Charity@gmail.com" dir="ltr" className="af-footer-link">
                  Aafya_Charity@<wbr />gmail.com
                </a>
              </li>
            </ul>
          </div>

          <div className="col-12 col-lg-3">
            <h2 className="af-footer-title">ساعات العمل</h2>
            <p className="mb-1">
              {WORKING_DAYS_LABEL}،{' '}
              <bdi>
                {formatTime12(WORKING_HOURS.open)} – {formatTime12(WORKING_HOURS.close)}
              </bdi>
            </p>
            <p className="af-muted mb-0">{CLOSED_DAY_LABEL} عطلة</p>
          </div>
        </div>

        <div className="af-footer-bottom">
          <small>
            بيانات الأطباء وصورهم في هذا الموقع لأغراض العرض التوضيحي فقط.
          </small>
          <small>
            © {new Date().getFullYear()} {CLINIC_NAME}
          </small>
        </div>
      </div>
    </footer>
  );
}
