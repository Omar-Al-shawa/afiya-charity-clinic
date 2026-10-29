import { apiRequest } from './http';

// POST /api/contact { name, email, subject, message } ← { sent: true }
// الأخطاء (ApiError): VALIDATION_ERROR مع fields، RATE_LIMITED، CONTACT_UNAVAILABLE (SMTP غير مهيّأ)،
// MAIL_DELIVERY_FAILED، NETWORK_ERROR. الخادم لا يخزّن الرسالة؛ تُرسل بالبريد فقط.
export async function sendContactMessage({ name, email, subject, message }) {
  await apiRequest('/contact', { method: 'POST', body: { name, email, subject, message } });
}
