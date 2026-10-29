import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthField from '../../components/auth/AuthField';
import PasswordField from '../../components/auth/PasswordField';
import { registerRequest } from '../../api/auth';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../../api/http';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { buildLoginPath } from '../../utils/redirect';
import {
  BLOOD_TYPES,
  BLOOD_TYPE_UNKNOWN,
  FIELD_ORDER,
  GENDERS,
  MIN_BIRTHDATE,
  getMaxBirthdate,
  normalizeField,
  validateField,
  validateRegistration,
} from '../../utils/registrationValidation';

// A8: تسجيل مريض جديد. بعد التحقق في الواجهة يُرسل النموذج إلى POST /api/auth/register.
// الخادم لا يسجّل الدخول تلقائياً: عند النجاح ننتقل إلى /login (مع next الآمن) برسالة نجاح.
// عند الفشل تبقى القيم في النموذج مع رسالة الخطأ.

const EMPTY_VALUES = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  birthdate: '',
  address: '',
  gender: '',
  bloodType: '',
};
const NO_ERRORS = Object.fromEntries(FIELD_ORDER.map((field) => [field, '']));

export default function RegisterPage() {
  useDocumentTitle('إنشاء حساب');

  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const sending = useRef(false); // يمنع الإرسال المزدوج قبل أن يُعاد الرسم
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // عناصر التحكم بحسب الحقل (للتركيز على أول حقل غير صالح ولقراءة validity.badInput للتاريخ)
  const controls = useRef({});
  const setControl = (field) => (element) => {
    controls.current[field] = element;
  };
  // الحقول التي بدأ المستخدم الكتابة فيها، ومحاولة الإرسال: لا تظهر أخطاء عند مجرد التنقل بـ Tab فوق حقل فارغ
  const dirty = useRef({});
  const attempted = useRef(false);

  // التاريخ المكتوب جزئياً يعيد قيمة فارغة؛ نميّزه عن الفارغ تماماً
  const contextFor = (field) =>
    field === 'birthdate' ? { badInput: Boolean(controls.current.birthdate?.validity.badInput) } : undefined;

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    dirty.current[field] = true;
    setValues((current) => ({ ...current, [field]: value }));
    // يُمسح الخطأ فور أن تصبح القيمة صحيحة؛ لا يظهر خطأ جديد أثناء الكتابة
    if (errors[field] && !validateField(field, value, contextFor(field))) {
      setErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  // عند الخروج من الحقل: تُطبَّق القيمة المطبَّعة (قص، توحيد الأرقام...) ثم يُتحقق منه إن كان قد لُمس
  const handleBlur = (field) => () => {
    const value = normalizeField(field, values[field]);
    if (value !== values[field]) setValues((current) => ({ ...current, [field]: value }));
    if (!dirty.current[field] && !attempted.current) return;
    setErrors((current) => ({ ...current, [field]: validateField(field, value, contextFor(field)) }));
  };

  // أخطاء الخادم: أخطاء الحقول (ومنها EMAIL_TAKEN تحت البريد) تُربط بالحقول وينتقل التركيز إلى أولها،
  // وغيرها (محاولات كثيرة، شبكة، خادم) رسالة عامة تحت النموذج
  const showFailure = (error) => {
    if (error instanceof ApiError && error.fields) {
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
    setFormError('');

    const normalized = Object.fromEntries(FIELD_ORDER.map((field) => [field, normalizeField(field, values[field])]));
    const next = validateRegistration(normalized, contextFor('birthdate'));
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
      await registerRequest(normalized);
    } catch (error) {
      showFailure(error);
      return;
    } finally {
      sending.current = false;
      setSubmitting(false);
    }

    // نجاح: لا جلسة بعد التسجيل؛ إلى صفحة الدخول مع next الآمن (إن وُجد) ورسالة النجاح
    navigate(buildLoginPath(searchParams.get('next')), { state: { registered: true } });
  };

  return (
    <>
      <h1 className="af-auth-title">إنشاء حساب جديد</h1>
      <p className="af-auth-lead af-auth-lead--note">
        أنشئ حسابك كمريض للاستفادة من خدمات حجز المواعيد في مجمع عافية الطبي الخيري.
      </p>
      <p className="af-auth-required">جميع الحقول مطلوبة عدا زمرة الدم</p>

      {/* noValidate: رسائل التحقق عربية ومخصصة. method=post احتياط حتى لا تظهر البيانات في الرابط إن تعطّل المعالج */}
      <form onSubmit={handleSubmit} method="post" noValidate>
        <div className="af-auth-row">
          <AuthField
            id="register-first-name"
            label="الاسم الأول"
            name="firstName"
            type="text"
            autoComplete="given-name"
            inputRef={setControl('firstName')}
            value={values.firstName}
            onChange={handleChange('firstName')}
            onBlur={handleBlur('firstName')}
            error={errors.firstName}
          />
          <AuthField
            id="register-last-name"
            label="اسم العائلة"
            name="lastName"
            type="text"
            autoComplete="family-name"
            inputRef={setControl('lastName')}
            value={values.lastName}
            onChange={handleChange('lastName')}
            onBlur={handleBlur('lastName')}
            error={errors.lastName}
          />
        </div>

        <AuthField
          id="register-email"
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

        <PasswordField
          id="register-password"
          label="كلمة المرور"
          autoComplete="new-password"
          hint="8 أحرف على الأقل"
          inputRef={setControl('password')}
          value={values.password}
          onChange={handleChange('password')}
          onBlur={handleBlur('password')}
          error={errors.password}
          visible={showPassword}
          onToggle={() => setShowPassword((current) => !current)}
        />

        <div className="af-auth-row">
          <AuthField
            id="register-phone"
            label="رقم الهاتف"
            name="phone"
            type="tel"
            inputMode="numeric"
            dir="ltr"
            placeholder="09xxxxxxxx"
            autoComplete="tel-national"
            inputRef={setControl('phone')}
            value={values.phone}
            onChange={handleChange('phone')}
            onBlur={handleBlur('phone')}
            error={errors.phone}
          />
          <AuthField
            id="register-birthdate"
            label="تاريخ الميلاد"
            name="birthdate"
            type="date"
            min={MIN_BIRTHDATE}
            max={getMaxBirthdate()}
            autoComplete="bday"
            inputRef={setControl('birthdate')}
            value={values.birthdate}
            onChange={handleChange('birthdate')}
            onBlur={handleBlur('birthdate')}
            error={errors.birthdate}
          />
        </div>

        <AuthField
          id="register-address"
          label="عنوان السكن"
          as="textarea"
          name="address"
          rows={2}
          autoComplete="street-address"
          inputRef={setControl('address')}
          value={values.address}
          onChange={handleChange('address')}
          onBlur={handleBlur('address')}
          error={errors.address}
        />

        <div className="af-auth-row">
          <fieldset
            className={`af-auth-field af-auth-fieldset${errors.gender ? ' has-error' : ''}`}
            aria-describedby={errors.gender ? 'register-gender-error' : undefined}
          >
            <legend className="af-auth-label af-auth-legend">الجنس</legend>
            <div className="af-auth-radios">
              {GENDERS.map((gender, index) => (
                <div key={gender.value} className="af-auth-radio">
                  <input
                    ref={index === 0 ? setControl('gender') : undefined}
                    type="radio"
                    id={`register-gender-${gender.value}`}
                    name="gender"
                    value={gender.value}
                    required
                    checked={values.gender === gender.value}
                    onChange={handleChange('gender')}
                  />
                  <label htmlFor={`register-gender-${gender.value}`}>{gender.label}</label>
                </div>
              ))}
            </div>
            {errors.gender && (
              <p id="register-gender-error" className="af-auth-error">
                <i className="bi bi-exclamation-circle" aria-hidden="true" />
                <span>{errors.gender}</span>
              </p>
            )}
          </fieldset>

          <AuthField
            id="register-blood-type"
            label="زمرة الدم"
            as="select"
            name="bloodType"
            inputRef={setControl('bloodType')}
            value={values.bloodType}
            onChange={handleChange('bloodType')}
            onBlur={handleBlur('bloodType')}
            error={errors.bloodType}
          >
            <option value="">اختر زمرة الدم (اختياري)</option>
            {BLOOD_TYPES.map((type) => (
              <option key={type} value={type} dir="ltr">
                {type}
              </option>
            ))}
            <option value={BLOOD_TYPE_UNKNOWN}>لا أعلم</option>
          </AuthField>
        </div>

        <button type="submit" className="btn btn-primary af-auth-submit" disabled={submitting}>
          {submitting ? 'جارٍ إنشاء الحساب…' : 'إنشاء حساب'}
        </button>
      </form>

      <div role="alert">
        {formError && (
          <p className="af-auth-error mt-3 mb-0">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}
      </div>
    </>
  );
}
