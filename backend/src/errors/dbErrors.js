import { AppError } from './AppError.js';

// رموز SQLSTATE الخاصة بالتطبيق (AF1xx) كما عُرِّفت في backend/db/002 و004 و005.
// AF113 (عزل المعاملة) خطأ برمجي لا يخص المستخدم فلا يُعرض نصّه.
const DB_ERRORS = {
  AF102: [404, 'الطبيب غير موجود أو غير متاح للحجز.'],
  AF103: [422, 'لا يمكن حجز موعد بدأ وقته أو مضى.'],
  AF104: [422, 'التاريخ خارج نافذة الحجز (14 يوماً تشمل اليوم).'],
  AF105: [422, 'ينتهي هذا الموعد بعد انتهاء الدوام (5:00 م).'],
  AF106: [422, 'الحجز غير متاح في هذا التاريخ بسبب تغيير إداري معلّق.'],
  AF107: [409, 'هذا الموعد محجوز أو يتعارض مع موعد آخر للطبيب.'],
  AF108: [409, 'لديك موعد آخر يتعارض مع هذا الوقت.'],
  AF109: [422, 'يوم الجمعة عطلة ولا توجد فيه مواعيد.'],
  AF110: [400, 'بيانات الحجز غير مكتملة.'],
  AF111: [422, 'وقت الموعد غير صالح؛ الدوام من 9:00 ص إلى 5:00 م.'],
  AF112: [409, 'لا يمكن تعديل هذا الموعد؛ احجز موعداً جديداً بدلاً من إعادة تفعيل موعد ملغى.'],
  AF114: [422, 'لا يمكن تغيير اختصاص الطبيب.'],
  AF120: [409, 'لا يمكن حذف اختصاص يضم أطباء.'],
  AF121: [409, 'لا يمكن إضافة طبيب إلى اختصاص عليه طلب حذف معلّق.'],
  AF122: [409, 'الطلب المعلّق غير موجود أو لم يعد معلّقاً أو فات وقت إلغائه.'],
};

export const GENERIC_ERROR_MESSAGE = 'حدث خطأ غير متوقع. حاول مرة أخرى لاحقاً.';

export const TRY_AGAIN = [503, 'TRY_AGAIN', 'الخادم مشغول حالياً. حاول مرة أخرى بعد قليل.'];

// القيود المسمّاة (الرمز:اسم القيد): فهرسا الحجز الفريدان خط الدفاع الثاني بعد المشغّل ويُبلَّغ عنهما برسالتي AF107 وAF108؛
// وقيود الإدارة: [الحالة، الرمز، الرسالة، الحقل المرتبط إن وُجد]
const PENDING_EXISTS = 'يوجد طلب تغيير معلّق لهذا العنصر؛ ألغِه أو انتظر تنفيذه قبل تسجيل طلب آخر.';
const CONSTRAINT_ERRORS = {
  '23505:appointments_doctor_slot_uq': [DB_ERRORS.AF107[0], 'AF107', DB_ERRORS.AF107[1]],
  '23505:appointments_patient_slot_uq': [DB_ERRORS.AF108[0], 'AF108', DB_ERRORS.AF108[1]],
  '23505:users_email_key': [409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مسجّل مسبقاً.', 'email'],
  '23505:specialties_specialty_name_key': [409, 'SPECIALTY_EXISTS', 'هذا الاختصاص موجود مسبقاً.', 'name'],
  '23505:pending_changes_one_per_doctor': [409, 'PENDING_CHANGE_EXISTS', PENDING_EXISTS],
  '23505:pending_changes_one_per_specialty': [409, 'PENDING_CHANGE_EXISTS', PENDING_EXISTS],
  '23503:doctors_specialty_id_fkey': [400, 'SPECIALTY_NOT_FOUND', 'الاختصاص غير موجود.', 'specialtyId'],
};
// deadlock_detected وserialization_failure وlock_not_available (انتهاء lock_timeout): أعد المحاولة
const RETRYABLE = new Set(['40P01', '40001', '55P03']);

// يحوّل خطأ PostgreSQL معروفاً (رموز AF أو قيود مسمّاة أو أخطاء الأقفال) إلى AppError، وإلا يعيد null
export function toAppError(err) {
  const code = typeof err?.code === 'string' ? err.code : null;
  if (code === null) return null;
  const key = `${code}:${err.constraint}`;
  if (Object.hasOwn(CONSTRAINT_ERRORS, key)) {
    const [status, mappedCode, message, field] = CONSTRAINT_ERRORS[key];
    return new AppError(status, mappedCode, message, { cause: err, ...(field && { fields: { [field]: message } }) });
  }
  if (RETRYABLE.has(code)) return new AppError(TRY_AGAIN[0], TRY_AGAIN[1], TRY_AGAIN[2], { cause: err });
  const entry = Object.hasOwn(DB_ERRORS, code) ? DB_ERRORS[code] : null;
  return entry ? new AppError(entry[0], code, entry[1], { cause: err }) : null;
}
