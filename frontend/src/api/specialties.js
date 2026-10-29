import { apiRequest } from './http';

// GET /api/specialties: [{ id, name, appointmentDuration, doctorsCount }]
// doctorsCount هو عدد الأطباء المفعّلين في التخصص (يحسبه الخادم).
export function fetchSpecialties() {
  return apiRequest('/specialties');
}
