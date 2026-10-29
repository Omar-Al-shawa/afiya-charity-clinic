import { AppError } from '../errors/AppError.js';
import { TRY_AGAIN } from '../errors/dbErrors.js';

// يُسجَّل رمز الخطأ فقط إن كان شكله رمزاً (مثل ECONNRESET)؛ لا رسالة ولا أي تفاصيل
function safeErrorCode(err) {
  return typeof err?.code === 'string' && /^[A-Za-z0-9_]{2,30}$/.test(err.code) ? err.code : 'UNKNOWN';
}

// ينفّذ التغييرات المعلّقة المستحقة قبل العمليات المعتمدة على حالتها (الأطباء النشطون، الاختصاصات، قيد الحجز، الدخول).
// بلا processDueChanges (الاختبارات) يمرّ الطلب كما هو. عند فشل المعالجة يُرفض الطلب بـ 503 ولا يُكمل على بيانات قديمة.
export function createDueChangesGuard(processDueChanges) {
  return async function dueChangesGuard(req, res, next) {
    if (!processDueChanges) return next();
    try {
      await processDueChanges();
    } catch (err) {
      console.error('[pending] processing due changes failed:', safeErrorCode(err));
      throw new AppError(TRY_AGAIN[0], TRY_AGAIN[1], TRY_AGAIN[2]);
    }
    next();
  };
}
