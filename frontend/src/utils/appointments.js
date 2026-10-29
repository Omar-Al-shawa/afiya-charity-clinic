// ترتيب مواعيد المريض وتصنيف أخطاء الحجز والإلغاء. دوال نقية بلا React ليسهل اختبارها.

export const BOOKING_PATIENT_ONLY_MESSAGE = 'الحجز متاح لحسابات المرضى فقط.';
export const BOOKING_CHECK_MESSAGE =
  'تعذّر الاتصال بالخادم، وقد يكون الحجز قد تم. راجع «مواعيدي» قبل إعادة المحاولة.';
const GENERIC_MESSAGE = 'حدث خطأ غير متوقع. حاول مرة أخرى لاحقاً.';

const startKey = (appointment) => `${appointment.date}T${appointment.startTime}`;
const ascending = (a, b) => (startKey(a) < startKey(b) ? -1 : startKey(a) > startKey(b) ? 1 : a.id - b.id);
const descending = (a, b) => ascending(b, a);

// القادمة: الأقرب أولاً. السابقة والملغاة: الأحدث أولاً.
export function groupAppointments(appointments) {
  const upcoming = [];
  const past = [];
  const cancelled = [];
  for (const appointment of appointments) {
    if (appointment.phase === 'upcoming') upcoming.push(appointment);
    else if (appointment.phase === 'cancelled') cancelled.push(appointment);
    else past.push(appointment);
  }
  return { upcoming: upcoming.sort(ascending), past: past.sort(descending), cancelled: cancelled.sort(descending) };
}

// الموعد لم يعد صالحاً: تُحدَّث المواعيد المتاحة ويُزال الوقت المختار (AF102..AF106، AF107، AF109، AF111)
const REFRESH_CODES = new Set(['AF102', 'AF103', 'AF104', 'AF105', 'AF106', 'AF107', 'AF109', 'AF111']);

// نتيجة التصنيف: { kind, message? }
//   login     ← الجلسة منتهية: إلى الدخول مع next
//   forbidden ← ليس حساب مريض
//   refresh   ← الموعد لم يعد صالحاً: حدّث التوافر وأزل الوقت المختار وأظهر message
//   check     ← فشل شبكة أو استجابة غير معتمدة: قد يكون الحجز نجح، فيُطلب من المريض مراجعة «مواعيدي» قبل إعادة المحاولة
//   keep      ← أبقِ الاختيار وأظهر message (تعارض مع موعد للمريض AF108، خادم مشغول، خطأ آخر)
export function classifyBookingError(error) {
  const code = error?.code;
  if (code === 'UNAUTHENTICATED') return { kind: 'login' };
  if (code === 'FORBIDDEN') return { kind: 'forbidden', message: BOOKING_PATIENT_ONLY_MESSAGE };
  if (REFRESH_CODES.has(code)) return { kind: 'refresh', message: error.message };
  if (code === 'NETWORK_ERROR' || code === 'BAD_RESPONSE') return { kind: 'check', message: BOOKING_CHECK_MESSAGE };
  return { kind: 'keep', message: typeof error?.message === 'string' && code ? error.message : GENERIC_MESSAGE };
}

// الإلغاء: الحالات التي تغيّرت على الخادم (أو لا يمكن التأكد منها) تُحدَّث لها القائمة ليظهر الوضع الفعلي
const CANCEL_REFRESH_CODES = new Set(['APPOINTMENT_NOT_FOUND', 'ALREADY_CANCELLED', 'APPOINTMENT_STARTED']);

export function classifyCancelError(error) {
  const code = error?.code;
  if (code === 'UNAUTHENTICATED') return { kind: 'login' };
  if (CANCEL_REFRESH_CODES.has(code) || code === 'NETWORK_ERROR' || code === 'BAD_RESPONSE') {
    return { kind: 'refresh', message: error.message };
  }
  return { kind: 'keep', message: typeof error?.message === 'string' && code ? error.message : GENERIC_MESSAGE };
}
