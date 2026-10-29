// حقل كلمة المرور مع زر إظهار/إخفاء.
// حالة الإظهار يملكها الأب (visible / onToggle) ليعيد إخفاءها بعد الإرسال الصحيح.
// hint اختياري (تلميح تحت الحقل، مثل شرط الطول في التسجيل)؛ دونه يبقى الناتج كما في A7.
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  visible,
  onToggle,
  inputRef,
  autoComplete = 'current-password',
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="af-auth-field">
      <label htmlFor={id} className="af-auth-label">
        {label}
      </label>
      <div className="af-auth-password">
        <input
          ref={inputRef}
          id={id}
          name="password"
          type={visible ? 'text' : 'password'}
          dir="ltr"
          className={`af-auth-input${error ? ' is-invalid' : ''}`}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="af-auth-toggle"
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          aria-controls={id}
          onClick={onToggle}
        >
          <i className={`bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
        </button>
      </div>
      {hint && (
        <p id={hintId} className="af-auth-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="af-auth-error">
          <i className="bi bi-exclamation-circle" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
