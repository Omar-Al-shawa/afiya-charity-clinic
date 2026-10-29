import { ApiError, apiRequest } from './http';

// الشكل العام لسجل الطبيب كما يعيده الخادم (العمر محسوب فيه، ولا تاريخ ميلاد ولا هاتف):
//   { id, fullName, age, yearsOfExperience, imageUrl, specialtyId, specialtyName, appointmentDuration }

// GET /api/doctors[?specialtyId=]: الأطباء المفعّلون فقط.
export function fetchDoctors({ specialtyId } = {}) {
  const query = specialtyId ? `?specialtyId=${encodeURIComponent(specialtyId)}` : '';
  return apiRequest(`/doctors${query}`);
}

// GET /api/doctors/:id (يضيف biography: نبذة تعريفية نصية، أو null)
// يعيد null إن لم يوجد الطبيب أو كان غير مفعّل (الخادم يردّ 404 برمز DOCTOR_NOT_FOUND).
export async function fetchDoctorById(id) {
  try {
    return await apiRequest(`/doctors/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'DOCTOR_NOT_FOUND') return null;
    throw error;
  }
}
