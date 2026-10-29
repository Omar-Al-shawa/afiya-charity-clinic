-- حارس التشغيل: يمنع تنفيذ أي سكربت يغيّر المخطط على غير afiyah_test.
-- المتطلبات: -v expect_db=afiyah_test، والاتصال بقاعدة afiyah_test، والمستخدم omarsh (مالك القاعدة).
-- عند فشل أي شرط يُنهى اتصال psql قبل أي تعليمة لاحقة، حتى لو نُسي ON_ERROR_STOP أو -1 في الأمر:
-- فشل \connect في سكربت غير تفاعلي يُنهي الجلسة، فلا يصل أي SQL بعد الحارس إلى أي قاعدة.
-- يجب أن يسبق \connect أمر RAISE في كل فرع، لأن \set ON_ERROR_STOP on لا يوقف إلا ملف الحارس نفسه ثم يتابع السكربت الأب.
-- (التشغيل المعتمد يبقى: psql -X -v ON_ERROR_STOP=1 -1 -v expect_db=afiyah_test -d afiyah_test -f ...)
\set ON_ERROR_STOP on

\if :{?expect_db}
\else
  \echo 'GUARD FAILED: pass -v expect_db=afiyah_test'
  \connect -reuse-previous=off guard_abort_no_such_database
  DO $g$ BEGIN RAISE EXCEPTION 'guard: -v expect_db is required'; END $g$;
\endif

SELECT current_database() = :'expect_db' AND current_database() = 'afiyah_test' AS guard_db_ok,
       current_user = 'omarsh' AND session_user = 'omarsh'
         AND (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) = 'omarsh' AS guard_user_ok
\gset

\if :guard_db_ok
\else
  \echo 'GUARD FAILED: the connected database must be exactly afiyah_test and match -v expect_db'
  \connect -reuse-previous=off guard_abort_no_such_database
  DO $g$ BEGIN RAISE EXCEPTION 'guard: wrong database'; END $g$;
\endif

\if :guard_user_ok
\else
  \echo 'GUARD FAILED: the executing user must be omarsh, the database owner'
  \connect -reuse-previous=off guard_abort_no_such_database
  DO $g$ BEGIN RAISE EXCEPTION 'guard: wrong user'; END $g$;
\endif

\echo 'guard ok: afiyah_test as omarsh'
