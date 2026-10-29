// إعادة التوجيه الآمنة بعد الدخول وحدود مناطق الأدوار. دوال نقية بلا React ليسهل اختبارها.

const MAX_NEXT_LENGTH = 300;
const DUMMY_ORIGIN = 'http://localhost';
const AUTH_BASES = ['/login', '/register'];
const ROLE_BASES = { doctor: '/doctor', admin: '/admin' };
const ROLE_HOMES = { patient: '/', doctor: '/doctor', admin: '/admin' };

export const homePathFor = (role) => ROLE_HOMES[role] ?? '/';

// المسار نفسه أو ما تحته بحدّ مقطع كامل: /admin و/admin/x نعم، /administrator لا
const isWithin = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`);

// منطقة الدور التي يقع فيها المسار ('doctor' أو 'admin')، أو null. المقارنة غير حساسة لحالة الأحرف كمطابقة React Router.
export function roleAreaOf(pathname) {
  const lower = String(pathname).toLowerCase();
  return Object.keys(ROLE_BASES).find((role) => isWithin(lower, ROLE_BASES[role])) ?? null;
}

// يعيد مساراً داخلياً آمناً (مسار + استعلام + معرّف) أو null:
// يجب أن يبدأ بـ / واحدة، بلا // ولا \ ولا فراغات أو محارف تحكم، وبلا مخطط أو مضيف، وبلا ترميز % في المسار،
// ولا يشير إلى /login أو /register (حلقة). التطبيع (مثل /a/../login) يُفحص بعد الحل.
export function getSafeNext(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/[\\\s\x00-\x1f\x7f-\x9f]/.test(raw)) return null;
  // أي ترميز % في المسار الخام مرفوض (يشمل %2e%2e الذي يحوّله المحلّل إلى ..)
  if (raw.split(/[?#]/)[0].includes('%')) return null;

  let url;
  try {
    url = new URL(raw, DUMMY_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== DUMMY_ORIGIN) return null;

  const { pathname } = url;
  // بعد التطبيع قد يصبح المسار // (مثل /.//evil.com) فيُفسَّر مضيفاً
  if (pathname.startsWith('//') || pathname.includes('%')) return null;
  const lower = pathname.toLowerCase();
  if (AUTH_BASES.some((base) => isWithin(lower, base))) return null;

  return `${pathname}${url.search}${url.hash}`;
}

// وجهة المستخدم بعد الدخول: next الآمن إن سُمح به لدوره، وإلا الصفحة الرئيسية لدوره.
// المريض: أي مسار عام عدا منطقتي الطبيب والمدير. الطبيب والمدير: مسارات منطقتهما فقط.
export function resolvePostLoginPath(user, rawNext) {
  const home = homePathFor(user.role);
  const next = getSafeNext(rawNext);
  if (!next) return home;
  const area = roleAreaOf(next.split(/[?#]/)[0]);
  if (user.role === 'patient') return area === null ? next : home;
  return area === user.role ? next : home;
}

// رابط الدخول مع next (إن كان آمناً)
export function buildLoginPath(path) {
  const next = getSafeNext(path);
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

// قرار الوصول لمسار محمي: wait (جارٍ التحقق) | error (تعذّر التحقق من الجلسة) | login | forbidden | allow
export function accessDecision(status, user, roles) {
  if (status === 'loading') return 'wait';
  if (status === 'error') return 'error';
  if (!user) return 'login';
  return roles.includes(user.role) ? 'allow' : 'forbidden';
}
