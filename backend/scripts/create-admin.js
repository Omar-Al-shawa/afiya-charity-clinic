// إنشاء حساب المدير الوحيد (يدوي، مرة واحدة): npm run admin:create [-- admin@example.com]
// البريد من الوسيط الأول أو ADMIN_EMAIL؛ كلمة المرور من موجِّه مخفي في الطرفية فقط (لا متغير بيئة ولا وسيط).
// لا يُطبع أي سر: لا كلمة المرور ولا الـ hash ولا كائنات الأخطاء الكاملة.
import { createDb } from '../src/db/pool.js';
import { loadDbConfig } from '../src/config.js';
import {
  ADMIN_PASSWORD_MIN,
  AdminSetupError,
  adminExists,
  checkAdminPassword,
  createAdminAccount,
} from '../src/auth/adminSetup.js';
import { checkEmail } from '../src/validation/registration.js';

// أخطاء هذا السكربت المقصودة فقط (مع AdminSetupError) تُطبع رسائلها؛ أي خطأ آخر يُطبع بصيغة عامة
class CliError extends Error {}

// الأحرف المقبولة: غير تحكمية. تُستعاد الطرفية (الوضع الخام والمستمع والإيقاف) في كل المسارات:
// الإدخال والإلغاء Ctrl-C وإغلاق الدخل وأي استثناء داخل المعالج.
function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let input = '';
    let settled = false;

    const cleanup = () => {
      stdin.off('data', onData);
      stdin.off('end', onEnd);
      stdin.off('error', onError);
      try {
        stdin.setRawMode(false);
      } finally {
        stdin.pause();
      }
      stdout.write('\n');
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      try {
        cleanup();
      } finally {
        fn(value);
      }
    };
    const onData = (chunk) => {
      try {
        if (chunk.startsWith('\u001b')) return; // مفاتيح الأسهم وغيرها
        for (const char of chunk) {
          if (char === '\r' || char === '\n') return settle(resolve, input);
          if (char === '\u0003') return settle(reject, new CliError('Cancelled.'));
          if (char === '\u007f' || char === '\b') input = [...input].slice(0, -1).join('');
          else if (char >= ' ') input += char;
        }
      } catch (err) {
        settle(reject, err);
      }
    };
    const onEnd = () => settle(reject, new CliError('Input closed before the password was entered.'));
    const onError = (err) => settle(reject, err);

    try {
      stdout.write(prompt);
      stdin.setEncoding('utf8');
      stdin.setRawMode(true);
      stdin.on('data', onData);
      stdin.on('end', onEnd);
      stdin.on('error', onError);
      stdin.resume();
    } catch (err) {
      settle(reject, err);
    }
  });
}

// يُظهر رمز الخطأ فقط إن طابق شكلاً آمناً صارماً (رمز PostgreSQL من 5 خانات أو رمز نظام مثل ECONNREFUSED)
function safeCode(err) {
  return typeof err?.code === 'string' && /^(?:[0-9A-Z]{5}|E[A-Z]{2,20})$/.test(err.code) ? err.code : null;
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CliError('This command is interactive only: run it in a terminal (the password is typed at a hidden prompt).');
  }

  const emailResult = checkEmail(process.argv[2] ?? process.env.ADMIN_EMAIL ?? '');
  if (emailResult.error) {
    throw new CliError('Provide a valid administrator email as the first argument or in ADMIN_EMAIL.');
  }
  const email = emailResult.value;

  const dbConfig = loadDbConfig();
  const db = createDb(dbConfig);
  try {
    console.log(`Target database: ${dbConfig.database}`);
    console.log(`Administrator email: ${email}`);

    // فحص مبكر قبل طلب كلمة المرور؛ يُعاد الفحص داخل createAdminAccount والفهرس الفريد هو الحارس الأخير
    if (await adminExists(db)) {
      throw new AdminSetupError('ADMIN_EXISTS', 'An administrator account already exists. Nothing was changed.');
    }

    const password = await readHidden(`Password (at least ${ADMIN_PASSWORD_MIN} characters): `);
    const passwordCheck = checkAdminPassword(password);
    if (passwordCheck.error) throw new CliError(passwordCheck.error);
    const confirmation = await readHidden('Confirm password: ');
    if (confirmation !== password) throw new CliError('The passwords do not match. Nothing was changed.');

    const { userId } = await createAdminAccount(db, { email, password });
    console.log(`Administrator account created (user_id ${userId}).`);
  } finally {
    await db.close().catch(() => {});
  }
}

main().catch((err) => {
  if (err instanceof CliError || err instanceof AdminSetupError) {
    console.error(`Error: ${err.message}`);
  } else {
    const code = safeCode(err);
    console.error(`Error: unexpected failure${code ? ` (${code})` : ''}. Nothing was changed.`);
  }
  process.exit(1);
});
