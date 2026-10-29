import { Link } from 'react-router-dom';
import DoctorAvatar from './DoctorAvatar';
import Skeleton from '../common/Skeleton';
import { formatMinutes, formatYears } from '../../utils/format';

export default function DoctorCard({ doctor }) {
  const { id, fullName, specialtyName, yearsOfExperience, appointmentDuration, imageUrl } = doctor;

  return (
    <article className="af-card af-doctor-card h-100">
      <div className="af-doctor-media">
        <DoctorAvatar src={imageUrl} />
      </div>
      <div className="af-doctor-body">
        <h3 className="h5 mb-2">{fullName}</h3>
        <span className="af-badge mb-3">{specialtyName}</span>
        <ul className="af-meta list-unstyled mb-3">
          {yearsOfExperience != null && (
            <li>
              <i className="bi bi-award" aria-hidden="true" />
              خبرة {formatYears(yearsOfExperience)}
            </li>
          )}
          <li>
            <i className="bi bi-clock" aria-hidden="true" />
            مدة الموعد: {formatMinutes(appointmentDuration)}
          </li>
        </ul>
        <Link to={`/doctors/${id}`} className="btn btn-outline-primary mt-auto w-100">
          عرض التفاصيل
        </Link>
      </div>
    </article>
  );
}

export function DoctorCardSkeleton() {
  return (
    <div className="af-card af-doctor-card h-100" aria-hidden="true">
      <div className="af-doctor-media">
        <Skeleton className="d-block w-100 h-100" style={{ borderRadius: 0 }} />
      </div>
      <div className="af-doctor-body">
        <Skeleton className="d-block mb-3" style={{ width: '65%', height: 22 }} />
        <Skeleton className="d-block mb-3" style={{ width: '45%', height: 24, borderRadius: 999 }} />
        <Skeleton className="d-block mb-2" style={{ width: '55%', height: 14 }} />
        <Skeleton className="d-block mb-3" style={{ width: '60%', height: 14 }} />
        <Skeleton className="d-block mt-auto" style={{ width: '100%', height: 44 }} />
      </div>
    </div>
  );
}
