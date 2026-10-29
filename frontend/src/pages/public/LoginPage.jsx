import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PasswordField from '../../components/auth/PasswordField';
import { useAuth } from '../../context/AuthContext';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../../api/http';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { validateEmail, validatePassword } from '../../utils/validation';

// A7: شاشة دخول موحَّدة. بعد التحقق في الواجهة يُرسل الطلب إلى POST /api/auth/login عبر AuthContext.
// عند النجاح ينقل GuestOnly المستخدم إلى next الآمن أو صفحة دوره؛ ولا يُخزَّن أي رمز في الواجهة (الكوكي httpOnly).

export default function LoginPage() {
  useDocumentTitle('تسجيل الدخول');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });
  const { login } = useAuth();
  // يظهر بعد التسجيل الناجح (حالة التنقل من صفحة التسجيل) ويختفي عند أول محاولة دخول
  const [registeredNotice, setRegisteredNotice] = useState(Boolean(useLocation().state?.registered));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const sending = useRef(false); // يمنع الإرسال المزدوج قبل أن يُعاد الرسم

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  // الحقول التي بدأ المستخدم الكتابة فيها، ومحاولة الإرسال: لا تظهر أخطاء عند مجرد التنقل بـ Tab فوق حقل فارغ
  const dirty = useRef({ email: false, password: false });
  const attempted = useRef(false);

  const validators = { email: validateEmail, password: validatePassword };

  const handleChange = (field, setValue) => (event) => {
    const { value } = event.target;
    dirty.current[field] = true;
    setValue(value);
    // يُمسح الخطأ فور أن تصبح القيمة صحيحة؛ لا يظهر خطأ جديد أثناء الكتابة
    if (errors[field] && !validators[field](value)) {
      setErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  const handleBlur = (field, value) => () => {
    if (field === 'email') {
      const trimmed = value.trim();
      if (trimmed !== value) setEmail(trimmed);
    }
    if (!dirty.current[field] && !attempted.current) return;
    setErrors((current) => ({ ...current, [field]: validators[field](value) }));
  };

  // أخطاء الخادم: أخطاء الحقول تُربط بالحقول، وغيرها (بيانات خاطئة، حساب غير مفعّل، محاولات كثيرة، شبكة) رسالة عامة تحت النموذج
  const showFailure = (error) => {
    if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.fields) {
      const fromServer = {
        email: typeof error.fields.email === 'string' ? error.fields.email : '',
        password: typeof error.fields.password === 'string' ? error.fields.password : '',
      };
      if (fromServer.email || fromServer.password) {
        setErrors(fromServer);
        (fromServer.email ? emailRef : passwordRef).current?.focus();
        return;
      }
    }
    setFormError(error instanceof ApiError ? error.message : NETWORK_ERROR_MESSAGE);
    if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') passwordRef.current?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending.current) return;
    attempted.current = true;
    setRegisteredNotice(false);
    setFormError('');

    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);

    // التركيز على أول حقل غير صالح
    if (next.email) {
      emailRef.current?.focus();
      return;
    }
    if (next.password) {
      passwordRef.current?.focus();
      return;
    }

    const trimmedEmail = email.trim();
    setEmail(trimmedEmail);
    sending.current = true;
    setSubmitting(true);
    try {
      await login({ email: trimmedEmail, password });
    } catch (error) {
      showFailure(error);
      return;
    } finally {
      sending.current = false;
      setSubmitting(false);
    }

    // نجاح: تُمسح كلمة المرور من الحالة (ينتقل المستخدم عبر GuestOnly)
    setPassword('');
    setShowPassword(false);
    dirty.current = { email: false, password: false };
    attempted.current = false;
  };

  return (
    <>
      <h1 className="af-auth-title">مرحباً بعودتك إلى مجمع عافية</h1>
      <p className="af-auth-lead">سجّل دخولك بالبريد الإلكتروني وكلمة المرور للمتابعة.</p>

      {/* noValidate: رسائل التحقق عربية ومخصصة بدل نافذة المتصفح */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="af-auth-field">
          <label htmlFor="login-email" className="af-auth-label">
            البريد الإلكتروني
          </label>
          <input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            dir="ltr"
            className={`af-auth-input${errors.email ? ' is-invalid' : ''}`}
            placeholder="name@example.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={handleChange('email', setEmail)}
            onBlur={handleBlur('email', email)}
            aria-invalid={errors.email ? 'true' : undefined}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
          {errors.email && (
            <p id="login-email-error" className="af-auth-error">
              <i className="bi bi-exclamation-circle" aria-hidden="true" />
              <span>{errors.email}</span>
            </p>
          )}
        </div>

        <PasswordField
          id="login-password"
          label="كلمة المرور"
          inputRef={passwordRef}
          value={password}
          onChange={handleChange('password', setPassword)}
          onBlur={handleBlur('password', password)}
          error={errors.password}
          visible={showPassword}
          onToggle={() => setShowPassword((current) => !current)}
        />

        <button type="submit" className="btn btn-primary af-auth-submit" disabled={submitting}>
          {submitting ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
        </button>
      </form>

      <div role="status">
        {registeredNotice && (
          <p className="af-note af-auth-notice">
            <i className="bi bi-check-circle" aria-hidden="true" />
            <span>تم إنشاء حسابك بنجاح. سجّل الدخول للمتابعة.</span>
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
    </>
  );
}
