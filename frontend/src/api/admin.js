import { ApiError, NETWORK_ERROR_MESSAGE, apiRequest } from './http';

// واجهة المدير (/api/admin/*). الأشكال كما يعيدها الخادم:
//   اختصاص: { id, name, appointmentDuration, doctorsCount, activeDoctorsCount, pendingChange | null }
//   طبيب:   { id, firstName, lastName, email, phone, birthdate, imageUrl, biography, yearsOfExperience,
//             specialtyId, specialtyName, appointmentDuration, isActive, pendingChange | null }
//   طلب معلّق: { id, target: { type: 'doctor' | 'specialty', id, name }, changeType: 'update' | 'delete',
//             newData | null, status, createdAt, effectiveDate (YYYY-MM-DD بتقويم دمشق), failureReason }
// الإضافة فورية (201). تعديل أو حذف الموجود لا يغيّره: يسجّل طلباً مؤجَّلاً (202) يعيد { pendingChange }.
// أخطاء: VALIDATION_ERROR مع fields، وSPECIALTY_EXISTS، وEMAIL_TAKEN، وPENDING_CHANGE_EXISTS، وDOCTOR_INACTIVE،
// وAF120 (اختصاص يضم أطباء)، وAF121 (اختصاص عليه حذف معلّق)، وAF122 (إلغاء غير صالح)، وTRY_AGAIN.

function pick(payload, key) {
  if (payload?.[key] === undefined || payload[key] === null) {
    throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  }
  return payload[key];
}

function pickList(payload, key) {
  const list = payload?.[key];
  if (!Array.isArray(list)) throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  return list;
}

const id = (value) => encodeURIComponent(value);

// ---------- الاختصاصات ----------

// GET /api/admin/specialties
export async function fetchAdminSpecialties() {
  return pickList(await apiRequest('/admin/specialties'), 'specialties');
}

// POST /api/admin/specialties ← 201 { specialty }
export async function createSpecialty({ name, appointmentDuration }) {
  return pick(await apiRequest('/admin/specialties', { method: 'POST', body: { name, appointmentDuration } }), 'specialty');
}

// PATCH /api/admin/specialties/:id ← 202 { pendingChange }؛ changes: name و/أو appointmentDuration
export async function requestSpecialtyUpdate(specialtyId, changes) {
  return pick(await apiRequest(`/admin/specialties/${id(specialtyId)}`, { method: 'PATCH', body: changes }), 'pendingChange');
}

// DELETE /api/admin/specialties/:id ← 202 { pendingChange }
export async function requestSpecialtyDelete(specialtyId) {
  return pick(await apiRequest(`/admin/specialties/${id(specialtyId)}`, { method: 'DELETE' }), 'pendingChange');
}

// ---------- الأطباء ----------

// GET /api/admin/doctors (يشمل الأطباء غير المفعّلين)
export async function fetchAdminDoctors() {
  return pickList(await apiRequest('/admin/doctors'), 'doctors');
}

// POST /api/admin/doctors ← 201 { doctor }؛ كلمة المرور تُرسل مرة واحدة ولا تعود في أي رد
export async function createDoctor(values) {
  return pick(await apiRequest('/admin/doctors', { method: 'POST', body: values }), 'doctor');
}

// PATCH /api/admin/doctors/:id ← 202 { pendingChange }؛ الحقول المتغيّرة فقط، ولا specialtyId أبداً (يرفضه الخادم)
export async function requestDoctorUpdate(doctorId, changes) {
  return pick(await apiRequest(`/admin/doctors/${id(doctorId)}`, { method: 'PATCH', body: changes }), 'pendingChange');
}

// DELETE /api/admin/doctors/:id ← 202 { pendingChange } (عند التنفيذ يُعطَّل الحساب ولا يُحذف الصف)
export async function requestDoctorDelete(doctorId) {
  return pick(await apiRequest(`/admin/doctors/${id(doctorId)}`, { method: 'DELETE' }), 'pendingChange');
}

// ---------- الطلبات المعلّقة ----------

// GET /api/admin/pending-changes[?status=pending|failed|executed|cancelled|all]؛ بدون status: المعلّقة والفاشلة
export async function fetchPendingChanges(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return pickList(await apiRequest(`/admin/pending-changes${query}`), 'pendingChanges');
}

// POST /api/admin/pending-changes/:id/cancel ← { pendingChange } (يُرفض AF122 إن لم يعد معلّقاً أو حان موعده)
export async function cancelPendingChange(changeId) {
  return pick(await apiRequest(`/admin/pending-changes/${id(changeId)}/cancel`, { method: 'POST' }), 'pendingChange');
}

// ---------- المرضى والحجوزات (قراءة فقط) ----------

function pagedResult(payload, key) {
  return { items: pickList(payload, key), hasMore: payload.hasMore === true };
}

function pagingQuery(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '' && value !== 0) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

// GET /api/admin/patients?offset= ← { items: [{ id, firstName, lastName, email, phone }], hasMore }
export async function fetchPatients({ offset = 0 } = {}) {
  return pagedResult(await apiRequest(`/admin/patients${pagingQuery({ offset })}`), 'patients');
}

// GET /api/admin/patients/:id ← { id, …، birthdate, address, gender, bloodType (null = لا أعلم) }
export async function fetchPatient(patientId) {
  return pick(await apiRequest(`/admin/patients/${id(patientId)}`), 'patient');
}

// GET /api/admin/appointments?date=&doctorId=&offset= (الأحدث أولاً)
// ← { items: [{ id, status, phase, date, startTime, endTime | null, doctorId, doctorName, specialtyId, specialtyName, patientId, patientName }], hasMore }
export async function fetchAdminAppointments({ date = '', doctorId = '', offset = 0 } = {}) {
  return pagedResult(await apiRequest(`/admin/appointments${pagingQuery({ date, doctorId, offset })}`), 'appointments');
}
