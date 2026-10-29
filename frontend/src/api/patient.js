import { ApiError, NETWORK_ERROR_MESSAGE, apiRequest } from './http';

// الملف الشخصي للمريض المسجَّل. الشكل:
//   { email, firstName, lastName, phone, birthdate, address, gender: 'male' | 'female', bloodType (null = لا أعلم) }

function requireProfile(payload) {
  if (!payload?.profile) throw new ApiError(200, 'BAD_RESPONSE', NETWORK_ERROR_MESSAGE);
  return payload.profile;
}

// GET /api/patient/profile
export async function fetchProfile() {
  return requireProfile(await apiRequest('/patient/profile'));
}

// PUT /api/patient/profile: الحقول الأربعة القابلة للتعديل فقط (الخادم يتجاهل غيرها ويرفض الناقص).
// أخطاء: VALIDATION_ERROR مع fields (firstName, lastName, phone, address).
export async function updateProfile({ firstName, lastName, phone, address }) {
  return requireProfile(
    await apiRequest('/patient/profile', { method: 'PUT', body: { firstName, lastName, phone, address } }),
  );
}

// POST /api/auth/change-password ← 204 (تبقى الجلسة الحالية صالحة).
// أخطاء: VALIDATION_ERROR مع fields (currentPassword = كلمة المرور الحالية غير صحيحة، newPassword، confirmPassword)، RATE_LIMITED.
export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  await apiRequest('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword, confirmPassword },
  });
}
