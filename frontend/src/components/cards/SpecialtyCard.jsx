import { Link } from 'react-router-dom';
import Skeleton from '../common/Skeleton';
import { formatDoctorsCount, formatMinutes } from '../../utils/format';

export default function SpecialtyCard({ specialty }) {
  const { id, name, appointmentDuration, doctorsCount } = specialty;

  return (
    <article className="af-card af-specialty-card h-100">
      <span className="af-specialty-icon" aria-hidden="true">
        <i className="bi bi-clipboard2-pulse" />
      </span>
      <h3 className="h5 mb-2">
        {/* الرابط يغطي البطاقة كاملة (stretched-link) */}
        <Link to={`/doctors?specialty=${id}`} className="af-card-link stretched-link">
          {name}
        </Link>
      </h3>
      <ul className="af-meta list-unstyled mb-3">
        <li>
          <i className="bi bi-clock" aria-hidden="true" />
          مدة الموعد: {formatMinutes(appointmentDuration)}
        </li>
        <li>
          <i className="bi bi-people" aria-hidden="true" />
          {formatDoctorsCount(doctorsCount)}
        </li>
      </ul>
      <span className="af-card-cta" aria-hidden="true">
        عرض الأطباء <i className="bi bi-arrow-left" />
      </span>
    </article>
  );
}

export function SpecialtyCardSkeleton() {
  return (
    <div className="af-card af-specialty-card h-100" aria-hidden="true">
      <Skeleton className="af-skeleton--circle mb-3" style={{ width: 48, height: 48 }} />
      <Skeleton className="d-block mb-3" style={{ width: '70%', height: 22 }} />
      <Skeleton className="d-block mb-2" style={{ width: '55%', height: 14 }} />
      <Skeleton className="d-block" style={{ width: '40%', height: 14 }} />
    </div>
  );
}
