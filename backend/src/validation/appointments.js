// تحقق شكل طلب الحجز فقط (النوع والصيغة)؛ قواعد العمل (التوفر، الجمعة، النافذة، التعارض) يفرضها PostgreSQL ويُبلَّغ عنها برسائله.
import { parsePositiveInt } from '../utils/params.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(value) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

// يقبل doctorId رقماً صحيحاً أو نصاً رقمياً؛ date بصيغة YYYY-MM-DD؛ time بصيغة HH:mm. أي حقل آخر (مثل patientId) يُتجاهل
export function validateBooking(body) {
  const input = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const values = {};

  const doctorId =
    typeof input.doctorId === 'number' && Number.isInteger(input.doctorId)
      ? parsePositiveInt(String(input.doctorId))
      : parsePositiveInt(input.doctorId);
  if (doctorId === null) errors.doctorId = 'اختر الطبيب.';
  else values.doctorId = doctorId;

  if (input.date === undefined || input.date === null || input.date === '') errors.date = 'اختر تاريخ الموعد.';
  else if (typeof input.date !== 'string' || !isRealDate(input.date)) errors.date = 'تاريخ الموعد غير صالح.';
  else values.date = input.date;

  if (input.time === undefined || input.time === null || input.time === '') errors.time = 'اختر وقت الموعد.';
  else if (typeof input.time !== 'string' || !TIME_PATTERN.test(input.time)) errors.time = 'وقت الموعد غير صالح.';
  else values.time = input.time;

  return { valid: Object.keys(errors).length === 0, errors, values };
}
