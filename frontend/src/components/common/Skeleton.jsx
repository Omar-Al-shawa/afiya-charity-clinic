// هيكل رمادي مؤقت يظهر أثناء التحميل. الحاوية التي تستخدمه تضع role="status" ونصاً للقارئ الشاشي.
export default function Skeleton({ className = '', style }) {
  return <span className={`af-skeleton ${className}`} style={style} aria-hidden="true" />;
}
