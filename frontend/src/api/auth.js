import { ApiError, NETWORK_ERROR_MESSAGE, apiRequest } from './http';

// الجلسة في كوكي httpOnly يضبطه الخادم؛ لا يُخزَّن أي رمز في الواجهة.
// شكل المستخدم: { id, email, role: 'patient' | 'doctor' | 'admin', firstName, lastName } (الأسماء null للمدير).

// GET /api/auth/me
// يعيد المستخدم، أو null إن لم توجد جلسة (401 UNAUTHENTICATED). أي خطأ آخر (شبكة أو خادم) يُرمى ولا يُعدّ زائراً.
export async function fetchSession() {
  try {
    const payload = await apiRequest('/auth/me');
    if (!payload?.user) throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
    return payload.user;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

// POST /api/auth/login ← { user } ويضبط الخادم الكوكي. الأخطاء: VALIDATION_ERROR (fields)، INVALID_CREDENTIALS،
// ACCOUNT_INACTIVE، RATE_LIMITED، NETWORK_ERROR.
export async function loginRequest({ email, password }) {
  const payload = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
  if (!payload?.user) throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  return payload.user;
}

const REGISTRATION_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'password',
  'phone',
  'birthdate',
  'address',
  'gender',
  'bloodType',
];

// POST /api/auth/register: حقول التسجيل التسعة فقط. 201 دون تسجيل دخول تلقائي (لا كوكي).
// الأخطاء: VALIDATION_ERROR (fields)، EMAIL_TAKEN (fields.email)، RATE_LIMITED، NETWORK_ERROR.
export async function registerRequest(values) {
  const body = Object.fromEntries(REGISTRATION_FIELDS.map((field) => [field, values[field]]));
  await apiRequest('/auth/register', { method: 'POST', body });
}

// POST /api/auth/logout ← 204. يُرمى عند الفشل ليبقى المستخدم مسجَّلاً في الواجهة.
export async function logoutRequest() {
  await apiRequest('/auth/logout', { method: 'POST' });
}
