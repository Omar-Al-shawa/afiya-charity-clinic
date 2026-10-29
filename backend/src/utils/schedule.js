// حسابات الأيام والمواعيد بتوقيت دمشق (منقولة من frontend/src/utils/schedule.js وثوابت utils/constants.js)، بلا مكتبات تواريخ.
// التواريخ نصوص "YYYY-MM-DD" ولا تُحوَّل إلى Date محلي؛ ودوال الوقت الحالي تستقبل now ليمكن اختبارها.
export const CLINIC_TIME_ZONE = 'Asia/Damascus';
export const WORKING_HOURS = { open: '09:00', close: '17:00' };
export const BOOKING_WINDOW_DAYS = 14;
// الأحد = 0 ... السبت = 6
export const CLOSED_WEEKDAY = 5;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const damascusClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// التاريخ ("YYYY-MM-DD") ودقائق اليوم الآن في دمشق
export function getDamascusNow(now = new Date()) {
  const parts = Object.fromEntries(damascusClock.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export const damascusToday = (now = new Date()) => getDamascusNow(now).date;

function parseDate(value) {
  const [year, month, day] = DATE_PATTERN.exec(value).slice(1).map(Number);
  return { year, month, day };
}

// تاريخ "YYYY-MM-DD" موجود فعلاً في التقويم (مثل 2026-02-30 مرفوض)
export function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const { year, month, day } = parseDate(value);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function addDays(date, count) {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

export function weekdayOf(date) {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// بداية أسبوع العمل: السبت (الجمعة آخر أيام الأسبوع)
export function weekStartSaturday(date) {
  return addDays(date, -((weekdayOf(date) + 1) % 7));
}

export const isClosedDay = (date) => weekdayOf(date) === CLOSED_WEEKDAY;

// نافذة الحجز: 14 تاريخاً تبدأ باليوم الحالي في دمشق (اليوم 0 ثم 13 يوماً بعده)
export function getBookingDates(now = new Date()) {
  const today = damascusToday(now);
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, index) => addDays(today, index));
}

// "HH:mm" أو "HH:mm:ss" ← دقائق منذ منتصف الليل
export function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function toTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// مواعيد يوم عمل كامل: متتابعة من بداية الدوام، ولا يبدأ موعد إلا إن انتهى قبل نهاية الدوام أو عندها تماماً (AF105)
export function generateDaySlots(durationMinutes) {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return [];
  const open = toMinutes(WORKING_HOURS.open);
  const close = toMinutes(WORKING_HOURS.close);
  const slots = [];
  for (let start = open; start + durationMinutes <= close; start += durationMinutes) {
    slots.push({ start, end: start + durationMinutes });
  }
  return slots;
}

// العمر بتقويم دمشق (لا بتوقيت الخادم أو المتصفح) من تاريخ ميلاد "YYYY-MM-DD"
export function calculateAge(birthDate, now = new Date()) {
  const born = parseDate(birthDate);
  const today = parseDate(damascusToday(now));
  const hadBirthday = today.month > born.month || (today.month === born.month && today.day >= born.day);
  return today.year - born.year - (hadBirthday ? 0 : 1);
}
