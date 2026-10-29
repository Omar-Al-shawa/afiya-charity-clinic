import { ApiError, NETWORK_ERROR_MESSAGE, apiRequest } from './http';

// بوابة الطبيب (قراءة فقط: GET فقط). الخادم يحدّد الطبيب من الجلسة، فلا يُرسل أي معرّف طبيب.
// الحجوزات القائمة فقط (status = booked) تُعاد؛ الملغاة لا تصل إلى الطبيب.

function requireArray(payload, key) {
  if (!Array.isArray(payload?.[key])) throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  return payload;
}

// GET /api/doctor/schedule?view=day|week&date=YYYY-MM-DD
// ← { timeZone, slotDuration, view, from, to,
//     days: [{ date, closed, slots: [{ startTime, endTime, booked, past, appointment: { id, patient } | null }] }] }
// الأسبوع من السبت إلى الجمعة (الجمعة closed). الشبكة تحوي كل الفترات، فتُعرض المحجوزة منها فقط.
export async function fetchDoctorSchedule({ view, date }) {
  const query = new URLSearchParams({ view, date });
  return requireArray(await apiRequest(`/doctor/schedule?${query}`), 'days');
}

// GET /api/doctor/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD (المدى 31 يوماً كحد أقصى)
// ← { from, to, appointments: [{ id, date, startTime, endTime (للقادم فقط، وإلا null), phase: 'upcoming' | 'past',
//     patient: { firstName, lastName, phone } }] }
export async function fetchDoctorAppointments({ from, to }) {
  const query = new URLSearchParams({ from, to });
  const payload = requireArray(await apiRequest(`/doctor/appointments?${query}`), 'appointments');
  return payload.appointments;
}
