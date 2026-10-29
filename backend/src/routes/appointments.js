import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import { createAuthenticate, requireRole } from '../middleware/authenticate.js';
import {
  cancelAppointment,
  findPatientAppointment,
  findPatientIdByUserId,
  insertAppointment,
  listPatientAppointments,
} from '../repositories/appointmentRepository.js';
import { parsePositiveInt } from '../utils/params.js';
import { toMinutes, toTime } from '../utils/schedule.js';
import { validateBooking } from '../validation/appointments.js';

const notFound = () => new AppError(404, 'APPOINTMENT_NOT_FOUND', 'الحجز غير موجود.');
const noPatientProfile = () => new AppError(403, 'PATIENT_PROFILE_REQUIRED', 'هذا الحساب لا يملك ملف مريض.');

const CANCEL_FAILURES = {
  not_found: notFound,
  already_cancelled: () => new AppError(409, 'ALREADY_CANCELLED', 'هذا الحجز ملغى مسبقاً.'),
  started: () => new AppError(409, 'APPOINTMENT_STARTED', 'لا يمكن إلغاء موعد بدأ وقته أو مضى.'),
};

// الوقت للعرض بصيغة HH:mm؛ نهاية الموعد تُشتق من مدة الاختصاص وتُعرض للمواعيد القادمة فقط
function toPublicAppointment(row) {
  const startTime = row.appointment_time.slice(0, 5);
  return {
    id: row.appointment_id,
    status: row.status,
    phase: row.phase,
    canCancel: row.phase === 'upcoming',
    date: row.appointment_date,
    startTime,
    endTime: row.phase === 'upcoming' ? toTime(toMinutes(startTime) + row.appointment_duration) : null,
    doctorId: row.doctor_id,
    doctorName: `د. ${row.first_name} ${row.last_name}`,
    specialtyId: row.specialty_id,
    specialtyName: row.specialty_name,
  };
}

// كل المسارات للمريض المسجّل فقط؛ هوية المريض من جلسة الخادم (req.user.id) لا من الطلب
export function createAppointmentsRouter({ db, config }) {
  const router = Router();
  router.use(createAuthenticate({ db, auth: config.auth }), requireRole('patient'));

  router.post('/', async (req, res) => {
    const { valid, errors, values } = validateBooking(req.body);
    if (!valid) throw new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields: errors });

    const row = await db.withTransaction(async (client) => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      const patientId = await findPatientIdByUserId(client, req.user.id);
      if (patientId === null) throw noPatientProfile();
      const appointmentId = await insertAppointment(client, { patientId, ...values });
      return findPatientAppointment(client, patientId, appointmentId);
    });
    res.status(201).json({ appointment: toPublicAppointment(row) });
  });

  router.get('/', async (req, res) => {
    const patientId = await findPatientIdByUserId(db, req.user.id);
    if (patientId === null) throw noPatientProfile();
    const rows = await listPatientAppointments(db, patientId);
    res.set('Cache-Control', 'no-store');
    res.json({ appointments: rows.map(toPublicAppointment) });
  });

  router.post('/:id/cancel', async (req, res) => {
    const appointmentId = parsePositiveInt(req.params.id);
    if (appointmentId === null) throw notFound();

    const row = await db.withTransaction(async (client) => {
      const patientId = await findPatientIdByUserId(client, req.user.id);
      if (patientId === null) throw noPatientProfile();
      const outcome = await cancelAppointment(client, patientId, appointmentId);
      if (outcome !== 'cancelled') throw CANCEL_FAILURES[outcome]();
      return findPatientAppointment(client, patientId, appointmentId);
    });
    res.json({ appointment: toPublicAppointment(row) });
  });

  return router;
}
