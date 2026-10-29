// التغييرات الإدارية المستحقة تُنفَّذ فقط عبر public.execute_due_pending_change() (بالوقت الحقيقي في القاعدة).
// لا يُستدعى execute_next_pending_change ولا يُمرَّر وقت اصطناعي.
const MAX_ITERATIONS = 1000;

// تكرار الاستدعاء حتى تعيد الدالة NULL؛ كل استدعاء معاملة مستقلة (READ COMMITTED) فيُثبَّت كل طلب منفرداً.
// تعيد معرّفات الطلبات التي عولجت. تُستدعى عند الإقلاع وقبل العمليات المعتمدة على التغييرات المعلّقة.
export async function runDuePendingChanges(db, { maxIterations = MAX_ITERATIONS } = {}) {
  const processed = [];
  for (let i = 0; i < maxIterations; i += 1) {
    const changeId = await db.withTransaction(async (client) => {
      const { rows } = await client.query('SELECT public.execute_due_pending_change() AS change_id');
      return rows[0].change_id;
    });
    if (changeId === null) return processed;
    processed.push(changeId);
  }
  throw new Error(`Pending change processing did not finish after ${maxIterations} iterations`);
}
