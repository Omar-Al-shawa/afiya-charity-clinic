import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createDb } from './db/pool.js';
import { runDuePendingChanges } from './db/pendingChanges.js';
import { createApp } from './app.js';
import { createMailer } from './services/mailer.js';

async function main() {
  const config = loadConfig();
  const db = createDb(config.db);

  try {
    // الترتيب: اتصال القاعدة ثم التغييرات المستحقة (تعافٍ بعد توقف يوم السريان) ثم الاستماع
    await db.ping();
    const processed = await runDuePendingChanges(db);
    console.log(`[startup] database ok; due pending changes processed: ${processed.length}`);
  } catch (err) {
    console.error('[startup] failed:', err?.code || '', err?.message);
    await db.close().catch(() => {});
    process.exit(1);
  }

  // بلا إعداد SMTP يكون mailer فارغاً ويردّ مسار التواصل 503
  const mailer = createMailer(config.smtp);
  console.log(`[startup] contact form email: ${mailer ? 'configured' : 'not configured'}`);

  // التغييرات المستحقة تُنفَّذ أيضاً قبل الطلبات المعتمدة عليها، فلا يلزم إعادة تشغيل الخادم يوم السريان
  const processDueChanges = () => runDuePendingChanges(db);
  // بناء الواجهة (npm run build في جذر المشروع) يُقدَّم من الخادم نفسه؛ غيابه يعني API فقط (التطوير المحلي)
  const frontendDir = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
  const server = createApp({ db, config, mailer, processDueChanges, frontendDir }).listen(config.port, () => {
    console.log(`[startup] listening on port ${config.port}`);
  });

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[shutdown] ${signal}`);
    setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[startup] failed:', err?.message);
  process.exit(1);
});
