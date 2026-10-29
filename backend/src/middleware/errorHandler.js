import { AppError } from '../errors/AppError.js';
import { GENERIC_ERROR_MESSAGE, toAppError } from '../errors/dbErrors.js';

export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'المورد المطلوب غير موجود.'));
}

function normalize(err) {
  if (err instanceof AppError) return err;
  const dbError = toAppError(err);
  if (dbError) return dbError;
  if (err?.type === 'entity.parse.failed') return new AppError(400, 'INVALID_JSON', 'صيغة الطلب غير صالحة.');
  if (err?.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'حجم الطلب كبير جداً.');
  return null;
}

// تنسيق واحد للأخطاء: { error: { code, message } }. الأخطاء غير المتوقعة لا تُسرِّب تفاصيلها للعميل.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const known = normalize(err);
  if (!known) {
    console.error('[api] unexpected error:', err?.code || '', err?.message);
  }
  const status = known ? known.status : 500;
  res.status(status).json({
    error: {
      code: known ? known.code : 'INTERNAL_ERROR',
      message: known ? known.message : GENERIC_ERROR_MESSAGE,
      ...(known?.fields && { fields: known.fields }),
    },
  });
}
