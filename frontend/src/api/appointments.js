import { ApiError, NETWORK_ERROR_MESSAGE, apiRequest } from './http';

// GET /api/doctors/:id/availability (للقراءة فقط؛ إنشاء الحجز وإلغاؤه في مرحلة لاحقة).
// الخادم هو المرجع في التواريخ والمواعيد المحجوزة، ويمنع حجز الموعد مرتين وتداخل مواعيد المريض.
//
// الشكل المعاد: null إن لم يوجد الطبيب أو كان غير مفعّل، وإلا
//   { doctorId, timeZone, slotDuration, bookingRestrictedFrom,
//     days: [{ date: 'YYYY-MM-DD', closed, slots: [{ startTime: 'HH:mm', endTime: 'HH:mm', booked }] }] }
// تبدأ الأيام باليوم الحالي في دمشق وبحد أقصى 14 يوماً، وتقصر عند وجود تغيير معلّق يقيّد الحجز
// (bookingRestrictedFrom تاريخ السريان، أو null). الجمعة closed بلا مواعيد، وما بدأ من مواعيد اليوم لا يُعاد.
export async function fetchDoctorAvailability(doctorId) {
  try {
    return await apiRequest(`/doctors/${encodeURIComponent(doctorId)}/availability`);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'DOCTOR_NOT_FOUND') return null;
    throw error;
  }
}

// استجابة ناجحة بلا الحقل المتوقع لا تُعدّ نتيجة صالحة
function requireField(payload, key) {
  if (payload?.[key] === undefined || payload[key] === null) {
    throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  }
  return payload[key];
}

// مواعيد المريض المسجَّل (الهوية من الجلسة). شكل الموعد:
//   { id, status, phase: 'upcoming' | 'past' | 'cancelled', canCancel, date, startTime,
//     endTime (للقادمة فقط، وإلا null), doctorId, doctorName, specialtyId, specialtyName }
// GET /api/appointments ← { appointments }
export async function fetchMyAppointments() {
  const appointments = requireField(await apiRequest('/appointments'), 'appointments');
  if (!Array.isArray(appointments)) throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  return appointments;
}

// POST /api/appointments { doctorId, date: 'YYYY-MM-DD', time: 'HH:mm' } ← 201 { appointment }
// لا يُرسل معرّف المريض أبداً (يُؤخذ من الجلسة). أخطاء مهمة: AF107 (موعد الطبيب محجوز)، AF108 (تعارض مع موعد للمريض)،
// AF103..AF106 وAF109 وAF111 (الموعد غير صالح)، UNAUTHENTICATED، FORBIDDEN (ليس حساب مريض)، TRY_AGAIN، NETWORK_ERROR.
export async function createAppointment({ doctorId, date, time }) {
  const payload = await apiRequest('/appointments', { method: 'POST', body: { doctorId, date, time } });
  return requireField(payload, 'appointment');
}

// POST /api/appointments/:id/cancel ← { appointment }. أخطاء: APPOINTMENT_NOT_FOUND، ALREADY_CANCELLED، APPOINTMENT_STARTED.
export async function cancelAppointment(id) {
  const payload = await apiRequest(`/appointments/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  return requireField(payload, 'appointment');
}
