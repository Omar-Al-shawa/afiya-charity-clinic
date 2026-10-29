import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { createApiRouter } from './routes/index.js';
import { createOriginGuard } from './middleware/originGuard.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// مصنع التطبيق: قاعدة البيانات والإعدادات والساعة تُحقن حتى تُختبر المسارات دون اتصال حقيقي
// processDueChanges: تنفيذ التغييرات المعلّقة المستحقة قبل المسارات المعتمدة عليها (server.js يمرّر المنفِّذ الحقيقي)
export function createApp({ db, config, clock = () => new Date(), mailer = null, processDueChanges = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.use('/api', createOriginGuard({ allowedOrigins: config.allowedOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter({ db, config, clock, mailer, processDueChanges }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
