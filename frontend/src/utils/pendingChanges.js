// عرض الطلبات المعلّقة (التغييرات الإدارية المؤجَّلة 14 يوماً) بالعربية. دوال نقية؛ now معامل ليمكن اختبارها.
// تاريخ السريان effectiveDate نص YYYY-MM-DD بتقويم دمشق، ويسري الطلب عند 00:00 (12:00 ص) بتوقيت دمشق من ذلك اليوم.
import { formatMinutes, formatYears } from './format';
import { getDamascusNow, getDateLabels } from './schedule';

export const STATUS_LABELS = {
  pending: 'معلّق',
  executed: 'نُفِّذ',
  cancelled: 'أُلغي',
  failed: 'فشل',
};

export const CHANGE_TYPE_LABELS = { update: 'تعديل', delete: 'حذف' };
export const TARGET_LABELS = { doctor: 'الطبيب', specialty: 'الاختصاص' };

// مفاتيح newData كما يعيدها الخادم (camelCase)
export const FIELD_LABELS = {
  firstName: 'الاسم الأول',
  lastName: 'اسم العائلة',
  email: 'البريد الإلكتروني',
  phone: 'رقم الهاتف',
  birthdate: 'تاريخ الميلاد',
  imageUrl: 'رابط الصورة',
  biography: 'السيرة',
  yearsOfExperience: 'سنوات الخبرة',
  name: 'اسم الاختصاص',
  appointmentDuration: 'مدة الموعد',
};

export const formatEffectiveDate = (date) => `${getDateLabels(date).long}، الساعة 12:00 ص بتوقيت دمشق`;

// القيم الجديدة لطلب تعديل: [{ key, label, value }]؛ القيمة الفارغة تظهر «(فارغ)»
export function describeNewData(newData) {
  if (!newData) return [];
  return Object.entries(newData).map(([key, raw]) => {
    let value = '(فارغ)';
    if (raw !== null && raw !== '' && raw !== undefined) {
      if (key === 'appointmentDuration') value = formatMinutes(Number(raw));
      else if (key === 'yearsOfExperience') value = formatYears(Number(raw));
      else if (key === 'birthdate') value = getDateLabels(String(raw)).long;
      else value = String(raw);
    }
    return { key, label: FIELD_LABELS[key] ?? key, value };
  });
}

// بلغ الطلب المعلّق تاريخ سريانه (اليوم بتوقيت دمشق ≥ تاريخ السريان) لكنه ما زال pending: لم تعالجه الخلفية بعد
export function isOverdue(change, now = new Date()) {
  return change.status === 'pending' && change.effectiveDate <= getDamascusNow(now).date;
}

// الإلغاء مسموح للمعلّق قبل وقت سريانه فقط (الخادم يرفض بعده بالرمز AF122)
export const canCancelChange = (change, now = new Date()) => change.status === 'pending' && !isOverdue(change, now);

export const OVERDUE_MESSAGE =
  'حان موعد تنفيذ هذا الطلب. تُنفَّذ الطلبات المستحقة تلقائياً عند أول طلب يصل إلى النظام، فحدّث الصفحة بعد لحظات لعرض النتيجة. لا يمكن إلغاؤه الآن.';

// عنوان الطلب: «تعديل الاختصاص طب القلب»
export function changeTitle(change) {
  return `${CHANGE_TYPE_LABELS[change.changeType] ?? change.changeType} ${TARGET_LABELS[change.target.type]} ${change.target.name}`;
}

// رسالة نجاح 202: الطلب سُجِّل ولم يُطبَّق بعد
export function deferredMessage(change) {
  const what = change.changeType === 'delete' ? 'حذف' : 'تعديل';
  return `سُجِّل طلب ${what} ${TARGET_LABELS[change.target.type]} ${change.target.name} ولم يُطبَّق بعد. سيُنفَّذ يوم ${formatEffectiveDate(change.effectiveDate)}. يمكنك إلغاؤه قبل ذلك من صفحة «الطلبات المعلّقة».`;
}

export const PENDING_EXISTS_HINT = 'يوجد طلب معلّق لهذا العنصر؛ ألغِه أو انتظر تنفيذه قبل تسجيل طلب آخر.';
