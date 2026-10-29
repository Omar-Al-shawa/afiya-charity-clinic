import { Link } from 'react-router-dom';
import useDocumentTitle from '../hooks/useDocumentTitle';

// صفحة مؤقتة للمسارات التي لم تُنفَّذ شاشاتها بعد (تُحذف تدريجياً كلما اكتملت شاشة).
export default function PlaceholderPage({ title }) {
  useDocumentTitle(title);

  return (
    <section className="container py-5 text-center">
      <i className="bi bi-hourglass-split display-4 af-muted" aria-hidden="true" />
      <h1 className="mt-3">{title}</h1>
      <p className="af-muted">هذه الصفحة قيد التنفيذ وستُضاف في خطوة لاحقة.</p>
      <Link to="/" className="btn btn-primary">
        العودة إلى الرئيسية
      </Link>
    </section>
  );
}
