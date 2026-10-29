// تحقق معاملات استعلام عروض المدير (قراءة فقط): الترقيم (limit/offset) ومرشّحا الحجوزات date وdoctorId فقط.
// معاملات غير معروفة تُتجاهل؛ والقيم المكرّرة (مصفوفة) أو غير الصحيحة تُرفض.
import { parsePositiveInt } from '../utils/params.js';
import { isRealDate } from '../utils/schedule.js';

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

const outcome = (errors, values) => ({ valid: Object.keys(errors).length === 0, errors, values });

// limit: 1..500 (الافتراضي 100)، offset: عدد صحيح ≥ 0 (الافتراضي 0)؛ أرقام عشرية صرفة بلا أصفار بادئة
export function parsePaging(query) {
  const errors = {};
  const values = { limit: DEFAULT_LIMIT, offset: 0 };

  if (query.limit !== undefined) {
    const limit = typeof query.limit === 'string' && /^[1-9]\d{0,2}$/.test(query.limit) ? Number(query.limit) : null;
    if (limit === null || limit > MAX_LIMIT) errors.limit = `الحد الأقصى للنتائج عدد صحيح من 1 إلى ${MAX_LIMIT}.`;
    else values.limit = limit;
  }
  if (query.offset !== undefined) {
    const offset = typeof query.offset === 'string' && /^(0|[1-9]\d{0,8})$/.test(query.offset) ? Number(query.offset) : null;
    if (offset === null) errors.offset = 'الإزاحة عدد صحيح لا يقل عن 0.';
    else values.offset = offset;
  }
  return outcome(errors, values);
}

// الحجوزات: date (YYYY-MM-DD حقيقي) وdoctorId (عدد صحيح موجب) اختياريان؛ لا مرشّحات أخرى
export function parseAppointmentQuery(query) {
  const paging = parsePaging(query);
  const errors = { ...paging.errors };
  const values = { ...paging.values, date: null, doctorId: null };

  if (query.date !== undefined) {
    if (isRealDate(query.date)) values.date = query.date;
    else errors.date = 'التاريخ غير صالح.';
  }
  if (query.doctorId !== undefined) {
    const doctorId = parsePositiveInt(query.doctorId);
    if (doctorId === null) errors.doctorId = 'معرّف الطبيب غير صالح.';
    else values.doctorId = doctorId;
  }
  return outcome(errors, values);
}
