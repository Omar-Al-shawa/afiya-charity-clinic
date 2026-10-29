import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import { createAuthenticate, requireRole } from '../middleware/authenticate.js';
import { findPatientProfile, updatePatientProfile } from '../repositories/patientRepository.js';
import { validateProfileUpdate } from '../validation/profile.js';

const noProfile = () => new AppError(403, 'PATIENT_PROFILE_REQUIRED', 'هذا الحساب لا يملك ملف مريض.');

// bloodType: null تعني غير معروفة (تُعرض في الواجهة «لا أعلم»)؛ البريد من حساب الجلسة
function toPublicProfile(email, row) {
  return {
    email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    birthdate: row.birth_date,
    address: row.address,
    gender: row.gender,
    bloodType: row.blood_type,
  };
}

// المريض المسجّل فقط، وملفه يُحدَّد من الجلسة (req.user.id) لا من الطلب
export function createPatientRouter({ db, config }) {
  const router = Router();
  router.use(createAuthenticate({ db, auth: config.auth }), requireRole('patient'));

  router.get('/profile', async (req, res) => {
    const row = await findPatientProfile(db, req.user.id);
    if (!row) throw noProfile();
    res.set('Cache-Control', 'no-store');
    res.json({ profile: toPublicProfile(req.user.email, row) });
  });

  router.put('/profile', async (req, res) => {
    const { valid, errors, values } = validateProfileUpdate(req.body);
    if (!valid) throw new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields: errors });
    const row = await updatePatientProfile(db, req.user.id, values);
    if (!row) throw noProfile();
    res.json({ profile: toPublicProfile(req.user.email, row) });
  });

  return router;
}
