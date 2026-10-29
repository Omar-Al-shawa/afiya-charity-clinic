// عميل HTTP مشترك للواجهة: طلبات على الأصل نفسه (وكيل Vite في التطوير) والكوكي httpOnly يُرسل تلقائياً.
// أخطاء الخادم بصيغة { error: { code, message, fields? } } وتتحول إلى ApiError.

const API_BASE = '/api';

export const NETWORK_ERROR_MESSAGE = 'تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.';

export class ApiError extends Error {
  constructor(status, code, message, fields = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 عند تعذّر الوصول إلى الخادم
    this.code = code;
    this.fields = fields;
  }
}

// يُسجَّل مرة واحدة من AuthProvider: يُستدعى عند ردّ 401 برمز UNAUTHENTICATED (انتهاء الجلسة) ليُمسح حالة الدخول
let unauthenticatedHandler = null;
export function setUnauthenticatedHandler(handler) {
  unauthenticatedHandler = handler;
}

// path يبدأ بـ "/" ويُضاف إليه /api (مثل '/doctors/3'). يعيد JSON المحلَّل، أو null عند 204.
export async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload?.error;
    if (typeof error?.code === 'string' && typeof error?.message === 'string') {
      if (response.status === 401 && error.code === 'UNAUTHENTICATED') unauthenticatedHandler?.();
      throw new ApiError(response.status, error.code, error.message, error.fields ?? null);
    }
    // جسم ليس بصيغة الخطأ المعتمدة (مثل رد الوكيل عندما يكون الخادم متوقفاً)
    throw new ApiError(response.status, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  }

  // نجاح بجسم غير JSON (مثل صفحة index.html عند غياب الوكيل) لا يُعدّ نتيجة صالحة
  if (payload === null) throw new ApiError(response.status, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  return payload;
}
