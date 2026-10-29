import pg from 'pg';

const { Pool, types } = pg;

// DATE وTIME نصّان (YYYY-MM-DD وHH:mm:ss) كما تتعامل معهما الواجهة؛ تحويلهما إلى Date محلي يزيح الأيام.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1083, (value) => value);

export function createDb(dbConfig) {
  const pool = new Pool({
    ...dbConfig,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  // خطأ على اتصال خامل لا يجب أن يُسقط العملية
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.code || err.message);
  });

  const query = (text, params) => pool.query(text, params);

  // كل معاملة READ COMMITTED صراحةً: الحجز والتغييرات المعلّقة ترفض غير ذلك (AF113)
  async function withTransaction(fn) {
    const client = await pool.connect();
    let failure;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      failure = err;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        failure = rollbackErr; // يُتلف الاتصال بدل إعادته إلى المجمّع
      }
      throw err;
    } finally {
      client.release(failure);
    }
  }

  async function ping() {
    await pool.query('SELECT 1');
  }

  return { query, withTransaction, ping, close: () => pool.end() };
}
