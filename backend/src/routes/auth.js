import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/AppError.js';
import { exceedsMaxBytes, hashPassword, verifyPassword } from '../auth/passwords.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../auth/tokens.js';
import {
  createPatientAccount,
  findAccountByEmail,
  findPasswordHash,
  toPublicUser,
  updatePasswordHash,
} from '../auth/userRepository.js';
import { createAuthenticate, requireRole } from '../middleware/authenticate.js';
import { validatePasswordChange } from '../validation/profile.js';
import { validateRegistration } from '../validation/registration.js';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');

function limiter({ windowMs, max, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit: max,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'محاولات كثيرة. حاول مرة أخرى بعد قليل.')),
  });
}

export function createAuthRouter({ db, config, dueChanges }) {
  const { auth } = config;
  const router = Router();
  const authenticate = createAuthenticate({ db, auth });
  // مقارنة وهمية عند عدم وجود البريد حتى لا يختلف زمن الاستجابة
  const dummyHash = hashPassword('afiyah-dummy-password', auth.bcryptCost);

  // التسجيل العام ينشئ حساب مريض فقط؛ لا يُقرأ أي دور من الطلب، ولا تسجيل دخول تلقائي
  router.post('/register', limiter(auth.rateLimit), async (req, res) => {
    const { valid, errors, values } = validateRegistration(req.body);
    if (!valid) throw new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields: errors });

    const passwordHash = await hashPassword(values.password, auth.bcryptCost);
    let userId;
    try {
      userId = await db.withTransaction((client) =>
        createPatientAccount(client, { email: values.email, passwordHash, patient: values }),
      );
    } catch (err) {
      if (err?.code === '23505' && err.constraint === 'users_email_key') {
        throw new AppError(409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مسجّل مسبقاً.', {
          fields: { email: 'هذا البريد الإلكتروني مسجّل مسبقاً.' },
        });
      }
      throw err;
    }
    res.status(201).json({
      user: { id: userId, email: values.email, role: 'patient', firstName: values.firstName, lastName: values.lastName },
    });
  });

  // الدخول الناجح لا يُحتسب في الحد (الفاشل فقط)؛ dueChanges قبل قراءة الحساب ليظهر تعطيل الطبيب المستحق
  router.post('/login', limiter({ ...auth.rateLimit, skipSuccessfulRequests: true }), dueChanges, async (req, res) => {
    const { email, password } = req.body ?? {};
    const fields = {};
    if (typeof email !== 'string' || !email.trim()) fields.email = 'أدخل البريد الإلكتروني.';
    if (typeof password !== 'string' || !password) fields.password = 'أدخل كلمة المرور.';
    if (Object.keys(fields).length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields });
    }

    const account = await findAccountByEmail(db, email.trim().toLowerCase());
    const matches = await verifyPassword(password, account ? account.password_hash : await dummyHash);
    // كلمة مرور أطول من 72 بايت لا يمكن أن تكون مسجَّلة؛ تُعامل كخاطئة بدل المقارنة بنسخة مقصوصة
    if (!account || !matches || exceedsMaxBytes(password)) throw invalidCredentials();
    if (!account.is_active) throw new AppError(403, 'ACCOUNT_INACTIVE', 'هذا الحساب غير مفعّل.');

    setAuthCookie(res, signToken(account.user_id, auth), auth);
    res.json({ user: toPublicUser(account) });
  });

  router.post('/logout', (req, res) => {
    clearAuthCookie(res, auth);
    res.status(204).end();
  });

  // تغيير كلمة مرور الحساب نفسه (مريض أو طبيب أو مدير): تُتحقق الحالية بـ bcrypt ويُحدَّث password_hash للمستخدم الحالي فقط.
  // حدّ كلمة المرور الجديدة 8 أحرف، و12 للمدير (يُحدَّد من دور الجلسة).
  // الجلسات الأخرى تبقى صالحة حتى انتهاء رمزها (JWT بلا إبطال) وهو قيد مقبول.
  router.post(
    '/change-password',
    authenticate,
    requireRole('patient', 'doctor', 'admin'),
    limiter(auth.rateLimit),
    async (req, res) => {
      const { valid, errors, values } = validatePasswordChange(req.body, req.user.role);
      if (!valid) throw new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields: errors });

      const currentHash = await findPasswordHash(db, req.user.id);
      const matches =
        currentHash !== null &&
        !exceedsMaxBytes(values.currentPassword) &&
        (await verifyPassword(values.currentPassword, currentHash));
      if (!matches) {
        throw new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', {
          fields: { currentPassword: 'كلمة المرور الحالية غير صحيحة.' },
        });
      }

      await updatePasswordHash(db, req.user.id, await hashPassword(values.newPassword, auth.bcryptCost));
      res.status(204).end();
    },
  );

  router.get('/me', dueChanges, authenticate, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user });
  });

  return router;
}
