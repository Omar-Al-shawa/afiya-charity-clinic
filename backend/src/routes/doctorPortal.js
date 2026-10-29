import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import { createAuthenticate, requireRole } from '../middleware/authenticate.js';
import { findDoctorContext, listDoctorBookings } from '../repositories/doctorScheduleRepository.js';
import { buildDoctorDays } from '../services/doctorSchedule.js';
import { addDays, damascusToday, isRealDate, toMinutes, toTime, weekStartSaturday } from '../utils/schedule.js';

const MAX_RANGE_DAYS = 31;
const DEFAULT_APPOINTMENTS_DAYS = 7;

const noProfile = () => new AppError(403, 'DOCTOR_PROFILE_REQUIRED', 'هذا الحساب لا يملك ملف طبيب.');
const invalid = (fields) => new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields });

// قيمة اختيارية في الاستعلام: غير موجودة ← الافتراضي؛ وإلا نص تاريخ صحيح (المصفوفات والتواريخ غير الموجودة مرفوضة)
function dateParam(value, fallback) {
  if (value === undefined) return { value: fallback };
  return isRealDate(value) ? { value } : { error: 'التاريخ غير صالح.' };
}

// بوابة الطبيب للقراءة فقط (GET). doctor_id يُستخرج من حساب الجلسة، ولا يُقبل معرّف طبيب من الطلب.
export function createDoctorRouter({ db, config, clock }) {
  const router = Router();
  router.use(createAuthenticate({ db, auth: config.auth }), requireRole('doctor'));

  // جدول يومي (view=day) أو أسبوعي (view=week: من السبت إلى الجمعة، والجمعة عطلة)
  router.get('/schedule', async (req, res) => {
    const now = clock();
    const errors = {};
    const view = req.query.view ?? 'day';
    if (view !== 'day' && view !== 'week') errors.view = 'نوع العرض غير صالح.';
    const date = dateParam(req.query.date, damascusToday(now));
    if (date.error) errors.date = date.error;
    if (Object.keys(errors).length > 0) throw invalid(errors);

    const context = await findDoctorContext(db, req.user.id);
    if (!context) throw noProfile();

    const from = view === 'week' ? weekStartSaturday(date.value) : date.value;
    const to = view === 'week' ? addDays(from, 6) : from;
    const bookings = await listDoctorBookings(db, context.doctor_id, from, to);
    const slotDuration = context.appointment_duration;
    res.set('Cache-Control', 'no-store');
    res.json({
      timeZone: 'Asia/Damascus',
      slotDuration,
      view,
      from,
      to,
      days: buildDoctorDays({ slotDuration, from, to, bookings, now }),
    });
  });

  // قائمة الحجوزات القائمة ضمن مدى (افتراضياً اليوم + 6 أيام، وأقصاه 31 يوماً)
  router.get('/appointments', async (req, res) => {
    const now = clock();
    const today = damascusToday(now);
    const errors = {};
    const from = dateParam(req.query.from, today);
    if (from.error) errors.from = from.error;
    const to = dateParam(req.query.to, from.value && addDays(from.value, DEFAULT_APPOINTMENTS_DAYS - 1));
    if (to.error) errors.to = to.error;
    if (!errors.from && !errors.to) {
      if (to.value < from.value) errors.to = 'تاريخ النهاية يجب ألا يسبق تاريخ البداية.';
      else if (to.value > addDays(from.value, MAX_RANGE_DAYS - 1)) {
        errors.to = `المدى الأقصى ${MAX_RANGE_DAYS} يوماً.`;
      }
    }
    if (Object.keys(errors).length > 0) throw invalid(errors);

    const context = await findDoctorContext(db, req.user.id);
    if (!context) throw noProfile();

    const bookings = await listDoctorBookings(db, context.doctor_id, from.value, to.value);
    res.set('Cache-Control', 'no-store');
    res.json({
      from: from.value,
      to: to.value,
      appointments: bookings.map((b) => ({
        id: b.id,
        date: b.date,
        startTime: b.time,
        // نهاية الموعد تُشتق من مدة الاختصاص وتُعرض للقادمة فقط
        endTime: b.phase === 'upcoming' ? toTime(toMinutes(b.time) + context.appointment_duration) : null,
        phase: b.phase,
        patient: b.patient,
      })),
    });
  });

  return router;
}
