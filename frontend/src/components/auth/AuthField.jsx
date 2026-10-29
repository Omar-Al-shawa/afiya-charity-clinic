// حقل نموذج التسجيل: تسمية + عنصر تحكم (input أو textarea أو select) + تلميح اختياري + رسالة خطأ.
// يربط aria-invalid وaria-describedby بالتلميح والخطأ. بقية الخصائص تُمرَّر كما هي إلى عنصر التحكم.
export default function AuthField({ id, label, as = 'input', error, hint, inputRef, className = '', children, ...controlProps }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  const Control = as;
  const classes = ['af-auth-input', as === 'select' && 'af-auth-select', error && 'is-invalid', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="af-auth-field">
      <label htmlFor={id} className="af-auth-label">
        {label}
      </label>
      <Control
        ref={inputRef}
        id={id}
        className={classes}
        required
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...controlProps}
      >
        {children}
      </Control>
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
