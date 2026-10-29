import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import { buildAvailability } from '../services/availability.js';
import {
  findAvailabilityContext,
  findDoctor,
  listBookedSlots,
  listDoctors,
} from '../repositories/catalogRepository.js';
import { parsePositiveInt } from '../utils/params.js';
import { calculateAge, getBookingDates } from '../utils/schedule.js';

const doctorNotFound = () => new AppError(404, 'DOCTOR_NOT_FOUND', 'الطبيب غير موجود.');

// نفس شكل toPublicDoctor في الواجهة: العمر محسوب، ولا تاريخ ميلاد ولا هاتف ولا بريد (السيرة تُضاف في استجابة الطبيب الواحد فقط)
function toPublicDoctor(row, now) {
  return {
    id: row.doctor_id,
    fullName: `د. ${row.first_name} ${row.last_name}`,
    age: calculateAge(row.birth_date, now),
    yearsOfExperience: row.years_of_experience,
    imageUrl: row.image_url,
    specialtyId: row.specialty_id,
    specialtyName: row.specialty_name,
    appointmentDuration: row.appointment_duration,
  };
}

// clock: دالة تعيد الوقت الحالي (قابلة للحقن في الاختبار). مسارات عامة للقراءة فقط: لا تعدّل شيئاً ولا تنفّذ تغييرات معلّقة.
export function createDoctorsRouter(db, clock) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { specialtyId } = req.query;
    let filter = null;
    if (specialtyId !== undefined) {
      filter = parsePositiveInt(specialtyId);
      if (filter === null) {
        throw new AppError(400, 'VALIDATION_ERROR', 'معرّف التخصص غير صالح.', {
          fields: { specialtyId: 'معرّف التخصص غير صالح.' },
        });
      }
    }
    const rows = await listDoctors(db, filter);
    const now = clock();
    res.json(rows.map((row) => toPublicDoctor(row, now)));
  });

  router.get('/:id', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    const row = id === null ? null : await findDoctor(db, id);
    if (!row) throw doctorNotFound();
    // biography: نبذة اختيارية يدخلها المدير؛ null إن لم توجد (نص عادي، تعرضه الواجهة دون HTML)
    res.json({ ...toPublicDoctor(row, clock()), biography: row.biography ?? null });
  });

  router.get('/:id/availability', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    const context = id === null ? null : await findAvailabilityContext(db, id);
    if (!context) throw doctorNotFound();

    const now = clock();
    const dates = getBookingDates(now);
    const booked = await listBookedSlots(db, id, dates[0], dates[dates.length - 1]);
    res.set('Cache-Control', 'no-store');
    res.json(
      buildAvailability({
        doctorId: id,
        slotDuration: context.appointment_duration,
        blockFrom: context.block_from,
        booked,
        now,
      }),
    );
  });

  return router;
}
