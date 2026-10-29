// قراءة متغيرات البيئة والتحقق منها (تُحمَّل بـ node --env-file). لا تُطبع كلمة المرور في أي مكان.
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
  const missing = REQUIRED.filter((name) => !env[name]);
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
