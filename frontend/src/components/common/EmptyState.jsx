// حالة فراغ مشتركة: أيقونة + عنوان + نص اختياري + إجراء اختياري (children).
// تستخدم أصناف Bootstrap والأنماط الموجودة فقط، وتُعلَن لقارئ الشاشة (role="status").
export default function EmptyState({ icon = 'bi-inbox', title, text, children }) {
  return (
    <div className="text-center py-5 px-3" role="status">
      <i className={`bi ${icon} display-4 af-muted`} aria-hidden="true" />
      <p className="h5 mt-3 mb-2">{title}</p>
      {text && <p className="af-muted">{text}</p>}
      {children}
    </div>
  );
}
