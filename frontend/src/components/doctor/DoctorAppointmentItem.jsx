import { formatTime12 } from '../../utils/format';
import { getDateLabels } from '../../utils/schedule';

// صف موعد في بوابة الطبيب (عرض فقط): الوقت واسم المريض ورقم هاتفه. يُعرض داخل <ul>.
// القادم: من الوقت إلى النهاية. السابق: وقت البداية فقط. date يُمرَّر حين لا يكون التاريخ ظاهراً في عنوان القسم.
// رقم الهاتف نص عادي وليس رابط tel: (الروابط مخصصة لهاتف المجمع الرسمي فقط).
const STATUS = {
  upcoming: 'قادم',
  past: 'سابق',
};

export default function DoctorAppointmentItem({ date, startTime, endTime, phase, patient, showStatus = false }) {
  const time = endTime ? `${formatTime12(startTime)} – ${formatTime12(endTime)}` : formatTime12(startTime);

  return (
    <li className={`af-dportal-item af-dportal-item--${phase}`}>
      <div className="af-dportal-when">
        {date && <span className="af-dportal-date">{getDateLabels(date).long}</span>}
        <span className="af-dportal-time">
          <i className="bi bi-clock" aria-hidden="true" />
          <bdi>{time}</bdi>
        </span>
      </div>
      <div className="af-dportal-patient">
        <strong>
          {patient.firstName} {patient.lastName}
        </strong>
        <span className="af-dportal-phone">
          <i className="bi bi-telephone" aria-hidden="true" />
          <bdi dir="ltr">{patient.phone}</bdi>
        </span>
      </div>
      {showStatus && <span className={`af-badge af-dportal-badge af-dportal-badge--${phase}`}>{STATUS[phase]}</span>}
    </li>
  );
}
