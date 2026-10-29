import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import { createAuthenticate, requireRole } from '../middleware/authenticate.js';
import { findPatient, listAppointments, listPatients } from '../repositories/adminViewsRepository.js';
import { parsePositiveInt } from '../utils/params.js';
import { toMinutes, toTime } from '../utils/schedule.js';
import { parseAppointmentQuery, parsePaging } from '../validation/adminViews.js';

const validationError = (fields) => new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields });
const patientNotFound = () => new AppError(404, 'PATIENT_NOT_FOUND', 'المريض غير موجود.');

const toPatientSummary = (row) => ({
  id: row.patient_id,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
  phone: row.phone,
});

// bloodType: null تعني غير معروفة (تُعرض في الواجهة «لا أعلم»)
const toPatientDetails = (row) => ({
  ...toPatientSummary(row),
  birthdate: row.birth_date,
  address: row.address,
  gender: row.gender,
  bloodType: row.blood_type,
});

// نهاية الموعد تُشتق من مدة الاختصاص وتُعرض للمواعيد القادمة فقط (كما في سجل المريض)؛ لا بيانات اتصال لأي طرف
function toAppointment(row) {
  const startTime = row.appointment_time.slice(0, 5);
  return {
    id: row.appointment_id,
    status: row.status,
    phase: row.phase,
    date: row.appointment_date,
    startTime,
    endTime: row.phase === 'upcoming' ? toTime(toMinutes(startTime) + row.appointment_duration) : null,
    doctorId: row.doctor_id,
    doctorName: `د. ${row.doctor_first_name} ${row.doctor_last_name}`,
    specialtyId: row.specialty_id,
    specialtyName: row.specialty_name,
    patientId: row.patient_id,
    patientName: `${row.patient_first_name} ${row.patient_last_name}`,
  };
}

// عروض المدير للقراءة فقط (GET): المرضى وحجوزات المجمع. لا مسارات كتابة ولا معاملات.
export function createAdminViewsRouter({ db, config }) {
  const router = Router();
  router.use(createAuthenticate({ db, auth: config.auth }), requireRole('admin'));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/patients', async (req, res) => {
    const { valid, errors, values } = parsePaging(req.query);
    if (!valid) throw validationError(errors);
    const { rows, hasMore } = await listPatients(db, values);
    res.json({ patients: rows.map(toPatientSummary), limit: values.limit, offset: values.offset, hasMore });
  });

  router.get('/patients/:id', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    const row = id === null ? null : await findPatient(db, id);
    if (!row) throw patientNotFound();
    res.json({ patient: toPatientDetails(row) });
  });

  router.get('/appointments', async (req, res) => {
    const { valid, errors, values } = parseAppointmentQuery(req.query);
    if (!valid) throw validationError(errors);
    const { rows, hasMore } = await listAppointments(db, values);
    res.json({ appointments: rows.map(toAppointment), limit: values.limit, offset: values.offset, hasMore });
  });

  return router;
}
