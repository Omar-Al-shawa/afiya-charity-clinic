import { useRef, useState } from 'react';
import { changePassword } from '../../api/patient';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../../api/http';
import {
  minLengthHint,
  validateChangedPassword,
  validateConfirmPassword,
  validateCurrentPassword,
  validatePasswordChange,
} from '../../utils/passwordChangeValidation';
import { PASSWORD_MIN } from '../../utils/registrationValidation';
import PasswordField from './PasswordField';

// نموذج تغيير كلمة المرور المشترك بين المريض والطبيب عبر POST /api/auth/change-password (تبقى الجلسة الحالية صالحة).
// الخادم هو المرجع؛ أخطاء الحقول منه تُربط بالحقول. التفاعل كما في A8: noValidate، تحقق عند الإرسال وعند الخروج من حقل لُمس.
// الأنماط af-patient-card من patient.css المحمَّل عاماً.

const PASSWORD_FIELDS = ['currentPassword', 'newPassword', 'confirmPassword'];
const NO_PASSWORD_ERRORS = Object.fromEntries(PASSWORD_FIELDS.map((field) => [field, '']));
const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };
const HIDDEN_PASSWORDS = { currentPassword: false, newPassword: false, confirmPassword: false };

// أخطاء الحقول من الخادم (فقط ما كان ضمن الحقول المعروفة)
function serverFieldErrors(error, fields) {
  if (!(error instanceof ApiError) || !error.fields) return null;
  const mapped = Object.fromEntries(
    fields.map((field) => [field, typeof error.fields[field] === 'string' ? error.fields[field] : '']),
  );
  return fields.some((field) => mapped[field]) ? mapped : null;
}

// minLength: الحد الأدنى لكلمة المرور الجديدة؛ الافتراضي 8 (المريض والطبيب)، والمدير يمرّر 12. الخادم هو المرجع.
export default function PasswordChangeForm({ minLength = PASSWORD_MIN }) {
  const [values, setValues] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState(NO_PASSWORD_ERRORS);
  const [visible, setVisible] = useState(HIDDEN_PASSWORDS);
  const [submitting, setSubmitting] = useState(false);
  const [changed, setChanged] = useState(false);
  const [formError, setFormError] = useState('');
  const sending = useRef(false);
  const controls = useRef({});
  const setControl = (field) => (element) => {
    controls.current[field] = element;
  };
  const dirty = useRef({});
  const attempted = useRef(false);

  const validate = (field, value, all = values) => {
    if (field === 'currentPassword') return validateCurrentPassword(value);
    if (field === 'newPassword') return validateChangedPassword(value, minLength);
    return validateConfirmPassword(value, all.newPassword, minLength);
  };

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    dirty.current[field] = true;
    setChanged(false);
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      if (current[field] && !validate(field, value)) next[field] = '';
      // تغيير الجديدة قد يصحّح خطأ التأكيد (أو يجعله مطابقاً)
      if (field === 'newPassword' && current.confirmPassword && !validateConfirmPassword(values.confirmPassword, value, minLength)) {
        next.confirmPassword = '';
      }
      return next;
    });
  };

  const handleBlur = (field) => () => {
    if (!dirty.current[field] && !attempted.current) return;
    setErrors((current) => ({ ...current, [field]: validate(field, values[field]) }));
  };

  const toggle = (field) => () => setVisible((current) => ({ ...current, [field]: !current[field] }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending.current) return;
    attempted.current = true;
    setFormError('');
    setChanged(false);

    const next = validatePasswordChange(values, minLength);
    setErrors(next);
    const firstInvalid = PASSWORD_FIELDS.find((field) => next[field]);
    if (firstInvalid) {
      controls.current[firstInvalid]?.focus();
      return;
    }

    sending.current = true;
    setSubmitting(true);
    try {
      await changePassword(values);
      // الحقول تُفرَّغ وتعود مخفية؛ الجلسة الحالية تبقى صالحة
      setValues(EMPTY_PASSWORDS);
      setVisible(HIDDEN_PASSWORDS);
      setErrors(NO_PASSWORD_ERRORS);
      dirty.current = {};
      attempted.current = false;
      setChanged(true);
    } catch (error) {
      const fromServer = serverFieldErrors(error, PASSWORD_FIELDS);
      if (fromServer) {
        setErrors(fromServer);
        controls.current[PASSWORD_FIELDS.find((field) => fromServer[field])]?.focus();
      } else {
        setFormError(error instanceof ApiError ? error.message : NETWORK_ERROR_MESSAGE);
      }
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="af-card af-patient-card" aria-labelledby="profile-password-title">
      <h2 id="profile-password-title" className="af-patient-card-title">
        تغيير كلمة المرور
      </h2>
      <p className="af-patient-card-lead">ستبقى مسجَّلاً في هذا الجهاز بعد تغيير كلمة المرور.</p>

      <form onSubmit={handleSubmit} method="post" noValidate>
        <PasswordField
          id="profile-current-password"
          label="كلمة المرور الحالية"
          autoComplete="current-password"
          inputRef={setControl('currentPassword')}
          value={values.currentPassword}
          onChange={handleChange('currentPassword')}
          onBlur={handleBlur('currentPassword')}
          error={errors.currentPassword}
          visible={visible.currentPassword}
          onToggle={toggle('currentPassword')}
        />
        <PasswordField
          id="profile-new-password"
          label="كلمة المرور الجديدة"
          autoComplete="new-password"
          hint={minLengthHint(minLength)}
          inputRef={setControl('newPassword')}
          value={values.newPassword}
          onChange={handleChange('newPassword')}
          onBlur={handleBlur('newPassword')}
          error={errors.newPassword}
          visible={visible.newPassword}
          onToggle={toggle('newPassword')}
        />
        <PasswordField
          id="profile-confirm-password"
          label="تأكيد كلمة المرور الجديدة"
          autoComplete="new-password"
          inputRef={setControl('confirmPassword')}
          value={values.confirmPassword}
          onChange={handleChange('confirmPassword')}
          onBlur={handleBlur('confirmPassword')}
          error={errors.confirmPassword}
          visible={visible.confirmPassword}
          onToggle={toggle('confirmPassword')}
        />

        <button type="submit" className="btn btn-primary af-auth-submit" disabled={submitting}>
          {submitting ? 'جارٍ التغيير…' : 'تغيير كلمة المرور'}
        </button>
      </form>

      <div role="status">
        {changed && (
          <p className="af-note af-auth-notice">
            <i className="bi bi-check-circle" aria-hidden="true" />
            <span>تم تغيير كلمة المرور.</span>
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
  );
}
