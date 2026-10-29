import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAvailability } from '../src/services/availability.js';
import { calculateAge, damascusToday, generateDaySlots, toTime } from '../src/utils/schedule.js';

// الأربعاء 2026-10-28 الساعة 10:30 بتوقيت دمشق (+03:00)؛ الجمعتان في النافذة: 10-30 و11-06
const NOW = new Date('2026-10-28T10:30:00+03:00');
const build = (overrides = {}) => buildAvailability({ doctorId: 7, slotDuration: 30, now: NOW, ...overrides });
const dayOf = (result, date) => result.days.find((d) => d.date === date);

test('window is 14 Damascus dates starting today, Friday closed, contract shape', () => {
  const result = build();
  assert.deepEqual(Object.keys(result), ['doctorId', 'timeZone', 'slotDuration', 'bookingRestrictedFrom', 'days']);
  assert.equal(result.timeZone, 'Asia/Damascus');
  assert.equal(result.bookingRestrictedFrom, null);
  assert.equal(result.days.length, 14);
  assert.equal(result.days[0].date, '2026-10-28');
  assert.equal(result.days[13].date, '2026-11-10');
  for (const date of ['2026-10-30', '2026-11-06']) assert.deepEqual(dayOf(result, date), { date, closed: true, slots: [] });
  assert.equal(result.days.filter((d) => d.closed).length, 2);
  assert.deepEqual(dayOf(result, '2026-10-29').slots[0], { startTime: '09:00', endTime: '09:30', booked: false });
});

test('today follows the Damascus calendar, not UTC', () => {
  assert.equal(damascusToday(new Date('2026-10-27T21:30:00Z')), '2026-10-28'); // 00:30 دمشق
  assert.equal(damascusToday(new Date('2026-10-28T20:59:59Z')), '2026-10-28'); // 23:59:59 دمشق
  assert.equal(damascusToday(new Date('2026-10-28T21:00:00Z')), '2026-10-29');
  assert.equal(build({ now: new Date('2026-10-27T21:30:00Z') }).days[0].date, '2026-10-28');
});

test('slot grid follows the specialty duration and never passes 17:00', () => {
  const last = (minutes) => generateDaySlots(minutes).at(-1);
  assert.equal(generateDaySlots(20).length, 24);
  assert.equal(generateDaySlots(30).length, 16);
  assert.equal(generateDaySlots(45).length, 10);
  assert.equal(toTime(last(45).start) + '-' + toTime(last(45).end), '15:45-16:30'); // 16:30-17:15 يتجاوز الدوام فلا يُولَّد
  assert.equal(toTime(last(30).start) + '-' + toTime(last(30).end), '16:30-17:00');
  assert.equal(generateDaySlots(480).length, 1);
  assert.equal(generateDaySlots(481).length, 0);
  for (const minutes of [7, 20, 30, 45, 50, 90]) assert.ok(generateDaySlots(minutes).every((s) => s.end <= 17 * 60));
  assert.throws(() => build({ slotDuration: 0 }), /Invalid appointment duration/);
  assert.throws(() => build({ slotDuration: null }), /Invalid appointment duration/);
});

test("today's slots that already started are excluded; later days are complete", () => {
  const result = build(); // 10:30 الآن، مدة 30
  const today = dayOf(result, '2026-10-28').slots;
  assert.equal(today[0].startTime, '11:00'); // موعد 10:30 بدأ فلا يُعاد
  assert.equal(dayOf(result, '2026-10-29').slots.length, 16);
  const evening = buildAvailability({ doctorId: 7, slotDuration: 30, now: new Date('2026-10-28T18:00:00+03:00') });
  assert.deepEqual(dayOf(evening, '2026-10-28').slots, []);
});

test('overlapping booked appointments are unavailable; other dates are unaffected', () => {
  const exact = build({ booked: [{ date: '2026-10-29', time: '09:00:00' }] });
  const slots = dayOf(exact, '2026-10-29').slots;
  assert.deepEqual(slots.slice(0, 3).map((s) => s.booked), [true, false, false]);
  assert.ok(dayOf(exact, '2026-11-01').slots.every((s) => !s.booked));

  const partial = build({ booked: [{ date: '2026-10-29', time: '09:10' }] }); // يتقاطع مع موعدين متجاورين
  assert.deepEqual(dayOf(partial, '2026-10-29').slots.slice(0, 3).map((s) => s.booked), [true, true, false]);

  const last = build({ booked: [{ date: '2026-10-29', time: '16:30:00' }] });
  assert.equal(dayOf(last, '2026-10-29').slots.at(-1).booked, true);
});

test('dates restricted by a pending change are omitted and bookingRestrictedFrom is set', () => {
  const cut = build({ blockFrom: '2026-11-03' });
  assert.equal(cut.days.at(-1).date, '2026-11-02');
  assert.equal(cut.bookingRestrictedFrom, '2026-11-03');

  const lastDay = build({ blockFrom: '2026-11-10' });
  assert.equal(lastDay.days.length, 13);
  assert.equal(lastDay.bookingRestrictedFrom, '2026-11-10');

  const beyond = build({ blockFrom: '2026-11-11' }); // لا يمس النافذة
  assert.equal(beyond.days.length, 14);
  assert.equal(beyond.bookingRestrictedFrom, null);

  const all = build({ blockFrom: '2026-10-28' });
  assert.deepEqual(all.days, []);
  assert.equal(all.bookingRestrictedFrom, '2026-10-28');
});

test('age is calculated on the Damascus calendar', () => {
  assert.equal(calculateAge('1994-10-28', NOW), 32); // عيد ميلاده اليوم
  assert.equal(calculateAge('1994-10-29', NOW), 31);
  assert.equal(calculateAge('1994-11-15', NOW), 31);
  assert.equal(calculateAge('1994-10-29', new Date('2026-10-28T21:00:00Z')), 32); // دمشق صارت 10-29
});
