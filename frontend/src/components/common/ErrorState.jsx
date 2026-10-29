// حالة خطأ مشتركة: رسالة + زر "إعادة المحاولة" عند تمرير onRetry.
// تعيد استخدام النمط الموجود af-inline-note، فتتطابق مع شكل أخطاء الأقسام في الرئيسية.
export default function ErrorState({ message, onRetry, children }) {
  return (
    <div className="af-inline-note" role="alert">
      <i className="bi bi-exclamation-circle" aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-outline-primary" onClick={onRetry}>
          إعادة المحاولة
        </button>
      )}
      {children}
    </div>
  );
}
