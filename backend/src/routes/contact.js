import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/AppError.js';
import { validateContact } from '../validation/contact.js';

// 5 طلبات في الساعة لكل IP؛ config.contact?.rateLimit للاختبارات فقط
const DEFAULT_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 };

// يُسجَّل رمز الخطأ فقط إن كان شكله رمزاً (مثل EAUTH وECONNECTION)؛ لا رسالة ولا استجابة الخادم ولا أي محتوى
function safeErrorCode(err) {
  return typeof err?.code === 'string' && /^[A-Za-z_]{2,30}$/.test(err.code) ? err.code : 'UNKNOWN';
}

export function createContactRouter({ config, mailer }) {
  const router = Router();
  const { windowMs, max } = config.contact?.rateLimit ?? DEFAULT_RATE_LIMIT;
  const limiter = rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'محاولات كثيرة. حاول مرة أخرى بعد قليل.')),
  });

  // عام (بلا تسجيل دخول). لا يُخزَّن شيء في قاعدة البيانات؛ الرسالة تُرسل بالبريد فقط.
  router.post('/', limiter, async (req, res) => {
    if (!mailer) {
      throw new AppError(503, 'CONTACT_UNAVAILABLE', 'خدمة التواصل غير متاحة حالياً. حاول لاحقاً.');
    }
    const { valid, errors, values } = validateContact(req.body);
    if (!valid) throw new AppError(400, 'VALIDATION_ERROR', 'تحقق من الحقول المدخلة.', { fields: errors });

    try {
      await mailer.sendContact(values);
    } catch (err) {
      console.error('[contact] delivery failed:', safeErrorCode(err));
      throw new AppError(502, 'MAIL_DELIVERY_FAILED', 'تعذّر إرسال رسالتك حالياً. حاول مرة أخرى لاحقاً.');
    }
    res.json({ sent: true });
  });

  return router;
}
