import { AppError } from '../errors/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isAllowedOrigin(origin, req, allowedOrigins) {
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.get('host'); // الأصل نفسه (نشر موحّد)
  } catch {
    return false; // مثل Origin: null
  }
}

// حماية CSRF خفيفة: طلب تعديل يحمل Origin غير مسموح يُرفض. غياب Origin (عميل غير متصفح) مسموح؛
// المتصفحات ترسل Origin مع كل طلب POST عابر للأصل، ويكمّل ذلك SameSite=Lax على الكوكي.
export function createOriginGuard({ allowedOrigins }) {
  return function originGuard(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin === undefined || isAllowedOrigin(origin, req, allowedOrigins)) return next();
    next(new AppError(403, 'FORBIDDEN_ORIGIN', 'مصدر الطلب غير مسموح به.'));
  };
}
