// كل الأرقام تُعرض بالأرقام اللاتينية (0-9) كما هو معتمد.

// صيغة العدد في العربية: 1 مفرد، 2 مثنى، 3-10 جمع، 11 فما فوق مفرد منصوب
function formatCount(n, { one, two, few, many }) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function formatMinutes(n) {
  return formatCount(n, { one: 'دقيقة واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة' });
}

export function formatYears(n) {
  return formatCount(n, { one: 'سنة واحدة', two: 'سنتان', few: 'سنوات', many: 'سنة' });
}

export function formatDoctorsCount(n) {
  if (n === 0) return 'لا يوجد أطباء';
  return formatCount(n, { one: 'طبيب واحد', two: 'طبيبان', few: 'أطباء', many: 'طبيباً' });
}

export function formatSpecialtiesCount(n) {
  if (n === 0) return 'لا توجد تخصصات';
  return formatCount(n, { one: 'تخصص واحد', two: 'تخصصان', few: 'تخصصات', many: 'تخصصاً' });
}

// '09:00' -> '9:00 ص' ، '17:00' -> '5:00 م' ، '12:00' -> '12:00 م'
export function formatTime12(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const period = hours < 12 ? 'ص' : 'م';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

// العمر يُحسب من تاريخ الميلاد ولا يُخزَّن
export function calculateAge(birthDate, today = new Date()) {
  const [year, month, day] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}
