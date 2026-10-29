-- اختبارات المرحلة 1B-2b (الجزء 2): الفهارس الستة المعتمدة في 003_indexes.sql (afiyah_test فقط). تُشغَّل بعد تطبيق 003_indexes.sql.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f t2b_indexes.sql
-- لا يُستعمل الخيار -1: الملف يدير BEGIN و ROLLBACK بنفسه (كما في t2b_functions.sql).
--
-- *** تحذير: صالح لحالة المخطط في نهاية 1B-2b فقط (فهارس بلا مشغّلات). لا يجوز تشغيله بعد تثبيت مشغّلات المرحلة 1B-2c. ***
-- *** DO NOT RUN THIS FILE AFTER THE STAGE 1B-2C TRIGGERS ARE INSTALLED. ***
-- يرفض الملف التشغيل (في كتلة الشروط المسبقة) إذا وُجد أي مشغّل تطبيقي (غير داخلي) على جداول public.
--
-- *** مجموعة LIM: تثبيتات قيود مؤقتة (LIMITATION PINS) وليست سلوكاً تجارياً معتمداً. ***
-- الفهرسان الفريدان للحجوزات يمنعان تطابق وقت البداية تماماً فقط، فتُقبل اليوم حجوزات متداخلة ببدايات مختلفة
-- (طبيب بموعدين 10:00 و 10:10 مدتهما 20 دقيقة، أو مريض بموعدين متداخلين عند طبيبين). هذا قبول مؤقت بسبب غياب مشغّلات 1B-2c،
-- وستحوّله 1B-2c إلى رفض بالرمزين AF107 (طبيب) و AF108 (مريض). عندئذٍ تُحذف حالات LIM أو تُقلَب إلى حالات رفض في ملف اختبارات 1B-2c.
--
-- بنية كل حالة: (id, prep, stmt, chk, expect)
--   prep  تحضير يجب أن ينجح بالكامل؛ أي فشل فيه يُحتسب فشلاً للحالة مهما كان رمزه، ولا يُعدّ أبداً فشلاً متوقعاً لـ stmt.
--   stmt  التعليمة المختبَرة (تعليمة واحدة فقط؛ يتحقق الاختبار من ذلك)، أو NULL في حالات الكتالوج.
--   chk   استعلام منطقي يثبت الحالة الناتجة؛ إلزامي لكل حالة OK، ويُعدّ NULL فشلاً؛ ويجب أن يكون NULL في حالات الفشل المتوقع.
--   expect  OK، أو SQLSTATE، أو SQLSTATE:اسم1|اسم2 (اسم القيد أو الفهرس كما يعيده CONSTRAINT_NAME).
-- كل حالة تُنفَّذ داخل معاملة فرعية (كتلة EXCEPTION) تُتراجع دائماً، حتى الحالات الناجحة، بإطلاق استثناء ختامي AF999.
-- مراحل الحالة: prep ثم stmt ثم chk ثم end. يُقبل الفشل المتوقع فقط إذا وقع في المرحلة stmt بالرمز والاسم المتوقعين.
-- فشل chk يطلق AF998 (لا يطابق أي توقّع)، وفشل prep يُسجَّل بمرحلته فلا يطابق أي توقّع.
-- المعرّفات صريحة (OVERRIDING SYSTEM VALUE) فلا تُستهلك قيم الهوية، ولا يُستعمل أي استدعاء لدوال التسلسلات.
-- بيانات التجهيز 8xxx؛ الصفوف الإضافية داخل الحالات 8101 فما فوق. لا حاجة إلى 002_functions.sql؛ إن وُجد قيد القائمة البيضاء فالبيانات تحترمه.
--
-- ملاحظات على تعارض صفين مع فهرسين: لا يضمن PostgreSQL أيّ الفهرسين يُبلّغ أولاً، فتقبل حالة DS02 الاسمين.
-- حالات ON CONFLICT (مجموعة OC): الفهرس الجزئي لا يُسمّى في ON CONFLICT ON CONSTRAINT، ويلزم تكرار شرط الفهرس في WHERE.
--   42P10 = لا قيد فريد أو استثناء مطابق لمواصفات ON CONFLICT (invalid_column_reference)، و 42704 = القيد المسمّى غير موجود (undefined_object).
--   النتيجتان مستنتجتان من سلوك PostgreSQL الموثّق لا من تشغيل هنا؛ فإن اختلف رمز عند أول تشغيل يُرفع للمراجعة ولا يُعدَّل الاختبار بصمت.
\ir ../_guard.sql

BEGIN;

DO $pre$
BEGIN
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND c.relname IN ('users', 'patients', 'doctors', 'specialties', 'appointments', 'pending_changes')) <> 6 THEN
        RAISE EXCEPTION 'precondition failed: the six tables do not exist';
    END IF;
    IF (SELECT count(*) FROM pg_index i
          JOIN pg_class ic ON ic.oid = i.indexrelid
          JOIN pg_class tc ON tc.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = ic.relnamespace
         WHERE n.nspname = 'public'
           AND (ic.relname::text, tc.relname::text) IN (VALUES
               ('users_one_admin', 'users'),
               ('appointments_doctor_slot_uq', 'appointments'),
               ('appointments_patient_slot_uq', 'appointments'),
               ('pending_changes_one_per_doctor', 'pending_changes'),
               ('pending_changes_one_per_specialty', 'pending_changes'),
               ('doctors_specialty_id_idx', 'doctors'))) <> 6 THEN
        RAISE EXCEPTION 'precondition failed: the six indexes of 003_indexes.sql do not exist (apply 003_indexes.sql first)';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger t
                 JOIN pg_class c ON c.oid = t.tgrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND NOT t.tgisinternal) THEN
        RAISE EXCEPTION 'precondition failed: application triggers exist (Stage 1B-2c installed); this file is valid only before Stage 1B-2c';
    END IF;
    IF (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.doctors)
       + (SELECT count(*) FROM public.specialties) + (SELECT count(*) FROM public.appointments)
       + (SELECT count(*) FROM public.pending_changes) > 0 THEN
        RAISE EXCEPTION 'precondition failed: tables must be empty (fixtures use fixed ids)';
    END IF;
    IF (SELECT count(*) FROM pg_sequences WHERE schemaname = 'public') <> 6 THEN
        RAISE EXCEPTION 'precondition failed: expected exactly six identity sequences';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL) THEN
        RAISE EXCEPTION 'precondition failed: identity sequences are already in use';
    END IF;
END $pre$;

DO $t$
DECLARE
    -- بادئات إدراج ثابتة (كل إدراج بمعرّف صريح)
    c_us  constant text := 'INSERT INTO public.users (user_id, email, password_hash, role, is_active) OVERRIDING SYSTEM VALUE VALUES ';
    c_ap  constant text := 'INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time, status) OVERRIDING SYSTEM VALUE VALUES ';
    c_pc  constant text := 'INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES ';
    -- مقدمة استعلام الكتالوج لفهرس واحد بالاسم (تُكمَل باسم الفهرس ثم الشرط)
    c_cat constant text := $q$WITH x AS (
        SELECT i.*, tc.relname::text AS tbl, am.amname::text AS amn, pg_get_expr(i.indpred, i.indrelid) AS pred,
               (SELECT array_agg(pg_get_indexdef(i.indexrelid, k.n, true) ORDER BY k.n) FROM generate_series(1, i.indnatts::int) AS k(n)) AS cols,
               EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid) AS has_con
          FROM pg_index i
          JOIN pg_class ic ON ic.oid = i.indexrelid
          JOIN pg_class tc ON tc.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = tc.relnamespace
          JOIN pg_am am ON am.oid = ic.relam
         WHERE n.nspname = 'public' AND ic.relname = $q$;
    -- بصمة محتوى الجداول الستة كاملة (لإثبات ألا أثر لأي حالة)
    c_fp  constant text := $q$md5(concat_ws('|',
        (SELECT string_agg(x::text, ',' ORDER BY x.user_id) FROM public.users x),
        (SELECT string_agg(x::text, ',' ORDER BY x.specialty_id) FROM public.specialties x),
        (SELECT string_agg(x::text, ',' ORDER BY x.patient_id) FROM public.patients x),
        (SELECT string_agg(x::text, ',' ORDER BY x.doctor_id) FROM public.doctors x),
        (SELECT string_agg(x::text, ',' ORDER BY x.appointment_id) FROM public.appointments x),
        (SELECT string_agg(x::text, ',' ORDER BY x.change_id) FROM public.pending_changes x)))$q$;
    r        record;
    g        record;
    v_stage  text;
    v_state  text;
    v_con    text;
    v_col    text;
    v_msg    text;
    v_obj    text;
    v_harn   text;
    v_bool   boolean;
    v_ok     boolean;
    v_grp    text;
    v_fp0    text;
    v_n      jsonb := '{}';
    v_p      jsonb := '{}';
    v_total  int := 0;
    v_fail   int := 0;
BEGIN
    RAISE NOTICE 'Stage 1B-2b index tests: the LIM cases pin TEMPORARY limitations (overlapping starts are accepted before Stage 1B-2c triggers); they are not approved business behavior.';

    -- بيانات التجهيز: 8 مستخدمين (3 مرضى و5 أطباء، لكلٍّ حساب مستقل)، 3 اختصاصات، 3 مرضى، 5 أطباء، 3 حجوزات، 8 طلبات معلّقة.
    -- الاختصاصات: S1 8001 (20 د) S2 8002 (30 د) S3 8003 (25 د). الأطباء: D1 8001 و D4 8004 في S1؛ D2 8002 و D3 8003 في S2؛ D5 8005 في S3.
    -- المرضى: P1 8001 P2 8002 P3 8003. لا مدير في التجهيز. التواريخ كلها من الاثنين إلى الخميس (لا جمعة): 2 و3 و4 و5 تشرين الثاني 2026.
    INSERT INTO public.users (user_id, email, password_hash, role, is_active) OVERRIDING SYSTEM VALUE VALUES
        (8101, 'p1@t2bi.local', 'h', 'patient', true),
        (8102, 'p2@t2bi.local', 'h', 'patient', true),
        (8103, 'p3@t2bi.local', 'h', 'patient', true),
        (8201, 'd1@t2bi.local', 'h', 'doctor', true),
        (8202, 'd2@t2bi.local', 'h', 'doctor', true),
        (8203, 'd3@t2bi.local', 'h', 'doctor', true),
        (8204, 'd4@t2bi.local', 'h', 'doctor', true),
        (8205, 'd5@t2bi.local', 'h', 'doctor', true);
    INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES
        (8001, 't2bi-s1', 20), (8002, 't2bi-s2', 30), (8003, 't2bi-s3', 25);
    INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, address, gender, blood_type) OVERRIDING SYSTEM VALUE VALUES
        (8001, 8101, 'P', 'One',   '0911111111', '1990-01-01', NULL, 'male', NULL),
        (8002, 8102, 'P', 'Two',   '0911111112', '1990-01-02', NULL, 'female', NULL),
        (8003, 8103, 'P', 'Three', '0911111113', '1990-01-03', NULL, 'male', NULL);
    INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone, image_url, biography, years_of_experience) OVERRIDING SYSTEM VALUE VALUES
        (8001, 8201, 8001, 'D', 'One',   '1980-01-01', '0922222221', NULL, NULL, NULL),
        (8002, 8202, 8002, 'D', 'Two',   '1980-01-02', '0922222222', NULL, NULL, NULL),
        (8003, 8203, 8002, 'D', 'Three', '1980-01-03', '0922222223', NULL, NULL, NULL),
        (8004, 8204, 8001, 'D', 'Four',  '1980-01-04', '0922222224', NULL, NULL, NULL),
        (8005, 8205, 8003, 'D', 'Five',  '1980-01-05', '0922222225', NULL, NULL, NULL);
    -- A8001 محجوز (P1 عند D1 يوم 2 ت2 الساعة 10:00)؛ A8002 ملغى على فتحة D1 يوم 3 الساعة 10:00 (للمريض P2)؛ A8003 ملغى للمريض P1 عند D2 يوم 4 الساعة 10:00
    INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time, status) OVERRIDING SYSTEM VALUE VALUES
        (8001, 8001, 8001, '2026-11-02', '10:00', 'booked'),
        (8002, 8002, 8001, '2026-11-03', '10:00', 'cancelled'),
        (8003, 8001, 8002, '2026-11-04', '10:00', 'cancelled');
    -- طلبات معلّقة: معلّق واحد لـ D1 وواحد لـ S1؛ وصفوف منفَّذ وملغى وفاشل لـ D2 ولـ S2 (لا تقيّد شيئاً). كل زوج created_at/execute_at يطابق صيغة القيد.
    INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES
        (8001, 8001, NULL, 'update', '{"phone":"0933333331"}',              'pending',   NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (8002, NULL, 8001, 'update', '{"specialty_name":"t2bi-renamed"}',   'pending',   NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (8003, 8002, NULL, 'update', '{"phone":"0933333332"}',              'executed',  NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (8004, 8002, NULL, 'update', '{"phone":"0933333333"}',              'cancelled', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (8005, 8002, NULL, 'update', '{"phone":"0933333334"}',              'failed',    'x',  '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (8006, NULL, 8002, 'update', '{"appointment_duration":35}',         'executed',  NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (8007, NULL, 8002, 'update', '{"appointment_duration":36}',         'cancelled', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (8008, NULL, 8002, 'update', '{"appointment_duration":37}',         'failed',    'x',  '2026-10-01 10:30+03', '2026-10-15 00:00+03');

    EXECUTE 'SELECT ' || c_fp INTO v_fp0;

    FOR r IN
        SELECT * FROM (VALUES
        -- ===== AD: users_one_admin (مدير واحد على الأكثر، النشط وغير النشط) =====
        ('AD01 an admin can be added next to patients and doctors', NULL,
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true)$q$,
            $c$SELECT (SELECT count(*) FROM public.users WHERE role = 'admin') = 1 AND (SELECT count(*) FROM public.users) = 9 AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 8301 AND role = 'admin')$c$, 'OK'),
        ('AD02 a second active admin is rejected',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true)$q$,
            c_us || $q$(8302, 'a2@t2bi.local', 'h', 'admin', true)$q$, NULL, '23505:users_one_admin'),
        ('AD03 an inactive first admin still blocks an active second admin',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', false)$q$,
            c_us || $q$(8302, 'a2@t2bi.local', 'h', 'admin', true)$q$, NULL, '23505:users_one_admin'),
        ('AD04 an inactive second admin is rejected too',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true)$q$,
            c_us || $q$(8302, 'a2@t2bi.local', 'h', 'admin', false)$q$, NULL, '23505:users_one_admin'),
        ('AD05 two inactive admins are rejected',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', false)$q$,
            c_us || $q$(8302, 'a2@t2bi.local', 'h', 'admin', false)$q$, NULL, '23505:users_one_admin'),
        ('AD06 promoting a patient user to admin is rejected while an admin exists',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true)$q$,
            $q$UPDATE public.users SET role = 'admin' WHERE user_id = 8101$q$, NULL, '23505:users_one_admin'),
        ('AD07 promoting a doctor user to admin is rejected while an admin exists',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true)$q$,
            $q$UPDATE public.users SET role = 'admin' WHERE user_id = 8201$q$, NULL, '23505:users_one_admin'),
        ('AD08 after the admin is deleted a new admin is accepted',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true); DELETE FROM public.users WHERE user_id = 8301$q$,
            c_us || $q$(8302, 'a2@t2bi.local', 'h', 'admin', true)$q$,
            $c$SELECT (SELECT count(*) FROM public.users WHERE role = 'admin') = 1 AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 8302 AND role = 'admin') AND NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = 8301)$c$, 'OK'),
        ('AD09 after the admin is demoted a new admin is accepted',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true); UPDATE public.users SET role = 'patient' WHERE user_id = 8301$q$,
            c_us || $q$(8302, 'a2@t2bi.local', 'h', 'admin', true)$q$,
            $c$SELECT (SELECT count(*) FROM public.users WHERE role = 'admin') = 1 AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 8302 AND role = 'admin') AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 8301 AND role = 'patient')$c$, 'OK'),
        ('AD10 deactivating the only admin is accepted and keeps counting as the admin',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true)$q$,
            $q$UPDATE public.users SET is_active = false WHERE user_id = 8301$q$,
            $c$SELECT (SELECT count(*) FROM public.users WHERE role = 'admin') = 1 AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 8301 AND role = 'admin' AND NOT is_active)$c$, 'OK'),
        ('AD11 updating the admin row itself does not conflict with itself',
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true)$q$,
            $q$UPDATE public.users SET password_hash = 'h2' WHERE user_id = 8301$q$,
            $c$SELECT (SELECT count(*) FROM public.users WHERE role = 'admin') = 1 AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 8301 AND role = 'admin' AND password_hash = 'h2')$c$, 'OK'),
        ('AD12 many more patient and doctor users are unaffected', NULL,
            c_us || $q$(8311, 'x1@t2bi.local', 'h', 'patient', true), (8312, 'x2@t2bi.local', 'h', 'doctor', true), (8313, 'x3@t2bi.local', 'h', 'doctor', false)$q$,
            $c$SELECT (SELECT count(*) FROM public.users) = 11 AND (SELECT count(*) FROM public.users WHERE role = 'admin') = 0 AND (SELECT count(*) FROM public.users WHERE role = 'doctor' AND NOT is_active) = 1$c$, 'OK'),
        ('AD13 two admins inserted by one statement are rejected', NULL,
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true), (8302, 'a2@t2bi.local', 'h', 'admin', true)$q$, NULL, '23505:users_one_admin'),
        ('AD14 a lone inactive admin is accepted', NULL,
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', false)$q$,
            $c$SELECT (SELECT count(*) FROM public.users WHERE role = 'admin') = 1 AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 8301 AND role = 'admin' AND NOT is_active)$c$, 'OK'),

        -- ===== DS: appointments_doctor_slot_uq (حجز قائم واحد لكل طبيب ويوم ووقت بداية) =====
        ('DS01 same doctor, date and time for another patient is rejected', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:00', 'booked')$q$, NULL, '23505:appointments_doctor_slot_uq'),
        ('DS02 same doctor and same patient at the same slot violates both indexes (either name accepted)', NULL,
            c_ap || $q$(8101, 8001, 8001, '2026-11-02', '10:00', 'booked')$q$, NULL, '23505:appointments_doctor_slot_uq|appointments_patient_slot_uq'),
        ('DS03 same doctor and date at another start time is accepted', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:20', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-02' AND status = 'booked') = 2 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND status = 'booked')$c$, 'OK'),
        ('DS04 same doctor and time on another date is accepted', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-05', '10:00', 'booked')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND doctor_id = 8001 AND appointment_date = '2026-11-05' AND appointment_time = '10:00' AND status = 'booked')$c$, 'OK'),
        ('DS05 another doctor at the same date and time is accepted', NULL,
            c_ap || $q$(8101, 8002, 8004, '2026-11-02', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE appointment_date = '2026-11-02' AND appointment_time = '10:00' AND status = 'booked') = 2$c$, 'OK'),
        ('DS06 a slot held only by a cancelled appointment can be booked again', NULL,
            c_ap || $q$(8101, 8003, 8001, '2026-11-03', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-03' AND appointment_time = '10:00' AND status = 'booked') = 1 AND (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-03' AND appointment_time = '10:00' AND status = 'cancelled') = 1$c$, 'OK'),
        ('DS07 a cancelled row may duplicate a booked slot', NULL,
            c_ap || $q$(8101, 8003, 8001, '2026-11-02', '10:00', 'cancelled')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-02' AND appointment_time = '10:00') = 2 AND (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-02' AND appointment_time = '10:00' AND status = 'booked') = 1$c$, 'OK'),
        ('DS08 two cancelled rows may share one slot', NULL,
            c_ap || $q$(8101, 8003, 8001, '2026-11-03', '10:00', 'cancelled')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-03' AND appointment_time = '10:00' AND status = 'cancelled') = 2 AND (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-03' AND appointment_time = '10:00' AND status = 'booked') = 0$c$, 'OK'),
        ('DS09 re-booking a cancelled row onto a slot taken by another patient is rejected',
            c_ap || $q$(8101, 8003, 8001, '2026-11-03', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET status = 'booked' WHERE appointment_id = 8002$q$, NULL, '23505:appointments_doctor_slot_uq'),
        ('DS10 moving a booked row onto a taken start time is rejected',
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:20', 'booked')$q$,
            $q$UPDATE public.appointments SET appointment_time = '10:00' WHERE appointment_id = 8101$q$, NULL, '23505:appointments_doctor_slot_uq'),
        ('DS11 after the booking is cancelled the slot can be booked again',
            $q$UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 8001$q$,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-02' AND appointment_time = '10:00' AND status = 'booked') = 1 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND status = 'booked') AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8001 AND status = 'cancelled')$c$, 'OK'),
        ('DS12 two identical doctor slots in one statement are rejected', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-05', '09:00', 'booked'), (8102, 8003, 8001, '2026-11-05', '09:00', 'booked')$q$, NULL, '23505:appointments_doctor_slot_uq'),
        ('DS13 cancelling a booked appointment is accepted', NULL,
            $q$UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 8001$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8001 AND status = 'cancelled') AND NOT EXISTS (SELECT 1 FROM public.appointments WHERE status = 'booked')$c$, 'OK'),

        -- ===== PS: appointments_patient_slot_uq (حجز قائم واحد لكل مريض ويوم ووقت بداية عند أي طبيب) =====
        ('PS01 same patient, date and time with another doctor of the same specialty is rejected', NULL,
            c_ap || $q$(8101, 8001, 8004, '2026-11-02', '10:00', 'booked')$q$, NULL, '23505:appointments_patient_slot_uq'),
        ('PS02 same patient, date and time with a doctor of another specialty (other duration) is rejected', NULL,
            c_ap || $q$(8101, 8001, 8002, '2026-11-02', '10:00', 'booked')$q$, NULL, '23505:appointments_patient_slot_uq'),
        ('PS03 same patient and date at another start time is accepted', NULL,
            c_ap || $q$(8101, 8001, 8004, '2026-11-02', '10:30', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE patient_id = 8001 AND appointment_date = '2026-11-02' AND status = 'booked') = 2 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND status = 'booked')$c$, 'OK'),
        ('PS04 same patient and time on another date is accepted', NULL,
            c_ap || $q$(8101, 8001, 8004, '2026-11-05', '10:00', 'booked')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND patient_id = 8001 AND appointment_date = '2026-11-05' AND appointment_time = '10:00' AND status = 'booked')$c$, 'OK'),
        ('PS05 another patient at the same time with another doctor is accepted', NULL,
            c_ap || $q$(8101, 8002, 8004, '2026-11-02', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE appointment_date = '2026-11-02' AND appointment_time = '10:00' AND status = 'booked') = 2$c$, 'OK'),
        ('PS06 a slot held only by a cancelled patient booking can be booked again', NULL,
            c_ap || $q$(8101, 8001, 8001, '2026-11-04', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE patient_id = 8001 AND appointment_date = '2026-11-04' AND appointment_time = '10:00' AND status = 'booked') = 1 AND (SELECT count(*) FROM public.appointments WHERE patient_id = 8001 AND appointment_date = '2026-11-04' AND appointment_time = '10:00' AND status = 'cancelled') = 1$c$, 'OK'),
        ('PS07 re-booking a cancelled row onto the patient own taken slot is rejected',
            c_ap || $q$(8101, 8001, 8001, '2026-11-04', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET status = 'booked' WHERE appointment_id = 8003$q$, NULL, '23505:appointments_patient_slot_uq'),
        ('PS08 moving a patient booking onto the patient own taken start time is rejected',
            c_ap || $q$(8101, 8001, 8004, '2026-11-02', '10:30', 'booked')$q$,
            $q$UPDATE public.appointments SET appointment_time = '10:00' WHERE appointment_id = 8101$q$, NULL, '23505:appointments_patient_slot_uq'),
        ('PS09 reassigning a booking to a patient who holds that slot is rejected',
            c_ap || $q$(8101, 8002, 8004, '2026-11-02', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET patient_id = 8001 WHERE appointment_id = 8101$q$, NULL, '23505:appointments_patient_slot_uq'),
        ('PS10 after the booking is cancelled the patient can book the slot with another doctor',
            $q$UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 8001$q$,
            c_ap || $q$(8101, 8001, 8004, '2026-11-02', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE patient_id = 8001 AND appointment_date = '2026-11-02' AND appointment_time = '10:00' AND status = 'booked') = 1 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND doctor_id = 8004 AND status = 'booked')$c$, 'OK'),
        ('PS11 one patient with two doctors at one start time in one statement is rejected', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-05', '09:00', 'booked'), (8102, 8002, 8004, '2026-11-05', '09:00', 'booked')$q$, NULL, '23505:appointments_patient_slot_uq'),

        -- ===== LIM: تثبيتات قيود مؤقتة (TEMPORARY Stage 1B-2b limitation pins, NOT business behavior). تصبح AF107/AF108 في 1B-2c. =====
        ('LIM01 TEMPORARY LIMITATION: same doctor 20 min, starts 10:00 and 10:10 overlap but both rows are inserted (AF107 in 1B-2c)', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:10', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-02' AND status = 'booked' AND appointment_time IN ('10:00', '10:10')) = 2 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8001 AND appointment_time = '10:00' AND status = 'booked') AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND appointment_time = '10:10' AND status = 'booked')$c$, 'OK'),
        ('LIM02 TEMPORARY LIMITATION: same doctor 20 min, 10:19 starts one minute before the 10:00 booking ends but is inserted (AF107 in 1B-2c)', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:19', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 8001 AND appointment_date = '2026-11-02' AND status = 'booked' AND appointment_time IN ('10:00', '10:19')) = 2 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND appointment_time = '10:19' AND status = 'booked')$c$, 'OK'),
        ('LIM03 TEMPORARY LIMITATION: one patient with two doctors at starts 10:00 and 10:10 overlaps but both rows are inserted (AF108 in 1B-2c)', NULL,
            c_ap || $q$(8101, 8001, 8004, '2026-11-02', '10:10', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE patient_id = 8001 AND appointment_date = '2026-11-02' AND status = 'booked' AND appointment_time IN ('10:00', '10:10')) = 2 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND doctor_id = 8004 AND appointment_time = '10:10' AND status = 'booked')$c$, 'OK'),
        ('LIM04 TEMPORARY LIMITATION: one patient, 30 min visit at 10:00 and 20 min visit at 10:20 with doctors of different durations overlap but both rows are inserted (AF108 in 1B-2c)',
            c_ap || $q$(8101, 8002, 8002, '2026-11-05', '10:00', 'booked')$q$,
            c_ap || $q$(8102, 8002, 8001, '2026-11-05', '10:20', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE patient_id = 8002 AND appointment_date = '2026-11-05' AND status = 'booked') = 2 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND doctor_id = 8002 AND appointment_time = '10:00' AND status = 'booked') AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8102 AND doctor_id = 8001 AND appointment_time = '10:20' AND status = 'booked')$c$, 'OK'),

        -- ===== PD: pending_changes_one_per_doctor (طلب معلّق واحد لكل طبيب) =====
        ('PD01 a second pending update for the same doctor is rejected', NULL,
            c_pc || $q$(8101, 8001, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_doctor'),
        ('PD02 a pending delete for a doctor with a pending update is rejected', NULL,
            c_pc || $q$(8101, 8001, NULL, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_doctor'),
        ('PD03 a pending update after a pending delete for the same doctor is rejected',
            c_pc || $q$(8101, 8003, NULL, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            c_pc || $q$(8102, 8003, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_doctor'),
        ('PD04 a pending delete after a pending update for the same doctor is rejected',
            c_pc || $q$(8101, 8004, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            c_pc || $q$(8102, 8004, NULL, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_doctor'),
        ('PD05 executed, cancelled and failed rows do not block a new pending change', NULL,
            c_pc || $q$(8101, 8002, NULL, 'update', '{"phone":"0944444442"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8002 AND status = 'pending') = 1 AND (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8002) = 4$c$, 'OK'),
        ('PD06 after the pending change is cancelled a new pending change is accepted',
            $q$UPDATE public.pending_changes SET status = 'cancelled' WHERE change_id = 8001$q$,
            c_pc || $q$(8101, 8001, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8001 AND status = 'pending') = 1 AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8001 AND status = 'cancelled') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101 AND status = 'pending')$c$, 'OK'),
        ('PD07 after the pending change is executed a new pending change is accepted',
            $q$UPDATE public.pending_changes SET status = 'executed' WHERE change_id = 8001$q$,
            c_pc || $q$(8101, 8001, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8001 AND status = 'pending') = 1 AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8001 AND status = 'executed') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101 AND status = 'pending')$c$, 'OK'),
        ('PD08 after the pending change has failed a new pending change is accepted',
            $q$UPDATE public.pending_changes SET status = 'failed', failure_reason = 'x' WHERE change_id = 8001$q$,
            c_pc || $q$(8101, 8001, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8001 AND status = 'pending') = 1 AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8001 AND status = 'failed') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101 AND status = 'pending')$c$, 'OK'),
        ('PD09 several non-pending rows can coexist with the one pending row of a doctor', NULL,
            c_pc || $q$(8101, 8001, NULL, 'update', '{"phone":"0944444441"}', 'executed', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8102, 8001, NULL, 'update', '{"phone":"0944444442"}', 'cancelled', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8103, 8001, NULL, 'update', '{"phone":"0944444443"}', 'failed', 'x', '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8001) = 4 AND (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8001 AND status = 'pending') = 1$c$, 'OK'),
        ('PD10 turning a cancelled row back to pending is rejected while the doctor has a pending change',
            c_pc || $q$(8101, 8002, NULL, 'update', '{"phone":"0944444442"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $q$UPDATE public.pending_changes SET status = 'pending' WHERE change_id = 8004$q$, NULL, '23505:pending_changes_one_per_doctor'),
        ('PD11 turning a failed row back to pending (reason cleared) is rejected while the doctor has a pending change',
            c_pc || $q$(8101, 8002, NULL, 'update', '{"phone":"0944444442"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $q$UPDATE public.pending_changes SET status = 'pending', failure_reason = NULL WHERE change_id = 8005$q$, NULL, '23505:pending_changes_one_per_doctor'),
        ('PD12 re-targeting a pending change to a doctor that already has one is rejected',
            c_pc || $q$(8101, 8004, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $q$UPDATE public.pending_changes SET doctor_id = 8001 WHERE change_id = 8101$q$, NULL, '23505:pending_changes_one_per_doctor'),
        ('PD13 every doctor can have its own pending change', NULL,
            c_pc || $q$(8101, 8002, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8102, 8003, NULL, 'update', '{"phone":"0944444442"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8103, 8004, NULL, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8104, 8005, NULL, 'update', '{"phone":"0944444444"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id IS NOT NULL AND status = 'pending') = 5 AND (SELECT count(DISTINCT doctor_id) FROM public.pending_changes WHERE doctor_id IS NOT NULL AND status = 'pending') = 5$c$, 'OK'),
        ('PD14 two pending changes for one doctor in one statement are rejected', NULL,
            c_pc || $q$(8101, 8003, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8102, 8003, NULL, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_doctor'),

        -- ===== SP: pending_changes_one_per_specialty (طلب معلّق واحد لكل اختصاص) =====
        ('SP01 a second pending update for the same specialty is rejected', NULL,
            c_pc || $q$(8101, NULL, 8001, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_specialty'),
        ('SP02 a pending delete for a specialty with a pending update is rejected', NULL,
            c_pc || $q$(8101, NULL, 8001, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_specialty'),
        ('SP03 a pending update after a pending delete for the same specialty is rejected',
            c_pc || $q$(8101, NULL, 8003, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            c_pc || $q$(8102, NULL, 8003, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_specialty'),
        ('SP04 a pending delete after a pending update for the same specialty is rejected',
            c_pc || $q$(8101, NULL, 8003, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            c_pc || $q$(8102, NULL, 8003, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_specialty'),
        ('SP05 executed, cancelled and failed rows do not block a new pending change', NULL,
            c_pc || $q$(8101, NULL, 8002, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8002 AND status = 'pending') = 1 AND (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8002) = 4$c$, 'OK'),
        ('SP06 after the pending change is cancelled a new pending change is accepted',
            $q$UPDATE public.pending_changes SET status = 'cancelled' WHERE change_id = 8002$q$,
            c_pc || $q$(8101, NULL, 8001, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8001 AND status = 'pending') = 1 AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8002 AND status = 'cancelled') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101 AND status = 'pending')$c$, 'OK'),
        ('SP07 after the pending change is executed a new pending change is accepted',
            $q$UPDATE public.pending_changes SET status = 'executed' WHERE change_id = 8002$q$,
            c_pc || $q$(8101, NULL, 8001, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8001 AND status = 'pending') = 1 AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8002 AND status = 'executed') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101 AND status = 'pending')$c$, 'OK'),
        ('SP08 after the pending change has failed a new pending change is accepted',
            $q$UPDATE public.pending_changes SET status = 'failed', failure_reason = 'x' WHERE change_id = 8002$q$,
            c_pc || $q$(8101, NULL, 8001, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8001 AND status = 'pending') = 1 AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8002 AND status = 'failed') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101 AND status = 'pending')$c$, 'OK'),
        ('SP09 several non-pending rows can coexist with the one pending row of a specialty', NULL,
            c_pc || $q$(8101, NULL, 8001, 'update', '{"appointment_duration":41}', 'executed', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8102, NULL, 8001, 'update', '{"appointment_duration":42}', 'cancelled', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8103, NULL, 8001, 'update', '{"appointment_duration":43}', 'failed', 'x', '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8001) = 4 AND (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8001 AND status = 'pending') = 1$c$, 'OK'),
        ('SP10 turning a cancelled row back to pending is rejected while the specialty has a pending change',
            c_pc || $q$(8101, NULL, 8002, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $q$UPDATE public.pending_changes SET status = 'pending' WHERE change_id = 8007$q$, NULL, '23505:pending_changes_one_per_specialty'),
        ('SP11 turning a failed row back to pending (reason cleared) is rejected while the specialty has a pending change',
            c_pc || $q$(8101, NULL, 8002, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $q$UPDATE public.pending_changes SET status = 'pending', failure_reason = NULL WHERE change_id = 8008$q$, NULL, '23505:pending_changes_one_per_specialty'),
        ('SP12 re-targeting a pending change to a specialty that already has one is rejected',
            c_pc || $q$(8101, NULL, 8003, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $q$UPDATE public.pending_changes SET specialty_id = 8001 WHERE change_id = 8101$q$, NULL, '23505:pending_changes_one_per_specialty'),
        ('SP13 every specialty can have its own pending change', NULL,
            c_pc || $q$(8101, NULL, 8002, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8102, NULL, 8003, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE specialty_id IS NOT NULL AND status = 'pending') = 3 AND (SELECT count(DISTINCT specialty_id) FROM public.pending_changes WHERE specialty_id IS NOT NULL AND status = 'pending') = 3$c$, 'OK'),
        ('SP14 two pending changes for one specialty in one statement are rejected', NULL,
            c_pc || $q$(8101, NULL, 8003, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8102, NULL, 8003, 'delete', NULL, 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$, NULL, '23505:pending_changes_one_per_specialty'),

        -- ===== IND: استقلال فهرس الطبيب عن فهرس الاختصاص =====
        ('IND01 a second doctor of a specialty with a pending change can also have a pending change', NULL,
            c_pc || $q$(8101, 8004, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id IN (8001, 8004) AND status = 'pending') = 2 AND (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8001 AND status = 'pending') = 1$c$, 'OK'),
        ('IND02 a pending specialty change is accepted after the pending change of its doctor',
            c_pc || $q$(8101, 8005, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            c_pc || $q$(8102, NULL, 8003, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8005 AND status = 'pending') = 1 AND (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8003 AND status = 'pending') = 1$c$, 'OK'),
        ('IND03 a pending doctor change is accepted after the pending change of its specialty',
            c_pc || $q$(8101, NULL, 8003, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            c_pc || $q$(8102, 8005, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8005 AND status = 'pending') = 1 AND (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8003 AND status = 'pending') = 1$c$, 'OK'),
        ('IND04 pending doctor rows (NULL specialty) and pending specialty rows (NULL doctor) never collide with each other', NULL,
            c_pc || $q$(8101, 8002, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8102, 8003, NULL, 'update', '{"phone":"0944444442"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8103, 8004, NULL, 'update', '{"phone":"0944444443"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8104, 8005, NULL, 'update', '{"phone":"0944444444"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8105, NULL, 8002, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'), (8106, NULL, 8003, 'update', '{"appointment_duration":41}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03')$q$,
            $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE status = 'pending') = 8 AND (SELECT count(*) FROM public.pending_changes WHERE status = 'pending' AND doctor_id IS NULL) = 3 AND (SELECT count(*) FROM public.pending_changes WHERE status = 'pending' AND specialty_id IS NULL) = 5$c$, 'OK'),

        -- ===== CAT: خصائص الفهارس في الكتالوج (بلا الاعتماد على صيغة pg_get_expr الدقيقة وبلا اختيار مخطط الاستعلام) =====
        ('CAT01 the standalone (non-primary, non-constraint) indexes of public are exactly the six of 003_indexes.sql', NULL, NULL,
            $c$SELECT coalesce((SELECT array_agg(ic.relname::text ORDER BY ic.relname::text COLLATE "C")
                  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class tc ON tc.oid = i.indrelid JOIN pg_namespace n ON n.oid = tc.relnamespace
                 WHERE n.nspname = 'public' AND NOT i.indisprimary
                   AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid))
                = ARRAY['appointments_doctor_slot_uq', 'appointments_patient_slot_uq', 'doctors_specialty_id_idx', 'pending_changes_one_per_doctor', 'pending_changes_one_per_specialty', 'users_one_admin']::text[], false)$c$, 'OK'),
        ('CAT02 the ten indexes backing PRIMARY KEY or UNIQUE constraints are distinct from the six standalone indexes', NULL, NULL,
            $c$SELECT (SELECT count(DISTINCT c.conindid) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND c.contype IN ('p', 'u')) = 10
               AND (SELECT count(*) FROM pg_class ic JOIN pg_namespace n ON n.oid = ic.relnamespace WHERE n.nspname = 'public' AND ic.relkind = 'i'
                      AND ic.relname IN ('appointments_doctor_slot_uq', 'appointments_patient_slot_uq', 'doctors_specialty_id_idx', 'pending_changes_one_per_doctor', 'pending_changes_one_per_specialty', 'users_one_admin')) = 6
               AND NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class ic ON ic.oid = c.conindid
                                WHERE ic.relname IN ('appointments_doctor_slot_uq', 'appointments_patient_slot_uq', 'doctors_specialty_id_idx', 'pending_changes_one_per_doctor', 'pending_changes_one_per_specialty', 'users_one_admin'))$c$, 'OK'),
        ('CAT03 users_one_admin: unique partial btree on users (role) for admin', NULL, NULL,
            c_cat || $c$'users_one_admin') SELECT count(*) = 1 AND coalesce(bool_and(
                x.tbl = 'users' AND x.amn = 'btree' AND x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
                AND x.indisvalid AND x.indisready AND x.indislive AND NOT x.indnullsnotdistinct AND NOT x.has_con
                AND x.indnatts = 1 AND x.indnkeyatts = 1 AND x.indexprs IS NULL AND x.cols = ARRAY['role']::text[]
                AND x.pred IS NOT NULL AND x.pred ~ '\mrole\M' AND x.pred ~ 'admin'), false) FROM x$c$, 'OK'),
        ('CAT04 appointments_doctor_slot_uq: unique partial btree on (doctor_id, appointment_date, appointment_time) for booked', NULL, NULL,
            c_cat || $c$'appointments_doctor_slot_uq') SELECT count(*) = 1 AND coalesce(bool_and(
                x.tbl = 'appointments' AND x.amn = 'btree' AND x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
                AND x.indisvalid AND x.indisready AND x.indislive AND NOT x.indnullsnotdistinct AND NOT x.has_con
                AND x.indnatts = 3 AND x.indnkeyatts = 3 AND x.indexprs IS NULL AND x.cols = ARRAY['doctor_id', 'appointment_date', 'appointment_time']::text[]
                AND x.pred IS NOT NULL AND x.pred ~ '\mstatus\M' AND x.pred ~ 'booked'), false) FROM x$c$, 'OK'),
        ('CAT05 appointments_patient_slot_uq: unique partial btree on (patient_id, appointment_date, appointment_time) for booked', NULL, NULL,
            c_cat || $c$'appointments_patient_slot_uq') SELECT count(*) = 1 AND coalesce(bool_and(
                x.tbl = 'appointments' AND x.amn = 'btree' AND x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
                AND x.indisvalid AND x.indisready AND x.indislive AND NOT x.indnullsnotdistinct AND NOT x.has_con
                AND x.indnatts = 3 AND x.indnkeyatts = 3 AND x.indexprs IS NULL AND x.cols = ARRAY['patient_id', 'appointment_date', 'appointment_time']::text[]
                AND x.pred IS NOT NULL AND x.pred ~ '\mstatus\M' AND x.pred ~ 'booked'), false) FROM x$c$, 'OK'),
        ('CAT06 pending_changes_one_per_doctor: unique partial btree on (doctor_id) for pending doctor rows', NULL, NULL,
            c_cat || $c$'pending_changes_one_per_doctor') SELECT count(*) = 1 AND coalesce(bool_and(
                x.tbl = 'pending_changes' AND x.amn = 'btree' AND x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
                AND x.indisvalid AND x.indisready AND x.indislive AND NOT x.indnullsnotdistinct AND NOT x.has_con
                AND x.indnatts = 1 AND x.indnkeyatts = 1 AND x.indexprs IS NULL AND x.cols = ARRAY['doctor_id']::text[]
                AND x.pred IS NOT NULL AND x.pred ~ '\mstatus\M' AND x.pred ~ 'pending' AND x.pred ~ '\mdoctor_id\M' AND x.pred ~* 'is not null'
                AND x.pred !~ 'specialty_id'), false) FROM x$c$, 'OK'),
        ('CAT07 pending_changes_one_per_specialty: unique partial btree on (specialty_id) for pending specialty rows', NULL, NULL,
            c_cat || $c$'pending_changes_one_per_specialty') SELECT count(*) = 1 AND coalesce(bool_and(
                x.tbl = 'pending_changes' AND x.amn = 'btree' AND x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
                AND x.indisvalid AND x.indisready AND x.indislive AND NOT x.indnullsnotdistinct AND NOT x.has_con
                AND x.indnatts = 1 AND x.indnkeyatts = 1 AND x.indexprs IS NULL AND x.cols = ARRAY['specialty_id']::text[]
                AND x.pred IS NOT NULL AND x.pred ~ '\mstatus\M' AND x.pred ~ 'pending' AND x.pred ~ '\mspecialty_id\M' AND x.pred ~* 'is not null'
                AND x.pred !~ 'doctor_id'), false) FROM x$c$, 'OK'),
        ('CAT08 doctors_specialty_id_idx: plain non-unique, non-partial btree on doctors (specialty_id) backing no constraint', NULL, NULL,
            c_cat || $c$'doctors_specialty_id_idx') SELECT count(*) = 1 AND coalesce(bool_and(
                x.tbl = 'doctors' AND x.amn = 'btree' AND NOT x.indisunique AND NOT x.indisprimary AND NOT x.indisexclusion
                AND x.indisvalid AND x.indisready AND x.indislive AND NOT x.has_con
                AND x.indnatts = 1 AND x.indnkeyatts = 1 AND x.indexprs IS NULL AND x.indpred IS NULL AND x.pred IS NULL
                AND x.cols = ARRAY['specialty_id']::text[]), false) FROM x$c$, 'OK'),
        ('CAT09 each table has exactly the expected number of indexes (16 in total, no stray index)', NULL, NULL,
            $c$SELECT count(*) = 16
                 AND count(*) FILTER (WHERE t.relname = 'users') = 3
                 AND count(*) FILTER (WHERE t.relname = 'specialties') = 2
                 AND count(*) FILTER (WHERE t.relname = 'patients') = 2
                 AND count(*) FILTER (WHERE t.relname = 'doctors') = 3
                 AND count(*) FILTER (WHERE t.relname = 'appointments') = 3
                 AND count(*) FILTER (WHERE t.relname = 'pending_changes') = 3
                FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
               WHERE n.nspname = 'public'$c$, 'OK'),
        ('CAT10 among standalone indexes exactly five are unique and the only non-unique index in public is doctors_specialty_id_idx', NULL, NULL,
            $c$SELECT (SELECT count(*) FROM pg_index i JOIN pg_class tc ON tc.oid = i.indrelid JOIN pg_namespace n ON n.oid = tc.relnamespace
                        WHERE n.nspname = 'public' AND i.indisunique AND NOT i.indisprimary AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)) = 5
               AND coalesce((SELECT array_agg(ic.relname::text) FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class tc ON tc.oid = i.indrelid JOIN pg_namespace n ON n.oid = tc.relnamespace
                        WHERE n.nspname = 'public' AND NOT i.indisunique) = ARRAY['doctors_specialty_id_idx']::text[], false)$c$, 'OK'),

        -- ===== OC: استنتاج ON CONFLICT مع الفهارس الجزئية (يجب تكرار شرط الفهرس؛ ولا يُسمّى الفهرس في ON CONSTRAINT) =====
        ('OC01 ON CONFLICT with the doctor-slot columns and predicate skips a booked duplicate', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:00', 'booked') ON CONFLICT (doctor_id, appointment_date, appointment_time) WHERE status = 'booked' DO NOTHING$q$,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101) AND (SELECT count(*) FROM public.appointments) = 3 AND (SELECT count(*) FROM public.appointments WHERE status = 'booked') = 1$c$, 'OK'),
        ('OC02 ON CONFLICT with the doctor-slot predicate inserts when only a cancelled row holds the slot', NULL,
            c_ap || $q$(8101, 8003, 8001, '2026-11-03', '10:00', 'booked') ON CONFLICT (doctor_id, appointment_date, appointment_time) WHERE status = 'booked' DO NOTHING$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101 AND status = 'booked') AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8002 AND status = 'cancelled') AND (SELECT count(*) FROM public.appointments) = 4$c$, 'OK'),
        ('OC03 ON CONFLICT with the patient-slot columns and predicate skips a booked duplicate', NULL,
            c_ap || $q$(8101, 8001, 8004, '2026-11-02', '10:00', 'booked') ON CONFLICT (patient_id, appointment_date, appointment_time) WHERE status = 'booked' DO NOTHING$q$,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101) AND (SELECT count(*) FROM public.appointments) = 3$c$, 'OK'),
        ('OC04 ON CONFLICT with the pending-doctor predicate skips a second pending change for a doctor', NULL,
            c_pc || $q$(8101, 8001, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03') ON CONFLICT (doctor_id) WHERE status = 'pending' AND doctor_id IS NOT NULL DO NOTHING$q$,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101) AND (SELECT count(*) FROM public.pending_changes) = 8 AND (SELECT count(*) FROM public.pending_changes WHERE doctor_id = 8001 AND status = 'pending') = 1$c$, 'OK'),
        ('OC05 ON CONFLICT with the pending-specialty predicate skips a second pending change for a specialty', NULL,
            c_pc || $q$(8101, NULL, 8001, 'update', '{"appointment_duration":40}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03') ON CONFLICT (specialty_id) WHERE status = 'pending' AND specialty_id IS NOT NULL DO NOTHING$q$,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101) AND (SELECT count(*) FROM public.pending_changes) = 8 AND (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 8001 AND status = 'pending') = 1$c$, 'OK'),
        ('OC06 ON CONFLICT with the pending-doctor predicate inserts for a doctor holding only non-pending rows', NULL,
            c_pc || $q$(8101, 8002, NULL, 'update', '{"phone":"0944444442"}', 'pending', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03') ON CONFLICT (doctor_id) WHERE status = 'pending' AND doctor_id IS NOT NULL DO NOTHING$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 8101 AND doctor_id = 8002 AND status = 'pending') AND (SELECT count(*) FROM public.pending_changes) = 9$c$, 'OK'),
        ('OC07 ON CONFLICT ON CONSTRAINT cannot name a standalone unique index (not a table constraint)', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:00', 'booked') ON CONFLICT ON CONSTRAINT appointments_doctor_slot_uq DO NOTHING$q$, NULL, '42704'),
        ('OC08 control: ON CONFLICT ON CONSTRAINT works for a real constraint (users_email_key)', NULL,
            c_us || $q$(8301, 'p1@t2bi.local', 'h', 'patient', true) ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING$q$,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = 8301) AND (SELECT count(*) FROM public.users) = 8$c$, 'OK'),
        ('OC09 ON CONFLICT with the doctor-slot columns but without the index predicate has no matching arbiter', NULL,
            c_ap || $q$(8101, 8002, 8004, '2026-11-05', '09:00', 'booked') ON CONFLICT (doctor_id, appointment_date, appointment_time) DO NOTHING$q$, NULL, '42P10'),
        ('OC10 ON CONFLICT (role) without the admin predicate has no matching arbiter', NULL,
            c_us || $q$(8301, 'a1@t2bi.local', 'h', 'admin', true) ON CONFLICT (role) DO NOTHING$q$, NULL, '42P10'),
        ('OC11 ON CONFLICT with a predicate that does not imply the index predicate (cancelled) has no matching arbiter', NULL,
            c_ap || $q$(8101, 8002, 8004, '2026-11-05', '09:00', 'booked') ON CONFLICT (doctor_id, appointment_date, appointment_time) WHERE status = 'cancelled' DO NOTHING$q$, NULL, '42P10'),
        ('OC12 ON CONFLICT DO NOTHING without a conflict target skips a doctor-slot duplicate', NULL,
            c_ap || $q$(8101, 8002, 8001, '2026-11-02', '10:00', 'booked') ON CONFLICT DO NOTHING$q$,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 8101) AND (SELECT count(*) FROM public.appointments) = 3$c$, 'OK'),

        -- ===== X: سلامة التجهيز وعدم بقاء أي أثر (تُنفَّذ في نهاية القائمة، بعد كل الحالات السابقة) =====
        ('X01 fixture integrity: 8 users, 3 patients, 5 doctors with distinct matching user accounts, 3 specialties, 3 appointments, 8 pending changes', NULL, NULL,
            $c$SELECT (SELECT count(*) FROM public.users) = 8
                AND (SELECT count(*) FROM public.users WHERE role = 'patient') = 3
                AND (SELECT count(*) FROM public.users WHERE role = 'doctor') = 5
                AND (SELECT count(*) FROM public.users WHERE role = 'admin') = 0
                AND (SELECT count(*) FROM public.patients) = 3
                AND (SELECT count(*) FROM public.doctors) = 5
                AND (SELECT count(*) FROM public.specialties) = 3
                AND (SELECT count(*) FROM public.appointments) = 3
                AND (SELECT count(*) FROM public.pending_changes) = 8
                AND (SELECT count(*) FROM public.pending_changes WHERE status = 'pending') = 2
                AND (SELECT count(DISTINCT user_id) FROM public.patients) = 3
                AND (SELECT count(DISTINCT user_id) FROM public.doctors) = 5
                AND (SELECT count(*) FROM public.patients p JOIN public.users u ON u.user_id = p.user_id AND u.role = 'patient') = 3
                AND (SELECT count(*) FROM public.doctors d JOIN public.users u ON u.user_id = d.user_id AND u.role = 'doctor') = 5$c$, 'OK'),
        ('X02 the full content of the six tables is unchanged by all cases (nothing leaked past a rollback)', NULL, NULL,
            format('SELECT (%s) = %L', c_fp, v_fp0), 'OK'),
        ('X03 the six identity sequences exist and none was consumed', NULL, NULL,
            $c$SELECT (SELECT count(*) FROM pg_sequences WHERE schemaname = 'public') = 6 AND NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL)$c$, 'OK')
        ) AS t(id, prep, stmt, chk, expect)
    LOOP
        v_stage := 'init'; v_state := NULL; v_con := NULL; v_col := NULL; v_msg := NULL; v_obj := NULL; v_harn := NULL;

        -- فحوص بنية الحالة نفسها (حتى لا تنجح حالة فارغة المعنى)
        IF r.expect = 'OK' THEN
            IF r.chk IS NULL THEN v_harn := 'an OK case must have a chk'; END IF;
        ELSE
            IF r.stmt IS NULL THEN v_harn := 'an expected-failure case must have a stmt'; END IF;
            IF r.chk IS NOT NULL THEN v_harn := 'an expected-failure case must not have a chk'; END IF;
        END IF;
        IF r.stmt IS NOT NULL AND position(';' IN rtrim(r.stmt, '; ')) > 0 THEN
            v_harn := 'stmt must be a single statement';
        END IF;

        IF v_harn IS NULL THEN
            BEGIN
                v_stage := 'prep';
                IF r.prep IS NOT NULL THEN
                    EXECUTE r.prep;
                END IF;
                v_stage := 'stmt';
                IF r.stmt IS NOT NULL THEN
                    EXECUTE r.stmt;
                END IF;
                v_stage := 'chk';
                IF r.chk IS NOT NULL THEN
                    EXECUTE r.chk INTO v_bool;
                    IF v_bool IS DISTINCT FROM true THEN
                        RAISE EXCEPTION USING ERRCODE = 'AF998', MESSAGE = 'check-false';
                    END IF;
                END IF;
                v_stage := 'end';
                RAISE EXCEPTION USING ERRCODE = 'AF999', MESSAGE = 'ok-rollback';
            EXCEPTION WHEN OTHERS THEN
                GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME, v_col = COLUMN_NAME, v_msg = MESSAGE_TEXT;
                v_state := SQLSTATE;
            END;
        END IF;

        v_obj := CASE WHEN v_state = '23502' THEN v_col ELSE v_con END;
        IF v_harn IS NOT NULL THEN
            v_ok := false;
        ELSIF r.expect = 'OK' THEN
            v_ok := (v_stage = 'end' AND v_state = 'AF999');
        ELSIF position(':' IN r.expect) > 0 THEN
            v_ok := coalesce(v_stage = 'stmt' AND v_state = split_part(r.expect, ':', 1)
                             AND v_obj = ANY (string_to_array(split_part(r.expect, ':', 2), '|')), false);
        ELSE
            v_ok := (v_stage = 'stmt' AND v_state = r.expect);
        END IF;

        v_total := v_total + 1;
        v_grp := substring(r.id FROM '^[A-Z]+');
        v_n := jsonb_set(v_n, ARRAY[v_grp], to_jsonb(coalesce((v_n ->> v_grp)::int, 0) + 1));
        IF v_ok THEN
            v_p := jsonb_set(v_p, ARRAY[v_grp], to_jsonb(coalesce((v_p ->> v_grp)::int, 0) + 1));
        ELSIF v_harn IS NOT NULL THEN
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  (harness error: %)', r.id, v_harn;
        ELSE
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  (expected %, got % at stage % [%] msg: %)', r.id, r.expect, coalesce(v_state, 'NULL'), v_stage, coalesce(v_obj, '-'), coalesce(v_msg, '-');
        END IF;
    END LOOP;

    FOR g IN SELECT key AS grp, value::int AS n, coalesce((v_p ->> key)::int, 0) AS passed FROM jsonb_each_text(v_n) ORDER BY key LOOP
        RAISE NOTICE 'group %: %/% passed', g.grp, g.passed, g.n;
    END LOOP;
    RAISE NOTICE 'TOTAL: %/% passed, % failed', v_total - v_fail, v_total, v_fail;

    IF v_fail > 0 THEN
        RAISE EXCEPTION '% test(s) failed', v_fail;
    END IF;
END $t$;

ROLLBACK;
