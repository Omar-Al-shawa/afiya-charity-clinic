import { Router } from 'express';

export function createHealthRouter(db) {
  const router = Router();

  // فحص الاتصال بقاعدة البيانات فقط؛ لا يعالج التغييرات المعلّقة ولا يكشف تفاصيل الخطأ
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await db.ping();
      res.json({ status: 'ok', db: 'up' });
    } catch (err) {
      console.error('[health] database ping failed:', err?.code || err?.message);
      res.status(503).json({ status: 'error', db: 'down' });
    }
  });

  return router;
}
