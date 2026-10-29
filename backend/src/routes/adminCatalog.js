import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import { hashPassword } from '../auth/passwords.js';
import { createAuthenticate, requireRole } from '../middleware/authenticate.js';
import {
  cancelPendingChange,
  createDoctorAccount,
  emailTaken,
  findAdminDoctor,
  findAdminSpecialty,
  findDoctorState,
  findPendingChange,
  insertPendingChange,
  insertSpecialty,
  listAdminDoctors,
  listAdminSpecialties,
  listPendingChanges,
  specialtyExists,
  specialtyNameTaken,
} from '../repositories/adminRepository.js';
import { parsePositiveInt } from '../utils/params.js';
import {
  PENDING_STATUS_FILTERS,
  validateDoctorChange,
  validateDoctorCreate,
  validateSpecialtyChange,
  validateSpecialtyCreate,
} from '../validation/admin.js';

const validationError = (fields) => new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields });
const specialtyNotFound = () => new AppError(404, 'SPECIALTY_NOT_FOUND', 'الاختصاص غير موجود.');
const doctorNotFound = () => new AppError(404, 'DOCTOR_NOT_FOUND', 'الطبيب غير موجود.');
const changeNotFound = () => new AppError(404, 'PENDING_CHANGE_NOT_FOUND', 'طلب التغيير غير موجود.');
const doctorInactive = () => new AppError(409, 'DOCTOR_INACTIVE', 'حساب الطبيب معطّل؛ لا يمكن تسجيل طلب تغيير له.');

// مفاتيح new_data في القاعدة (snake_case) ← أسماء الواجهة (camelCase)
const NEW_DATA_KEYS = {
  first_name: 'firstName',
  last_name: 'lastName',
  birth_date: 'birthdate',
  phone: 'phone',
  email: 'email',
  image_url: 'imageUrl',
  biography: 'biography',
  years_of_experience: 'yearsOfExperience',
  specialty_name: 'name',
  appointment_duration: 'appointmentDuration',
};

function toPendingChange(row) {
  const isDoctor = row.doctor_id !== null;
  return {
    id: row.change_id,
    target: isDoctor
      ? { type: 'doctor', id: row.doctor_id, name: `د. ${row.doctor_first_name} ${row.doctor_last_name}` }
      : { type: 'specialty', id: row.specialty_id, name: row.specialty_name },
    changeType: row.change_type,
    newData: row.new_data ? Object.fromEntries(Object.entries(row.new_data).map(([k, v]) => [NEW_DATA_KEYS[k] ?? k, v])) : null,
    status: row.status,
    createdAt: row.created_at,
    effectiveDate: row.effective_date, // تاريخ سريان الطلب بتقويم دمشق (تحسبه القاعدة)
    failureReason: row.failure_reason,
  };
}

const toAdminSpecialty = (row, pendingChange = null) => ({
  id: row.specialty_id,
  name: row.specialty_name,
  appointmentDuration: row.appointment_duration,
  doctorsCount: row.doctors_count,
  activeDoctorsCount: row.active_doctors_count,
  pendingChange,
});

const toAdminDoctor = (row, pendingChange = null) => ({
  id: row.doctor_id,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
  phone: row.phone,
  birthdate: row.birth_date,
  imageUrl: row.image_url,
  biography: row.biography,
  yearsOfExperience: row.years_of_experience,
  specialtyId: row.specialty_id,
  specialtyName: row.specialty_name,
  appointmentDuration: row.appointment_duration,
  isActive: row.is_active,
  pendingChange,
});

// الطلبات المعلّقة فقط، مفهرسة بالهدف، لعرضها مع كل اختصاص أو طبيب
async function pendingByTarget(db) {
  const map = new Map();
  for (const row of await listPendingChanges(db, ['pending'])) {
    map.set(row.doctor_id !== null ? `doctor:${row.doctor_id}` : `specialty:${row.specialty_id}`, toPendingChange(row));
  }
  return map;
}

// إدارة المجمع للمدير فقط. إضافة الأطباء والاختصاصات فورية؛ وتعديل أو حذف الموجود طلب مؤجَّل 14 يوماً (HTTP 202)
// تحدّد القاعدة وقت تنفيذه، ولا يُنفَّذ أي طلب مستحق من هذه المسارات.
export function createAdminCatalogRouter({ db, config }) {
  const router = Router();
  router.use(createAuthenticate({ db, auth: config.auth }), requireRole('admin'));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---------- الاختصاصات ----------

  router.get('/specialties', async (req, res) => {
    const [rows, pending] = await Promise.all([listAdminSpecialties(db), pendingByTarget(db)]);
    res.json({ specialties: rows.map((row) => toAdminSpecialty(row, pending.get(`specialty:${row.specialty_id}`) ?? null)) });
  });

  router.post('/specialties', async (req, res) => {
    const { valid, errors, values } = validateSpecialtyCreate(req.body);
    if (!valid) throw validationError(errors);
    const id = await insertSpecialty(db, values);
    res.status(201).json({ specialty: toAdminSpecialty(await findAdminSpecialty(db, id)) });
  });

  // طلب تعديل/حذف اختصاص: داخل معاملة READ COMMITTED لأن مشغّل طلبات التغيير يشترطها ويأخذ الأقفال
  async function requestSpecialtyChange(specialtyId, changeType, newData) {
    return db.withTransaction(async (client) => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      if (!(await specialtyExists(client, specialtyId))) throw specialtyNotFound();
      if (newData?.specialty_name && (await specialtyNameTaken(client, newData.specialty_name, specialtyId))) {
        throw new AppError(409, 'SPECIALTY_EXISTS', 'هذا الاختصاص موجود مسبقاً.', {
          fields: { name: 'هذا الاختصاص موجود مسبقاً.' },
        });
      }
      const changeId = await insertPendingChange(client, { specialtyId, changeType, newData });
      return findPendingChange(client, changeId);
    });
  }

  router.patch('/specialties/:id', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) throw specialtyNotFound();
    const { valid, errors, newData } = validateSpecialtyChange(req.body);
    if (!valid) throw validationError(errors);
    res.status(202).json({ pendingChange: toPendingChange(await requestSpecialtyChange(id, 'update', newData)) });
  });

  router.delete('/specialties/:id', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) throw specialtyNotFound();
    res.status(202).json({ pendingChange: toPendingChange(await requestSpecialtyChange(id, 'delete')) });
  });

  // ---------- الأطباء ----------

  router.get('/doctors', async (req, res) => {
    const [rows, pending] = await Promise.all([listAdminDoctors(db), pendingByTarget(db)]);
    res.json({ doctors: rows.map((row) => toAdminDoctor(row, pending.get(`doctor:${row.doctor_id}`) ?? null)) });
  });

  // الحساب والطبيب في معاملة واحدة: يفشل كلاهما أو ينجحان؛ كلمة المرور تُجزّأ قبل المعاملة ولا تُعاد
  router.post('/doctors', async (req, res) => {
    const { valid, errors, values } = validateDoctorCreate(req.body);
    if (!valid) throw validationError(errors);
    const passwordHash = await hashPassword(values.password, config.auth.bcryptCost);
    const row = await db.withTransaction(async (client) => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      const doctorId = await createDoctorAccount(client, { email: values.email, passwordHash, doctor: values });
      return findAdminDoctor(client, doctorId);
    });
    res.status(201).json({ doctor: toAdminDoctor(row) });
  });

  async function requestDoctorChange(doctorId, changeType, newData) {
    return db.withTransaction(async (client) => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      const state = await findDoctorState(client, doctorId);
      if (!state) throw doctorNotFound();
      if (!state.is_active) throw doctorInactive();
      if (newData?.email && (await emailTaken(client, newData.email, state.user_id))) {
        throw new AppError(409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مسجّل مسبقاً.', {
          fields: { email: 'هذا البريد الإلكتروني مسجّل مسبقاً.' },
        });
      }
      const changeId = await insertPendingChange(client, { doctorId, changeType, newData });
      return findPendingChange(client, changeId);
    });
  }

  router.patch('/doctors/:id', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) throw doctorNotFound();
    const { valid, errors, newData } = validateDoctorChange(req.body);
    if (!valid) throw validationError(errors);
    res.status(202).json({ pendingChange: toPendingChange(await requestDoctorChange(id, 'update', newData)) });
  });

  router.delete('/doctors/:id', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) throw doctorNotFound();
    res.status(202).json({ pendingChange: toPendingChange(await requestDoctorChange(id, 'delete')) });
  });

  // ---------- الطلبات المعلّقة ----------

  // الافتراضي: المعلّقة والفاشلة (تحتاج انتباه المدير مع سبب الفشل)؛ status=pending|failed|executed|cancelled|all
  router.get('/pending-changes', async (req, res) => {
    const { status } = req.query;
    if (status !== undefined && !PENDING_STATUS_FILTERS.includes(status)) {
      throw validationError({ status: 'حالة الطلب غير صالحة.' });
    }
    const statuses =
      status === undefined ? ['pending', 'failed'] : status === 'all' ? ['pending', 'failed', 'executed', 'cancelled'] : [status];
    const rows = await listPendingChanges(db, statuses);
    res.json({ pendingChanges: rows.map(toPendingChange) });
  });

  router.post('/pending-changes/:id/cancel', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (id === null) throw changeNotFound();
    const row = await db.withTransaction(async (client) => {
      await client.query(`SET LOCAL lock_timeout = '5s'`);
      if (!(await findPendingChange(client, id))) throw changeNotFound();
      await cancelPendingChange(client, id);
      return findPendingChange(client, id);
    });
    res.json({ pendingChange: toPendingChange(row) });
  });

  return router;
}
