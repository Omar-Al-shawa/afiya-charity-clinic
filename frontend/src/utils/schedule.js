// حسابات الأيام والمواعيد بتوقيت دمشق، بلا مكتبات تواريخ.
// التواريخ تُحمَل كنصوص "YYYY-MM-DD" ولا تُحوَّل أبداً إلى كائن Date محلي، حتى لا يتأثر اليوم بتوقيت جهاز الزائر.
// الدوال التي تحتاج الوقت الحالي تستقبله معاملاً (now) ليمكن اختبار حالات الحد (الجمعة، منتصف الليل، آخر الدوام).
import { BOOKING_WINDOW_DAYS, CLINIC_TIME_ZONE, CLOSED_WEEKDAY, WORKING_HOURS } from './constants';

const WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTH_NAMES = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

// يفكّك "YYYY-MM-DD" بصرامة، ويعيد null لأي تاريخ غير موجود فعلاً (مثل 2026-02-30)
export function parseDate(value) {
  const match = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  const valid =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  return valid ? { year, month, day } : null;
}

export function addDays(date, count) {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

// الأحد = 0 ... السبت = 6
export function weekdayOf(date) {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isClosedDay(date) {
  return weekdayOf(date) === CLOSED_WEEKDAY;
}

// نافذة الحجز: 14 تاريخاً تبدأ باليوم الحالي في دمشق (اليوم 0 ثم 13 يوماً بعده)
export function getBookingDates(now = new Date()) {
  const { date: today } = getDamascusNow(now);
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, index) => addDays(today, index));
}

export function isValidTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function toTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// مواعيد يوم عمل كامل: متتابعة من بداية الدوام، ولا يبدأ موعد إلا إن انتهى قبل نهاية الدوام أو عندها تماماً.
// مدة غير صالحة (غير عدد صحيح موجب) لا تنتج مواعيد.
export function generateDaySlots(durationMinutes) {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return [];
  const open = toMinutes(WORKING_HOURS.open);
  const close = toMinutes(WORKING_HOURS.close);
  const slots = [];
  for (let start = open; start + durationMinutes <= close; start += durationMinutes) {
    slots.push({ startTime: toTime(start), endTime: toTime(start + durationMinutes) });
  }
  return slots;
}

// أجزاء التاريخ بالعربية وبأرقام لاتينية: { weekday, day, month, year, long }
export function getDateLabels(date) {
  const { year, month, day } = parseDate(date);
  const weekday = WEEKDAY_NAMES[weekdayOf(date)];
  const monthName = MONTH_NAMES[month - 1];
  return { weekday, day, month: monthName, year, long: `${weekday} ${day} ${monthName} ${year}` };
}
