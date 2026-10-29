import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'afiyah_token';
const ALGORITHM = 'HS256';

// الرمز يحمل هوية المستخدم فقط (sub)؛ الدور وحالة التفعيل تُقرأ من القاعدة عند كل طلب
export function signToken(userId, auth) {
  return jwt.sign({}, auth.jwtSecret, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: auth.tokenTtlSeconds,
  });
}

// يعيد معرّف المستخدم أو null لأي رمز غير صالح (توقيع، خوارزمية، انتهاء)
export function verifyToken(token, auth) {
  try {
    const payload = jwt.verify(token, auth.jwtSecret, { algorithms: [ALGORITHM] });
    const userId = Number(payload.sub);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null;
  }
}

const baseOptions = (auth) => ({ httpOnly: true, sameSite: 'lax', secure: auth.cookieSecure, path: '/' });

export function setAuthCookie(res, token, auth) {
  res.cookie(COOKIE_NAME, token, { ...baseOptions(auth), maxAge: auth.tokenTtlSeconds * 1000 });
}

export function clearAuthCookie(res, auth) {
  res.clearCookie(COOKIE_NAME, baseOptions(auth));
}
