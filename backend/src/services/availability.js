import {
  CLINIC_TIME_ZONE,
  generateDaySlots,
  getBookingDates,
  getDamascusNow,
  isClosedDay,
  toMinutes,
  toTime,
} from '../utils/schedule.js';

// يبني توافر الطبيب بالشكل نفسه الذي تعرضه الواجهة (fetchDoctorAvailability):
//   { doctorId, timeZone, slotDuration, bookingRestrictedFrom, days: [{ date, closed, slots: [{ startTime, endTime, booked }] }] }
// booked: حجوزات الطبيب القائمة فقط ({ date: 'YYYY-MM-DD', time: 'HH:mm[:ss]' })؛ الملغاة لا تصل إلى هنا.
// blockFrom: أبكر تاريخ سريان لتغيير معلّق على الطبيب أو اختصاصه (قاعدة AF106): التواريخ منه فصاعداً تُحذف.
export function buildAvailability({ doctorId, slotDuration, blockFrom = null, booked = [], now = new Date() }) {
  if (!Number.isInteger(slotDuration) || slotDuration <= 0) {
    throw new Error('Invalid appointment duration');
  }

  const bookedStarts = new Map();
  for (const { date, time } of booked) {
    if (!bookedStarts.has(date)) bookedStarts.set(date, []);
    bookedStarts.get(date).push(toMinutes(time));
  }

  const { date: today, minutes: nowMinutes } = getDamascusNow(now);
  const grid = generateDaySlots(slotDuration);
  const days = [];
  let restricted = false;

  for (const date of getBookingDates(now)) {
    if (blockFrom && date >= blockFrom) {
      restricted = true;
      break;
    }
    if (isClosedDay(date)) {
      days.push({ date, closed: true, slots: [] });
      continue;
    }
    const starts = bookedStarts.get(date) ?? [];
    const slots = grid
      .filter((slot) => date !== today || slot.start > nowMinutes)
      .map((slot) => ({
        startTime: toTime(slot.start),
        endTime: toTime(slot.end),
        // تداخل الفترات [بداية، بداية + مدة) كما في AF107
        booked: starts.some((start) => slot.start < start + slotDuration && start < slot.end),
      }));
    days.push({ date, closed: false, slots });
  }

  return {
    doctorId,
    timeZone: CLINIC_TIME_ZONE,
    slotDuration,
    // يُعاد التاريخ فقط إن حُذف به يوم من النافذة فعلاً، وإلا null
    bookingRestrictedFrom: restricted ? blockFrom : null,
    days,
  };
}
