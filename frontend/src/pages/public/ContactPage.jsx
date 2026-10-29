import { useRef, useState } from 'react';
import AuthField from '../../components/auth/AuthField';
import PageHeader from '../../components/common/PageHeader';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { sendContactMessage } from '../../api/contact';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../../api/http';
import { CLOSED_DAY_LABEL, WORKING_DAYS_LABEL, WORKING_HOURS } from '../../utils/constants';
import { normalizeContactField, validateContact, validateField, FIELD_ORDER } from '../../utils/contactValidation';
import { formatTime12 } from '../../utils/format';

// A10: تواصل معنا. بعد التحقق في الواجهة يُرسل النموذج إلى POST /api/contact.
// عند الفشل تبقى القيم في النموذج مع رسالة الخطأ، وتُمسح القيم عند النجاح فقط.

const EMPTY_VALUES = { name: '', email: '', subject: '', message: '' };
const NO_ERRORS = { name: '', email: '', subject: '', message: '' };

export default function ContactPage() {
  useDocumentTitle('تواصل معنا');

  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [notice, setNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const sending = useRef(false); // يمنع الإرسال المزدوج قبل أن يُعاد الرسم

  // عناصر التحكم بحسب الحقل (للتركيز على أول حقل غير صالح)
  const controls = useRef({});
  const setControl = (field) => (element) => {
    controls.current[field] = element;
  };
  // الحقول التي بدأ المستخدم الكتابة فيها، ومحاولة الإرسال: لا تظهر أخطاء عند مجرد التنقل بـ Tab فوق حقل فارغ
  const dirty = useRef({});
  const attempted = useRef(false);

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    dirty.current[field] = true;
    setValues((current) => ({ ...current, [field]: value }));
    // يُمسح الخطأ فور أن تصبح القيمة صحيحة؛ لا يظهر خطأ جديد أثناء الكتابة
    if (errors[field] && !validateField(field, value)) {
      setErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  // عند الخروج من الحقل: تُطبَّق القيمة المطبَّعة (قص، توحيد المسافات) ثم يُتحقق منه إن كان قد لُمس
  const handleBlur = (field) => () => {
    const value = normalizeContactField(field, values[field]);
    if (value !== values[field]) setValues((current) => ({ ...current, [field]: value }));
    if (!dirty.current[field] && !attempted.current) return;
    setErrors((current) => ({ ...current, [field]: validateField(field, value) }));
  };

  // أخطاء الخادم: أخطاء الحقول تُربط بالحقول وينتقل التركيز إليها، وغيرها تظهر رسالة عامة تحت الزر
  const showFailure = (error) => {
    if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.fields) {
      const fromServer = Object.fromEntries(
        FIELD_ORDER.map((field) => [field, typeof error.fields[field] === 'string' ? error.fields[field] : '']),
      );
      const firstInvalid = FIELD_ORDER.find((field) => fromServer[field]);
      if (firstInvalid) {
        setErrors(fromServer);
        controls.current[firstInvalid]?.focus();
        return;
      }
    }
    setFormError(error instanceof ApiError ? error.message : NETWORK_ERROR_MESSAGE);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending.current) return;
    attempted.current = true;
    setNotice(false);
    setFormError('');

    const normalized = Object.fromEntries(FIELD_ORDER.map((field) => [field, normalizeContactField(field, values[field])]));
    const next = validateContact(normalized);
    setErrors(next);

    // التركيز على أول حقل غير صالح بترتيب ظهوره
    const firstInvalid = FIELD_ORDER.find((field) => next[field]);
    if (firstInvalid) {
      controls.current[firstInvalid]?.focus();
      return;
    }

    setValues(normalized);
    sending.current = true;
    setSubmitting(true);
    try {
      await sendContactMessage(normalized);
    } catch (error) {
      showFailure(error);
      return;
    } finally {
      sending.current = false;
      setSubmitting(false);
    }

    // نجاح: تُمسح القيم بعد الإرسال الفعلي فقط
    setValues(EMPTY_VALUES);
    setErrors(NO_ERRORS);
    dirty.current = {};
    attempted.current = false;
    setNotice(true);
  };

  return (
    <>
      <PageHeader
        title="تواصل معنا"
        subtitle="أرسل رسالتك أو استفسارك إلى إدارة مجمع عافية الطبي الخيري."
        breadcrumb={[{ label: 'تواصل معنا' }]}
      />

      <div className="container">
        <div className="af-contact">
          <section className="af-card af-contact-card" aria-labelledby="contact-form-title">
            <h2 id="contact-form-title">أرسل رسالة إلى الإدارة</h2>
            <p className="af-contact-required">جميع الحقول مطلوبة</p>

            {/* noValidate: رسائل التحقق عربية ومخصصة. method=post احتياط حتى لا تظهر الرسالة في الرابط إن تعطّل المعالج */}
            <form onSubmit={handleSubmit} method="post" noValidate>
              <AuthField
                id="contact-name"
                label="الاسم"
                name="name"
                type="text"
                autoComplete="name"
                inputRef={setControl('name')}
                value={values.name}
                onChange={handleChange('name')}
                onBlur={handleBlur('name')}
                error={errors.name}
              />
              <AuthField
                id="contact-email"
                label="البريد الإلكتروني"
                name="email"
                type="email"
                dir="ltr"
                placeholder="name@example.com"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                inputRef={setControl('email')}
                value={values.email}
                onChange={handleChange('email')}
                onBlur={handleBlur('email')}
                error={errors.email}
              />
              <AuthField
                id="contact-subject"
                label="الموضوع"
                name="subject"
                type="text"
                autoComplete="off"
                inputRef={setControl('subject')}
                value={values.subject}
                onChange={handleChange('subject')}
                onBlur={handleBlur('subject')}
                error={errors.subject}
              />
              <AuthField
                id="contact-message"
                label="الرسالة"
                as="textarea"
                name="message"
                rows={5}
                hint="حتى 2000 حرف"
                inputRef={setControl('message')}
                value={values.message}
                onChange={handleChange('message')}
                onBlur={handleBlur('message')}
                error={errors.message}
              />

              <button type="submit" className="btn btn-primary af-auth-submit" disabled={submitting}>
                <i className="bi bi-send" aria-hidden="true" />
                {submitting ? 'جارٍ الإرسال…' : 'إرسال الرسالة'}
              </button>
            </form>

            <div role="status">
              {notice && (
                <p className="af-note af-auth-notice">
                  <i className="bi bi-check-circle" aria-hidden="true" />
                  <span>تم إرسال رسالتك إلى الإدارة. شكراً لتواصلك.</span>
                </p>
              )}
            </div>
            <div role="alert">
              {formError && (
                <p className="af-auth-error mt-3 mb-0">
                  <i className="bi bi-exclamation-circle" aria-hidden="true" />
                  <span>{formError}</span>
                </p>
              )}
            </div>
          </section>

          <p className="af-note af-contact-warning">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>هذا النموذج مخصص للاستفسارات العامة، وليس للحالات الطبية الطارئة.</span>
          </p>

          <section aria-labelledby="contact-hours-title">
            <h2 id="contact-hours-title" className="af-contact-hours-title">
              ساعات العمل
            </h2>
            <div className="af-card af-info-card">
              <div className="af-info-row">
                <i className="bi bi-clock" aria-hidden="true" />
                <div>
                  <strong>{WORKING_DAYS_LABEL}</strong>
                  <span>
                    <bdi>
                      {formatTime12(WORKING_HOURS.open)} – {formatTime12(WORKING_HOURS.close)}
                    </bdi>{' '}
                    بتوقيت دمشق
                  </span>
                </div>
              </div>
              <div className="af-info-row">
                <i className="bi bi-calendar-x" aria-hidden="true" />
                <div>
                  <strong>{CLOSED_DAY_LABEL}</strong>
                  <span>عطلة</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
