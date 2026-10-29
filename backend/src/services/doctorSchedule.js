import { addDays, generateDaySlots, getDamascusNow, isClosedDay, toMinutes, toTime } from '../utils/schedule.js';

// جدول الطبيب لأيام من from إلى to: ساعات الدوام الموحّدة ومدة اختصاصه فقط (لا دوام خاص بطبيب).
// bookings: حجوزات الطبيب القائمة ({ id, date, time:'HH:mm', patient:{ firstName, lastName, phone } })
// كل موعد: booked (محجوز) وpast (بدأ وقته أو مضى) وappointment (الحجز وبيانات المريض الثلاثة، أو null).
export function buildDoctorDays({ slotDuration, from, to, bookings, now }) {
  if (!Number.isInteger(slotDuration) || slotDuration <= 0) {
    throw new Error('Invalid appointment duration');
  }
  const byDate = new Map();
  for (const booking of bookings) {
    if (!byDate.has(booking.date)) byDate.set(booking.date, []);
    byDate.get(booking.date).push({ ...booking, start: toMinutes(booking.time) });
  }

  const { date: today, minutes: nowMinutes } = getDamascusNow(now);
  const grid = generateDaySlots(slotDuration);
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isClosedDay(date)) {
      days.push({ date, closed: true, slots: [] });
      continue;
    }
    const dayBookings = byDate.get(date) ?? [];
    const slots = grid.map((slot) => {
      // تداخل الفترات [بداية، بداية + مدة) كما في قاعدة AF107
      const match = dayBookings.find((b) => slot.start < b.start + slotDuration && b.start < slot.end);
      return {
        startTime: toTime(slot.start),
        endTime: toTime(slot.end),
        booked: Boolean(match),
        past: date < today || (date === today && slot.start <= nowMinutes),
        appointment: match ? { id: match.id, patient: match.patient } : null,
      };
    });
    days.push({ date, closed: false, slots });
  }
  return days;
}
