// أدوات نصية عربية للبحث والترتيب.
// لا تغيّر النص المعروض أبداً: تُنتج مفتاح مقارنة فقط، ويبقى الاسم الأصلي كما هو.

// تطويل + علامات التشكيل + علامات المصحف الصغيرة
const DIACRITICS = /[ـً-ٰٟۖ-ۭ]/g;

// يوحّد الكتابات المتقاربة حتى لا يفشل البحث بسبب اختلاف الهمزة أو الياء أو التاء المربوطة،
// فيطابق "امراض" و"أمراض"، و"اطفال" و"الأطفال".
export function normalizeArabic(text) {
  return String(text ?? '')
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ ← ا
    .replace(/ى/g, 'ي') // ى ← ي
    .replace(/ة/g, 'ه') // ة ← ه
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// مفتاح الترتيب: الاسم المطبَّع دون "ال" التعريف في أوله (مثلاً "الكتاب" تُرتَّب كأنها "كتاب")
function sortKey(name) {
  const normalized = normalizeArabic(name);
  return normalized.startsWith('ال') ? normalized.slice(2) : normalized;
}

// مقارنة للترتيب الأبجدي العربي مع تجاهل "ال" في أول الاسم
export function compareArabic(a, b) {
  return sortKey(a).localeCompare(sortKey(b), 'ar');
}
