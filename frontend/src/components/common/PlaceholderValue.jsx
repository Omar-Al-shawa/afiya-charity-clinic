// قيمة مؤقتة واضحة (عنوان / هاتف / بريد) إلى أن تصل بيانات المجمع الحقيقية.
// لا تُشبه بيانات حقيقية، ولا تُنشئ روابط tel: أو mailto:
export default function PlaceholderValue({ children }) {
  return (
    <span className="af-placeholder">
      <i className="bi bi-hourglass-split" aria-hidden="true" />
      {children}
    </span>
  );
}
