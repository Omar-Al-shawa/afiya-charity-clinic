import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { createApiRouter } from './routes/index.js';
import { loadFrontend, serveFrontend } from './frontend.js';
import { createOriginGuard } from './middleware/originGuard.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// مصنع التطبيق: قاعدة البيانات والإعدادات والساعة تُحقن حتى تُختبر المسارات دون اتصال حقيقي
// processDueChanges: تنفيذ التغييرات المعلّقة المستحقة قبل المسارات المعتمدة عليها (server.js يمرّر المنفِّذ الحقيقي)
// frontendDir: مجلد بناء الواجهة؛ إن وُجد فيه index.html تُقدَّم الواجهة من الأصل نفسه (الإنتاج)، وإلا يعمل API وحده (التطوير والاختبار)
export function createApp({ db, config, clock = () => new Date(), mailer = null, processDueChanges = null, frontendDir = null }) {
  const app = express();
  app.disable('x-powered-by');
  // خلف بروكسي الاستضافة: لازم لعنوان IP الحقيقي في تحديد المعدّل؛ يبقى معطّلاً محلياً
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  const frontend = frontendDir ? loadFrontend(frontendDir) : null;
  // الاستثناء الوحيد في CSP: بصمة سكربت المظهر المضمّن في index.html (لا 'unsafe-inline')
  app.use(
    helmet(
      frontend
        ? {
            contentSecurityPolicy: {
              directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                'script-src': ["'self'", ...frontend.scriptHashes],
              },
            },
          }
        : undefined,
    ),
  );
  app.use(cookieParser());
  app.use('/api', createOriginGuard({ allowedOrigins: config.allowedOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter({ db, config, clock, mailer, processDueChanges }));
  if (frontend) serveFrontend(app, frontend);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
