export const CLINIC_NAME = 'مجمع عافية الطبي الخيري';
export const CLINIC_SHORT_NAME = 'عافية';

// ساعات العمل المعتمدة: السبت – الخميس، والجمعة عطلة (التوقيت: Asia/Damascus)
export const WORKING_HOURS = { open: '09:00', close: '17:00' };
export const WORKING_DAYS_LABEL = 'السبت – الخميس';
export const CLOSED_DAY_LABEL = 'الجمعة';

// الحجز متاح خلال 14 يوماً من اليوم
export const BOOKING_WINDOW_DAYS = 14;

// كل حسابات الأيام والمواعيد بتوقيت دمشق، لا بتوقيت جهاز الزائر
export const CLINIC_TIME_ZONE = 'Asia/Damascus';
// رقم يوم العطلة (الجمعة) كما يعيده getUTCDay: الأحد = 0 ... السبت = 6
export const CLOSED_WEEKDAY = 5;

export const THEME_STORAGE_KEY = 'afiyah-theme';

export const NAV_LINKS = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/specialties', label: 'التخصصات' },
  { to: '/doctors', label: 'الأطباء' },
  { to: '/about', label: 'عن المجمع' },
  { to: '/donations', label: 'التبرع' },
  { to: '/contact', label: 'تواصل معنا' },
];
