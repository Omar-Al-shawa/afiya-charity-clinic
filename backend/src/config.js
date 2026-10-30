// قراءة متغيرات البيئة والتحقق منها (تُحمَّل بـ node --env-file). لا تُطبع كلمة المرور في أي مكان.
// DB_NAME وDB_USER مطلوبان فقط عند غياب DATABASE_URL (الاستضافة تمرّر DATABASE_URL وحدها)
const REQUIRED = ['DB_NAME', 'DB_USER', 'JWT_SECRET'];
const JWT_SECRET_MIN_LENGTH = 32;
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function parsePort(value, name, fallback) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}: must be an integer between 1 and 65535`);
  }
  return port;
}

// عدد وسطاء البروكسي الموثوقين (TRUST_PROXY): عدد صحيح فقط؛ يبقى معطّلاً (false) افتراضياً فلا يتغير السلوك المحلي.
// true غير مقبولة: تسمح بانتحال X-Forwarded-For وتُبطل تحديد المعدّل.
function parseTrustProxy(value) {
  if (value === undefined || value === '') return false;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    throw new Error('Invalid TRUST_PROXY: must be an integer between 0 and 10 (the number of trusted proxies)');
  }
  return hops === 0 ? false : hops;
}

// الاتصال عبر DATABASE_URL (الاستضافة). لا تُطبع قيمته ولا يُدرج في رسائل الأخطاء.
// DATABASE_SSL اختياري: true (تشفير مع التحقق من الشهادة) أو no-verify (تشفير دون تحقق) أو false؛ وغيابه يترك ما في الرابط (sslmode).
function parseDatabaseUrl(env) {
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('Invalid DATABASE_URL: must be a postgres:// or postgresql:// connection string');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Invalid DATABASE_URL: must be a postgres:// or postgresql:// connection string');
  }
  const config = {
    connectionString: env.DATABASE_URL,
    // للعرض في السكربتات فقط (اسم القاعدة ليس سراً)؛ الاتصال يأخذ قيمه من الرابط
    database: url.pathname.replace(/^\//, ''),
  };
  const ssl = (env.DATABASE_SSL || '').toLowerCase();
  if (ssl === 'true') config.ssl = true;
  else if (ssl === 'no-verify') config.ssl = { rejectUnauthorized: false };
  else if (ssl === 'false') config.ssl = false;
  else if (ssl !== '') throw new Error('Invalid DATABASE_SSL: use true, no-verify, or false');
  return config;
}

// أصول الواجهة المسموح لها بطلبات التعديل (CSRF): من ALLOWED_ORIGINS، وإلا خادم Vite المحلي خارج الإنتاج.
// الطلب من الأصل نفسه (Host) مسموح دائماً ولا يحتاج إدراجاً هنا.
function parseOrigins(value, nodeEnv) {
  if (!value) return nodeEnv === 'production' ? [] : DEV_ORIGINS;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item).origin;
      } catch {
        throw new Error('Invalid ALLOWED_ORIGINS: each entry must be a full origin such as http://localhost:5173');
      }
    });
}

// إعداد SMTP لنموذج التواصل: اختياري بالكامل (غيابه كلياً يعني smtp = null)، والناقص منه يُرفض عند الإقلاع.
// رسائل الأخطاء تسمّي المتغيرات فقط ولا تتضمن أي قيمة.
const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'CONTACT_RECIPIENT'];
const SMTP_ADDRESS_PATTERN = /^[^\s@<>"]+@[^\s@<>".]+(\.[^\s@<>".]+)+$/;

function parseSmtp(env) {
  if (SMTP_VARS.every((name) => !env[name])) return null;
  const missing = SMTP_VARS.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Incomplete SMTP configuration, missing: ${missing.join(', ')}`);
  }
  for (const name of ['SMTP_FROM', 'CONTACT_RECIPIENT']) {
    if (!SMTP_ADDRESS_PATTERN.test(env[name])) throw new Error(`Invalid ${name}: must be a plain email address`);
  }
  return {
    host: env.SMTP_HOST,
    port: parsePort(env.SMTP_PORT, 'SMTP_PORT'),
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
    recipient: env.CONTACT_RECIPIENT,
  };
}

// إعداد قاعدة البيانات وحده: يستعمله loadConfig وسكربت إنشاء المدير (الذي لا يحتاج JWT_SECRET ولا SMTP)
export function loadDbConfig(env = process.env) {
  if (env.DATABASE_URL) return parseDatabaseUrl(env);
  const missing = ['DB_NAME', 'DB_USER'].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return {
    host: env.DB_HOST || 'localhost',
    port: parsePort(env.DB_PORT, 'DB_PORT', 5432),
    database: env.DB_NAME,
    user: env.DB_USER,
    // اختيارية: الاتصال المحلي قد لا يتطلب كلمة مرور
    password: env.DB_PASSWORD || undefined,
  };
}

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((name) => !env[name] && !(env.DATABASE_URL && name.startsWith('DB_')));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (env.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters`);
  }
  const nodeEnv = env.NODE_ENV || 'development';
  return {
    nodeEnv,
    port: parsePort(env.PORT, 'PORT', 3001),
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS, nodeEnv),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    auth: {
      jwtSecret: env.JWT_SECRET,
      tokenTtlSeconds: 8 * 60 * 60,
      bcryptCost: 12,
      cookieSecure: nodeEnv === 'production',
      rateLimit: { windowMs: 15 * 60 * 1000, max: 10 },
    },
    db: loadDbConfig(env),
    smtp: parseSmtp(env),
  };
}
