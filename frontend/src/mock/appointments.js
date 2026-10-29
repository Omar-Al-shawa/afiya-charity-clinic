// بيانات تجريبية صريحة وثابتة لحالات المواعيد: لا عشوائية، ولا بيانات مرضى، ولا قاعدة مواعيد وهمية.
// ليست توافراً حقيقياً: واجهة الحجز تعرضها بوصفها "تجريبية". يحل محلها لاحقاً توافر قادم من الخادم.
//
// السيناريو يتحدد بيوم الأسبوع (فيثبت لكل تاريخ ويسهل توقّعه)، ويُطبَّق على كل الأطباء:
//   mixed: بعض مواعيد اليوم محجوز (انظر MIXED_BOOKED_SLOT_NUMBERS)
//   open:  كل مواعيد اليوم متاحة
//   full:  كل مواعيد اليوم محجوزة
// الجمعة عطلة فلا مواعيد فيها أصلاً (لا تُولَّد في utils/schedule.js).
const SCENARIO_BY_WEEKDAY = {
  6: 'mixed', // السبت
  0: 'open', // الأحد
  1: 'full', // الاثنين
  2: 'mixed', // الثلاثاء
  3: 'open', // الأربعاء
  4: 'mixed', // الخميس
};

// في سيناريو mixed تُحجز هذه المواعيد بترقيمها خلال اليوم (1 = أول موعد عند بداية الدوام)، أياً كانت مدة الموعد
const MIXED_BOOKED_SLOT_NUMBERS = [1, 3, 4, 8];

export function getMockScenario(weekday) {
  return SCENARIO_BY_WEEKDAY[weekday] ?? 'open';
}

// slotNumber يبدأ من 1 ويُحسب على مواعيد اليوم الكاملة (قبل إخفاء ما فات منها)، فلا تتغير حالة الموعد مع مرور اليوم
export function isMockBooked(scenario, slotNumber) {
  if (scenario === 'full') return true;
  if (scenario === 'mixed') return MIXED_BOOKED_SLOT_NUMBERS.includes(slotNumber);
  return false;
}
