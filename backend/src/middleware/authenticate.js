import { AppError } from '../errors/AppError.js';
import { COOKIE_NAME, verifyToken } from '../auth/tokens.js';
import { findAccountById, toPublicUser } from '../auth/userRepository.js';

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'سجّل الدخول للمتابعة.');

// يتحقق من الرمز في الكوكي ثم يقرأ الدور وis_active الحاليين من PostgreSQL عند كل طلب (لا يُعتمد على الرمز ولا على البريد)
export function createAuthenticate({ db, auth }) {
  return async function authenticate(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    const userId = typeof token === 'string' ? verifyToken(token, auth) : null;
    if (!userId) throw unauthenticated();
    const account = await findAccountById(db, userId);
    if (!account || !account.is_active) throw unauthenticated();
    req.user = toPublicUser(account);
    next();
  };
}

// يُستعمل بعد authenticate
export function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) throw unauthenticated();
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'ليست لديك صلاحية للوصول إلى هذا المورد.');
    }
    next();
  };
}
