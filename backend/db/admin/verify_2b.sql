-- التحقق من المرحلة 1B-2b (للقراءة فقط): 42 فحصاً W01-W42 على afiyah_test. يحلّ محلّ verify_2a.sql كبوّابة لحالة نهاية 1B-2b.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f backend/db/admin/verify_2b.sql
-- يلزم تطبيق 002_functions.sql و 003_indexes.sql أولاً؛ وغيابهما يظهر فشلاً صريحاً لا أخطاء تحليل صامتة (كل ما يستدعي الدوال ينفَّذ ديناميكياً داخل كتل تلتقط الخطأ).
-- verify_2a.sql لا يُعدَّل، وسيفشل عمداً بعد 1B-2b في V02 و V08 و V09 و V14 (فهارس 16 لا 10، وقيود CHECK 26 لا 25، ودوال 7 لا صفر)؛ وهذا الملف يعيد إثبات كل ما لم يتغير.
-- القراءة فقط مفروضة آلياً: كل شيء داخل BEGIN TRANSACTION READ ONLY (أي كتابة أو DDL أو nextval يفشل). التعليمات الوحيدة غير SELECT هي set_config(..., true) لإعداد TimeZone
-- داخل المعاملة (تُعاد قيمته الأصلية)، وهي لا تكتب في قاعدة البيانات.
--
-- طريقة التقييم الدلالي (بدل مقارنة نصوص pg_get_expr): تُقرأ تعابير شروط الفهارس الجزئية وقيود CHECK من الكتالوج (pg_get_expr على indpred/conbin)، وتُمرَّر قبل التنفيذ
-- بغربال صارم (لا ; ولا $ ولا \ ولا -- ولا /*، وبعد حذف الثوابت النصية لا يبقى إلا محارف مسموحة، وكل معرِّف يجب أن يكون عموداً من أعمدة الفحص أو دالة مسماة مسبقاً أو كلمة نوع/منطق من قائمة مغلقة)،
-- ثم تُقيَّم على جدول حقائق (VALUES) أعمدته بالأسماء نفسها وبأنواع الأعمدة الفعلية المقروءة من pg_attribute (format_type)، وتُصنَّف كل نتيجة T (صحيح) أو F (خطأ) أو U (غير معروف/NULL) أو X (النوع ليس boolean)
-- فتُحفظ منطق الحالات الثلاث. أي خطأ تقييم أو تعبير غير متوقع أو نتيجة مختلفة = فشل الفحص؛ ولا يُستبدل ذلك أبداً بمقارنة نصية.
--
-- المنطقة الزمنية لدمشق (تحقّقت منها ملفات tzdata المرفقة مع Postgres.app 18 والنظام، دون اتصال بقاعدة البيانات): توقيت EET/EEST مع التوقيت الصيفي حتى آخر انتقال في 2022-03-24 22:00 UTC (2022-03-25 محلياً، 2→3)،
-- ثم +03:00 دائماً بلا عودة في خريف 2022. لذلك: التجهيزات التاريخية (قبل ذلك) تُختبر بإزاحاتها الصحيحة (+02 شتاءً و +03 صيفاً مع لحظات الانتقال)، وتجهيزات ما بعد التغيير (من 2022-07 فصاعداً) و"المتسلسلة" (من 2022-11-01)
-- تُختبر بثبات +03:00. قاعدة الأيام الأربعة عشر التقويمية بتوقيت دمشق لا تفترض منتصف ليل موجوداً في الأيام التاريخية: يوم 2020-03-27 و 2021-03-26 و 2022-03-25 ينتقل فيه التوقيت عند منتصف الليل (00:00 غير موجود).
--
-- صلاحيات الدوال (EXECUTE): proacl IS NULL تعني أنه لم يُنفَّذ أي GRANT أو REVOKE صريح، وتبقى الصلاحية الافتراضية في PostgreSQL (EXECUTE لـ PUBLIC) سارية فعلياً حتى تشديدها في 1B-2e؛ فلا يُدَّعى هنا أن PUBLIC بلا EXECUTE،
-- وتُعرض الصلاحية الفعلية لـ afiyah_app في عمود التفاصيل للعلم فقط.
\set ON_ERROR_STOP on
\ir ../_guard.sql

BEGIN TRANSACTION READ ONLY;

DO $v$
DECLARE
    chk        record;
    s          record;
    r          record;
    el         jsonb;
    v_tok      text;
    j          int;
    v_fail     int := 0;
    v_total    int := 0;
    v_expect   constant int := 42;
    v_relid    oid;
    v_expr     text;
    v_strip    text;
    v_ty       text;
    v_tys      text[];
    v_cols     text;
    v_rows     text;
    v_line     text;
    v_sql      text;
    v_res      text;
    v_err      text;
    v_sem_ok   jsonb := '{}';
    v_sem_det  jsonb := '{}';
    v_rec      record;
    v_tzres    jsonb := '{}';
    v_tzerr    text;
    v_tz0      text;
    v_tz_after text;
    v_beh      text;
    v_beh_err  text;
    -- كلمات النوع والمنطق المسموحة في التعابير المقيَّمة (لا دوال مسموحة إلا ما تسمّيه كل مواصفة صراحةً)
    c_common   constant text[] := ARRAY['text','character','varying','varchar','timestamp','timestamptz','with','without','time','zone','at','interval','jsonb','boolean','true','false','null','is','not','and','or'];
    -- سلسلة تجهيزات المنطقة الزمنية؛ تُنفَّذ ديناميكياً (تستدعي الدوال) وتُعيد نصاً فارغاً لكل خانة نجحت أو معرّفات ما فشل
    c_tzfix    constant text := $q$
        WITH off_fx(id, t, off) AS (VALUES
            -- تاريخي: EET شتاءً (+02) و EEST صيفاً (+03) ولحظات الانتقال الدقيقة (2→3 في 2021-03-25 22:00Z و 2022-03-24 22:00Z؛ 3→2 في 2021-10-28 21:00Z)
            ('H01', timestamptz '2021-01-15 12:00:00+00', interval '2 hours'),
            ('H02', timestamptz '2021-07-15 12:00:00+00', interval '3 hours'),
            ('H03', timestamptz '2021-03-25 21:59:59+00', interval '2 hours'),
            ('H04', timestamptz '2021-03-25 22:00:00+00', interval '3 hours'),
            ('H05', timestamptz '2021-10-28 20:59:59+00', interval '3 hours'),
            ('H06', timestamptz '2021-10-28 21:00:00+00', interval '2 hours'),
            ('H07', timestamptz '2022-01-15 12:00:00+00', interval '2 hours'),
            ('H08', timestamptz '2022-03-24 21:59:59+00', interval '2 hours'),
            ('H09', timestamptz '2022-03-24 22:00:00+00', interval '3 hours'),
            -- بعد التغيير: +03 دائماً (لا عودة إلى +02 في خريف 2022)
            ('P01', timestamptz '2022-07-15 12:00:00+00', interval '3 hours'),
            ('P02', timestamptz '2022-10-29 12:00:00+00', interval '3 hours'),
            ('P03', timestamptz '2022-11-01 12:00:00+00', interval '3 hours'),
            ('P04', timestamptz '2023-01-15 12:00:00+00', interval '3 hours'),
            ('P05', timestamptz '2023-07-15 12:00:00+00', interval '3 hours'),
            ('P06', timestamptz '2026-10-01 12:00:00+00', interval '3 hours'),
            ('P07', timestamptz '2040-07-15 12:00:00+00', interval '3 hours')
        ),
        exec_fx(id, created, expect) AS (VALUES
            -- تاريخي: عبور بداية التوقيت الصيفي (منتصف ليل اليوم الرابع عشر بإزاحة +03) وعبور نهايته (بإزاحة +02) وساعة مكرَّرة عند العودة
            ('X01', timestamptz '2021-03-20 08:00:00+00', timestamptz '2021-04-02 21:00:00+00'),
            ('X02', timestamptz '2021-10-20 09:00:00+00', timestamptz '2021-11-02 22:00:00+00'),
            ('X03', timestamptz '2022-03-20 10:00:00+00', timestamptz '2022-04-02 21:00:00+00'),
            ('X04', timestamptz '2021-10-28 20:59:59+00', timestamptz '2021-11-10 22:00:00+00'),
            ('X05', timestamptz '2021-10-28 21:00:00+00', timestamptz '2021-11-10 22:00:00+00'),
            -- بعد التغيير: لا انزياح؛ حدود منتصف الليل المحلي 23:59:59.999999 و 00:00 وعبور السنة والشهر والسنة الكبيسة
            ('X06', timestamptz '2022-10-20 09:00:00+00', timestamptz '2022-11-02 21:00:00+00'),
            ('X07', timestamptz '2026-10-01 07:30:00+00', timestamptz '2026-10-14 21:00:00+00'),
            ('X08', timestamptz '2026-10-01 20:59:59.999999+00', timestamptz '2026-10-14 21:00:00+00'),
            ('X09', timestamptz '2026-10-01 21:00:00+00', timestamptz '2026-10-15 21:00:00+00'),
            ('X10', timestamptz '2026-12-25 09:00:00+00', timestamptz '2027-01-07 21:00:00+00'),
            ('X11', timestamptz '2028-02-20 09:00:00+00', timestamptz '2028-03-04 21:00:00+00'),
            ('X12', timestamptz '2026-02-19 22:00:00+00', timestamptz '2026-03-05 21:00:00+00')
        )
        SELECT
            coalesce((SELECT string_agg(f.id, ',' ORDER BY f.id) FROM off_fx f
                       WHERE public.clinic_local(f.t) - (f.t AT TIME ZONE 'UTC') IS DISTINCT FROM f.off), '') AS off_fail,
            coalesce((SELECT string_agg(f.id, ',' ORDER BY f.id) FROM exec_fx f
                       WHERE public.pending_execute_at(f.created) IS DISTINCT FROM f.expect), '') AS exec_fail,
            -- متسلسلة ما بعد التغيير (من 2022-11-01): إزاحة +03 ثابتة، النتيجة = صيغة قيد CHECK، منتصف ليل محلي، فرق 14 يوماً تقويمياً
            CASE WHEN EXISTS (
                SELECT 1 FROM generate_series(timestamptz '2022-11-01 00:00:00+00', timestamptz '2035-12-31 00:00:00+00', interval '7 hours 13 minutes') g(t)
                 WHERE public.clinic_local(g.t) - (g.t AT TIME ZONE 'UTC') IS DISTINCT FROM interval '3 hours'
                    OR public.pending_execute_at(g.t) IS DISTINCT FROM ((date_trunc('day', g.t AT TIME ZONE 'Asia/Damascus') + interval '14 days') AT TIME ZONE 'Asia/Damascus')
                    OR public.clinic_local(public.pending_execute_at(g.t))::time IS DISTINCT FROM time '00:00'
                    OR public.clinic_local(public.pending_execute_at(g.t))::date - public.clinic_local(g.t)::date IS DISTINCT FROM 14
            ) THEN 'S' ELSE '' END AS post_fail,
            -- متسلسلة تاريخية (2020-01-01 حتى لحظة آخر انتقال): النتيجة = صيغة القيد وفرق 14 يوماً تقويمياً؛ ومنتصف الليل المحلي إلا في أيام انتقال منتصف الليل الثلاثة (00:00 غير موجود فيها)
            CASE WHEN EXISTS (
                SELECT 1 FROM generate_series(timestamptz '2020-01-01 00:00:00+00', timestamptz '2022-03-24 21:59:59+00', interval '7 hours 13 minutes') g(t)
                 WHERE public.pending_execute_at(g.t) IS DISTINCT FROM ((date_trunc('day', g.t AT TIME ZONE 'Asia/Damascus') + interval '14 days') AT TIME ZONE 'Asia/Damascus')
                    OR public.clinic_local(public.pending_execute_at(g.t))::date - public.clinic_local(g.t)::date IS DISTINCT FROM 14
                    OR NOT (public.clinic_local(public.pending_execute_at(g.t))::time = time '00:00'
                            OR (public.clinic_local(public.pending_execute_at(g.t))::time IN (time '00:00', time '01:00')
                                AND public.clinic_local(public.pending_execute_at(g.t))::date IN (date '2020-03-27', date '2021-03-26', date '2022-03-25')))
            ) THEN 'S' ELSE '' END AS hist_fail
    $q$;
    -- فحوص سلوك الدوال على مدخلات ثابتة (استدعاءات للقراءة فقط؛ دوال الأقفال لا تُستدعى لأنها تأخذ أقفالاً استشارية)
    c_beh      constant text := $q$
        SELECT coalesce(string_agg(b.bid, ',' ORDER BY b.bid), '') FROM (VALUES
            ('B01', public.clinic_local(timestamptz '2026-11-01 21:00:00+00') IS NOT DISTINCT FROM timestamp '2026-11-02 00:00:00'),
            ('B02', public.clinic_local(timestamptz '2026-11-01 20:59:59.999999+00') IS NOT DISTINCT FROM timestamp '2026-11-01 23:59:59.999999'),
            ('B03', public.clinic_local(timestamptz '2021-01-15 12:00:00+00') IS NOT DISTINCT FROM timestamp '2021-01-15 14:00:00'),
            ('B04', public.clinic_local(timestamptz '2021-07-15 12:00:00+00') IS NOT DISTINCT FROM timestamp '2021-07-15 15:00:00'),
            ('B05', public.clinic_local(NULL::timestamptz) IS NULL),
            ('B06', public.pending_execute_at(timestamptz '2026-10-01 07:30:00+00') IS NOT DISTINCT FROM timestamptz '2026-10-14 21:00:00+00'),
            ('B07', public.pending_execute_at(NULL::timestamptz) IS NULL),
            ('B08', public.pending_new_data_valid(true, '{"phone":"0911111111"}'::jsonb) IS TRUE),
            ('B09', public.pending_new_data_valid(true, '{"role":"admin"}'::jsonb) IS FALSE),
            ('B10', public.pending_new_data_valid(false, '{"appointment_duration":480}'::jsonb) IS TRUE),
            ('B11', public.pending_new_data_valid(false, '{"appointment_duration":481}'::jsonb) IS FALSE),
            ('B12', public.pending_new_data_valid(true, '{}'::jsonb) IS FALSE),
            ('B13', public.pending_new_data_valid(NULL::boolean, '{"phone":"x"}'::jsonb) IS FALSE),
            ('B14', public.pending_new_data_valid(true, '{"years_of_experience":5.0}'::jsonb) IS TRUE),
            ('B15', public.pending_new_data_valid(true, '{"years_of_experience":5.5}'::jsonb) IS FALSE),
            ('B16', public.appointment_rule_violation(NULL::integer, 1, date '2026-11-02', time '10:00', timestamptz '2026-11-01 08:00:00+03') IS NOT DISTINCT FROM 'AF110'),
            ('B17', public.appointment_rule_violation(999999, 999999, date '2026-11-02', time '10:00', timestamptz '2026-11-01 08:00:00+03') IS NOT DISTINCT FROM 'AF102')
        ) b(bid, ok) WHERE b.ok IS NOT TRUE
    $q$;
BEGIN
    IF current_database() <> 'afiyah_test' OR current_user <> 'omarsh' OR session_user <> 'omarsh' THEN
        RAISE EXCEPTION 'verify_2b: must run on afiyah_test as omarsh (got % as % / %)', current_database(), current_user, session_user;
    END IF;
    IF current_setting('transaction_read_only') <> 'on' THEN
        RAISE EXCEPTION 'verify_2b: the transaction is not read only';
    END IF;
    IF current_setting('server_version_num')::int / 10000 <> 18 THEN
        RAISE EXCEPTION 'verify_2b: PostgreSQL 18 is required (got %)', current_setting('server_version');
    END IF;

    -- ===== المرحلة 1: التقييم الدلالي لشروط الفهارس الجزئية وقيود CHECK (كل خطأ يُسجَّل فشلاً للفحص المعني) =====
    FOR s IN
        SELECT * FROM (VALUES
            ('p_admin',  'idx', 'users_one_admin',                     'users',           ARRAY['role'],                              ARRAY[]::text[],
                $j$[["admin"],["patient"],["doctor"],[null],["Admin"]]$j$::jsonb, 'TFFUF'),
            ('p_dslot',  'idx', 'appointments_doctor_slot_uq',         'appointments',    ARRAY['status'],                            ARRAY[]::text[],
                $j$[["booked"],["cancelled"],["pending"],[null],["Booked"]]$j$::jsonb, 'TFFUF'),
            ('p_pslot',  'idx', 'appointments_patient_slot_uq',        'appointments',    ARRAY['status'],                            ARRAY[]::text[],
                $j$[["booked"],["cancelled"],["pending"],[null],["Booked"]]$j$::jsonb, 'TFFUF'),
            ('p_pdoc',   'idx', 'pending_changes_one_per_doctor',      'pending_changes', ARRAY['status','doctor_id'],                ARRAY[]::text[],
                $j$[["pending",1],["pending",null],["executed",1],["cancelled",1],["failed",1],[null,1],[null,null],["pending",2]]$j$::jsonb, 'TFFFFUFT'),
            ('p_pspec',  'idx', 'pending_changes_one_per_specialty',   'pending_changes', ARRAY['status','specialty_id'],             ARRAY[]::text[],
                $j$[["pending",1],["pending",null],["executed",1],["cancelled",1],["failed",1],[null,1],[null,null],["pending",2]]$j$::jsonb, 'TFFFFUFT'),
            ('c_wl',     'con', 'pending_changes_new_data_whitelist_ck','pending_changes', ARRAY['change_type','new_data','doctor_id'], ARRAY['jsonb_typeof','pending_new_data_valid','public'],
                $j$[["update",{"phone":"0911111111"},1],
                    ["update",{"role":"admin"},1],
                    ["update",{"appointment_duration":30},null],
                    ["update",{"appointment_duration":0},null],
                    ["update",{"phone":"x"},null],
                    ["update",{"years_of_experience":5.0},1],
                    ["update",{"years_of_experience":5.5},1],
                    ["update",{"specialty_name":"renamed"},null],
                    ["delete",null,1],
                    ["update",null,1],
                    ["update",{},1],
                    ["update",[],1],
                    [null,{"role":"admin"},1]]$j$::jsonb, 'TFTFFTFTTTTTU'),
            ('c_exec',   'con', 'pending_changes_execute_at_ck',       'pending_changes', ARRAY['created_at','execute_at'],           ARRAY['date_trunc','timezone'],
                $j$[["2026-10-01 10:30+03","2026-10-15 00:00+03"],
                    ["2026-10-01 00:00:00+03","2026-10-15 00:00+03"],
                    ["2026-10-01 23:59:59.999999+03","2026-10-15 00:00+03"],
                    ["2026-10-01 21:00:00+00","2026-10-16 00:00+03"],
                    ["2026-10-01 20:59:59+00","2026-10-15 00:00+03"],
                    ["2026-10-01 10:30+03","2026-10-15 10:30+03"],
                    ["2026-10-01 10:30+03","2026-10-15 00:00+00"],
                    ["2026-10-01 10:30+03","2026-10-16 00:00+03"],
                    ["2026-10-01 10:30+03","2026-10-14 00:00+03"],
                    ["2026-10-01 21:00:00+00","2026-10-15 00:00+03"],
                    [null,"2026-10-15 00:00+03"],
                    ["2026-10-01 10:30+03",null]]$j$::jsonb, 'TTTTTFFFFFUU')
        ) AS t(key, kind, obj, rel, cols, funcs, vals, expect)
    LOOP
        v_res := NULL;
        v_err := NULL;
        BEGIN
            v_relid := to_regclass(format('public.%I', s.rel))::oid;
            IF v_relid IS NULL THEN
                RAISE EXCEPTION 'relation public.% not found', s.rel;
            END IF;
            IF s.kind = 'idx' THEN
                SELECT pg_get_expr(i.indpred, i.indrelid) INTO v_expr
                  FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
                 WHERE ic.relnamespace = 'public'::regnamespace AND ic.relname = s.obj AND i.indrelid = v_relid;
            ELSE
                SELECT pg_get_expr(co.conbin, co.conrelid) INTO v_expr
                  FROM pg_constraint co
                 WHERE co.connamespace = 'public'::regnamespace AND co.conname = s.obj AND co.conrelid = v_relid AND co.contype = 'c';
            END IF;
            IF NOT FOUND THEN
                RAISE EXCEPTION '% % on % not found', s.kind, s.obj, s.rel;
            END IF;
            IF v_expr IS NULL THEN
                RAISE EXCEPTION '% has no expression', s.obj;
            END IF;
            -- غربال الأمان: محارف ممنوعة، ثوابت نصية متوازنة تُحذف، ما تبقى من محارف مسموحة فقط، وكل معرِّف ضمن القائمة المغلقة
            IF length(v_expr) > 2000 OR strpos(v_expr, ';') > 0 OR strpos(v_expr, '$') > 0 OR strpos(v_expr, E'\\') > 0
               OR strpos(v_expr, '--') > 0 OR strpos(v_expr, '/*') > 0 THEN
                RAISE EXCEPTION 'unexpected characters in the expression of %', s.obj;
            END IF;
            v_strip := regexp_replace(v_expr, '''[^'']*''', '', 'g');
            IF strpos(v_strip, '''') > 0 THEN
                RAISE EXCEPTION 'unbalanced string literal in the expression of %', s.obj;
            END IF;
            IF v_strip !~ '^[A-Za-z0-9_ ().,:=<>!+-]*$' THEN
                RAISE EXCEPTION 'unexpected symbols in the expression of %', s.obj;
            END IF;
            FOR v_tok IN SELECT lower(m.parts[1]) FROM regexp_matches(v_strip, '([A-Za-z_][A-Za-z0-9_]*)', 'g') AS m(parts) LOOP
                IF NOT (v_tok = ANY (s.cols || s.funcs || c_common)) THEN
                    RAISE EXCEPTION 'identifier "%" is not allowed in the expression of %', v_tok, s.obj;
                END IF;
            END LOOP;
            -- أنواع الأعمدة الفعلية من الكتالوج
            v_tys := ARRAY[]::text[];
            v_cols := '';
            FOR j IN 1 .. cardinality(s.cols) LOOP
                SELECT format_type(a.atttypid, a.atttypmod) INTO v_ty
                  FROM pg_attribute a
                 WHERE a.attrelid = v_relid AND a.attname = s.cols[j] AND a.attnum > 0 AND NOT a.attisdropped;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'column %.% not found', s.rel, s.cols[j];
                END IF;
                v_tys := v_tys || v_ty;
                v_cols := v_cols || ', ' || quote_ident(s.cols[j]);
            END LOOP;
            -- جدول الحقائق: كل قيمة تُكتب نصاً مقتبساً مع تحويل صريح إلى نوع العمود؛ null في JSON يعني NULL في SQL
            v_rows := '';
            FOR r IN SELECT x.e, x.ord FROM jsonb_array_elements(s.vals) WITH ORDINALITY AS x(e, ord) LOOP
                IF jsonb_typeof(r.e) <> 'array' OR jsonb_array_length(r.e) <> cardinality(s.cols) THEN
                    RAISE EXCEPTION 'malformed truth-table row % of %', r.ord, s.key;
                END IF;
                v_line := r.ord::text;
                FOR j IN 1 .. cardinality(s.cols) LOOP
                    el := r.e -> (j - 1);
                    v_line := v_line || ', '
                        || CASE jsonb_typeof(el)
                               WHEN 'null' THEN 'NULL'
                               WHEN 'string' THEN quote_literal(el #>> '{}')
                               ELSE quote_literal(el::text)
                           END
                        || '::' || v_tys[j];
                END LOOP;
                v_rows := v_rows || CASE WHEN v_rows = '' THEN '' ELSE ', ' END || '(' || v_line || ')';
            END LOOP;
            -- التقييم: T/F/U بحسب IS TRUE / IS FALSE / غير ذلك، وX إن لم يكن نوع التعبير boolean؛ مرتّبة بترتيب الصفوف
            v_sql := format(
                'SELECT string_agg(CASE WHEN t.ty <> %L THEN %L WHEN t.r IS TRUE THEN %L WHEN t.r IS FALSE THEN %L ELSE %L END, %L ORDER BY t.ord) '
                || 'FROM (SELECT v.ord, (%s) AS r, pg_typeof(%s)::text AS ty FROM (VALUES %s) AS v(ord%s)) t',
                'boolean', 'X', 'T', 'F', 'U', '', v_expr, v_expr, v_rows, v_cols);
            EXECUTE v_sql INTO v_res;
        EXCEPTION WHEN OTHERS THEN
            v_err := SQLERRM;
            v_res := NULL;
        END;
        v_sem_ok  := v_sem_ok  || jsonb_build_object(s.key, coalesce(v_res = s.expect, false));
        v_sem_det := v_sem_det || jsonb_build_object(s.key, coalesce(v_res, 'ERROR: ' || coalesce(v_err, 'no result')) || ' (expected ' || s.expect || ')');
    END LOOP;

    -- ===== المرحلة 2: تجهيزات المنطقة الزمنية الدمشقية بثلاث إعدادات للجلسة (الأصلي، ثم لوس أنجلوس، ثم طوكيو) =====
    v_tz0 := current_setting('TimeZone');
    BEGIN
        EXECUTE c_tzfix INTO v_rec;
        v_tzres := jsonb_build_object('base', to_jsonb(v_rec));
        PERFORM set_config('TimeZone', 'America/Los_Angeles', true);
        EXECUTE c_tzfix INTO v_rec;
        v_tzres := v_tzres || jsonb_build_object('la', to_jsonb(v_rec));
        PERFORM set_config('TimeZone', 'Asia/Tokyo', true);
        EXECUTE c_tzfix INTO v_rec;
        v_tzres := v_tzres || jsonb_build_object('tk', to_jsonb(v_rec));
    EXCEPTION WHEN OTHERS THEN
        v_tzerr := SQLERRM;
    END;
    PERFORM set_config('TimeZone', v_tz0, true);
    v_tz_after := current_setting('TimeZone');

    -- ===== المرحلة 3: سلوك الدوال على مدخلات ثابتة =====
    BEGIN
        EXECUTE c_beh INTO v_beh;
    EXCEPTION WHEN OTHERS THEN
        v_beh_err := SQLERRM;
    END;

    FOR chk IN
    WITH
    tbls AS (
        SELECT c.oid, c.relname, c.relkind, c.relowner, c.relacl, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity, c.relispartition
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
    ),
    exp_cols(tbl, ord, col, typ, nn, ident, dflt) AS (VALUES
        ('users', 1, 'user_id', 'integer', true, 'a', NULL),
        ('users', 2, 'email', 'character varying(255)', true, '', NULL),
        ('users', 3, 'password_hash', 'character varying(255)', true, '', NULL),
        ('users', 4, 'role', 'character varying(20)', true, '', NULL),
        ('users', 5, 'is_active', 'boolean', true, '', 'true'),
        ('specialties', 1, 'specialty_id', 'integer', true, 'a', NULL),
        ('specialties', 2, 'specialty_name', 'character varying(100)', true, '', NULL),
        ('specialties', 3, 'appointment_duration', 'integer', true, '', NULL),
        ('patients', 1, 'patient_id', 'integer', true, 'a', NULL),
        ('patients', 2, 'user_id', 'integer', true, '', NULL),
        ('patients', 3, 'first_name', 'character varying(100)', true, '', NULL),
        ('patients', 4, 'last_name', 'character varying(100)', true, '', NULL),
        ('patients', 5, 'phone', 'character varying(20)', true, '', NULL),
        ('patients', 6, 'birth_date', 'date', true, '', NULL),
        ('patients', 7, 'address', 'character varying(255)', false, '', NULL),
        ('patients', 8, 'gender', 'character varying(10)', true, '', NULL),
        ('patients', 9, 'blood_type', 'character varying(5)', false, '', NULL),
        ('doctors', 1, 'doctor_id', 'integer', true, 'a', NULL),
        ('doctors', 2, 'user_id', 'integer', true, '', NULL),
        ('doctors', 3, 'specialty_id', 'integer', true, '', NULL),
        ('doctors', 4, 'first_name', 'character varying(100)', true, '', NULL),
        ('doctors', 5, 'last_name', 'character varying(100)', true, '', NULL),
        ('doctors', 6, 'birth_date', 'date', true, '', NULL),
        ('doctors', 7, 'phone', 'character varying(20)', true, '', NULL),
        ('doctors', 8, 'image_url', 'character varying(500)', false, '', NULL),
        ('doctors', 9, 'biography', 'text', false, '', NULL),
        ('doctors', 10, 'years_of_experience', 'integer', false, '', NULL),
        ('appointments', 1, 'appointment_id', 'integer', true, 'a', NULL),
        ('appointments', 2, 'patient_id', 'integer', true, '', NULL),
        ('appointments', 3, 'doctor_id', 'integer', true, '', NULL),
        ('appointments', 4, 'appointment_date', 'date', true, '', NULL),
        ('appointments', 5, 'appointment_time', 'time without time zone', true, '', NULL),
        ('appointments', 6, 'status', 'character varying(20)', true, '', '''booked''::character varying'),
        ('pending_changes', 1, 'change_id', 'integer', true, 'a', NULL),
        ('pending_changes', 2, 'doctor_id', 'integer', false, '', NULL),
        ('pending_changes', 3, 'specialty_id', 'integer', false, '', NULL),
        ('pending_changes', 4, 'change_type', 'character varying(20)', true, '', NULL),
        ('pending_changes', 5, 'new_data', 'jsonb', false, '', NULL),
        ('pending_changes', 6, 'status', 'character varying(20)', true, '', '''pending''::character varying'),
        ('pending_changes', 7, 'created_at', 'timestamp with time zone', true, '', 'now()'),
        ('pending_changes', 8, 'execute_at', 'timestamp with time zone', true, '', NULL),
        ('pending_changes', 9, 'failure_reason', 'text', false, '', NULL)
    ),
    act_cols AS (
        SELECT c.relname::text AS tbl,
               (row_number() OVER (PARTITION BY c.relname ORDER BY a.attnum))::int AS ord,
               a.attname::text AS col,
               format_type(a.atttypid, a.atttypmod) AS typ,
               a.attnotnull AS nn,
               a.attidentity::text AS ident,
               pg_get_expr(d.adbin, d.adrelid) AS dflt
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
    ),
    exp_con(tbl, conname, contype, def) AS (VALUES
        ('users', 'users_pkey', 'p', 'PRIMARY KEY (user_id)'),
        ('specialties', 'specialties_pkey', 'p', 'PRIMARY KEY (specialty_id)'),
        ('patients', 'patients_pkey', 'p', 'PRIMARY KEY (patient_id)'),
        ('doctors', 'doctors_pkey', 'p', 'PRIMARY KEY (doctor_id)'),
        ('appointments', 'appointments_pkey', 'p', 'PRIMARY KEY (appointment_id)'),
        ('pending_changes', 'pending_changes_pkey', 'p', 'PRIMARY KEY (change_id)'),
        ('users', 'users_email_key', 'u', 'UNIQUE (email)'),
        ('specialties', 'specialties_specialty_name_key', 'u', 'UNIQUE (specialty_name)'),
        ('patients', 'patients_user_id_key', 'u', 'UNIQUE (user_id)'),
        ('doctors', 'doctors_user_id_key', 'u', 'UNIQUE (user_id)')
    ),
    act_con AS (
        SELECT cl.relname::text AS tbl, co.conname::text, co.contype::text, pg_get_constraintdef(co.oid) AS def
          FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE n.nspname = 'public' AND co.contype IN ('p', 'u')
    ),
    exp_fk(tbl, conname, cols, reftbl, refcols, del, upd, mt, dfr, val) AS (VALUES
        ('patients', 'patients_user_id_fkey', 'user_id', 'users', 'user_id', 'r', 'a', 's', false, true),
        ('doctors', 'doctors_user_id_fkey', 'user_id', 'users', 'user_id', 'r', 'a', 's', false, true),
        ('doctors', 'doctors_specialty_id_fkey', 'specialty_id', 'specialties', 'specialty_id', 'r', 'a', 's', false, true),
        ('appointments', 'appointments_patient_id_fkey', 'patient_id', 'patients', 'patient_id', 'r', 'a', 's', false, true),
        ('appointments', 'appointments_doctor_id_fkey', 'doctor_id', 'doctors', 'doctor_id', 'r', 'a', 's', false, true),
        ('pending_changes', 'pending_changes_doctor_id_fkey', 'doctor_id', 'doctors', 'doctor_id', 'r', 'a', 's', false, true),
        ('pending_changes', 'pending_changes_specialty_id_fkey', 'specialty_id', 'specialties', 'specialty_id', 'c', 'a', 's', false, true)
    ),
    act_fk AS (
        SELECT cl.relname::text AS tbl, co.conname::text,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(co.conkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.attnum) AS cols,
               rf.relname::text AS reftbl,
               (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(co.confkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = co.confrelid AND a.attnum = k.attnum) AS refcols,
               co.confdeltype::text AS del, co.confupdtype::text AS upd, co.confmatchtype::text AS mt,
               co.condeferrable AS dfr, co.convalidated AS val
          FROM pg_constraint co
          JOIN pg_class cl ON cl.oid = co.conrelid
          JOIN pg_class rf ON rf.oid = co.confrelid
          JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE co.contype = 'f' AND n.nspname = 'public'
    ),
    exp_ck(conname) AS (VALUES
        ('users_email_ck'), ('users_password_hash_ck'), ('users_role_ck'),
        ('specialties_name_ck'), ('specialties_duration_ck'),
        ('patients_first_name_ck'), ('patients_last_name_ck'), ('patients_phone_ck'), ('patients_address_ck'),
        ('patients_gender_ck'), ('patients_blood_type_ck'),
        ('doctors_first_name_ck'), ('doctors_last_name_ck'), ('doctors_phone_ck'), ('doctors_image_url_ck'),
        ('doctors_years_of_experience_ck'),
        ('appointments_date_not_friday_ck'), ('appointments_time_ck'), ('appointments_status_ck'),
        ('pending_changes_target_ck'), ('pending_changes_change_type_ck'), ('pending_changes_status_ck'),
        ('pending_changes_new_data_shape_ck'), ('pending_changes_failure_reason_ck'), ('pending_changes_execute_at_ck'),
        ('pending_changes_new_data_whitelist_ck')
    ),
    act_ck AS (
        SELECT co.conname::text FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE n.nspname = 'public' AND co.contype = 'c'
    ),
    act_ck_def AS (
        SELECT co.conname::text AS conname, pg_get_constraintdef(co.oid) AS def
          FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE n.nspname = 'public' AND co.contype = 'c'
    ),
    ck_tokens(conname, tok) AS (VALUES
        ('users_email_ck', 'lower'),
        ('users_role_ck', '''patient'''), ('users_role_ck', '''doctor'''), ('users_role_ck', '''admin'''),
        ('specialties_duration_ck', '480'),
        ('patients_gender_ck', '''male'''), ('patients_gender_ck', '''female'''),
        ('patients_blood_type_ck', '''AB\+'''), ('patients_blood_type_ck', '''O-'''),
        ('appointments_date_not_friday_ck', 'appointment_date'),
        ('appointments_time_ck', '09:00'), ('appointments_time_ck', '17:00'),
        ('appointments_status_ck', '''booked'''), ('appointments_status_ck', '''cancelled'''),
        ('pending_changes_target_ck', 'num_nonnulls'),
        ('pending_changes_change_type_ck', '''update'''), ('pending_changes_change_type_ck', '''delete'''),
        ('pending_changes_status_ck', '''pending'''), ('pending_changes_status_ck', '''executed'''),
        ('pending_changes_status_ck', '''cancelled'''), ('pending_changes_status_ck', '''failed'''),
        ('pending_changes_new_data_shape_ck', 'jsonb_typeof'),
        ('pending_changes_failure_reason_ck', '''failed'''),
        ('pending_changes_execute_at_ck', 'Asia/Damascus'), ('pending_changes_execute_at_ck', '14 days')
    ),
    exp_idx(idxname) AS (VALUES
        ('users_pkey'), ('users_email_key'), ('specialties_pkey'), ('specialties_specialty_name_key'),
        ('patients_pkey'), ('patients_user_id_key'), ('doctors_pkey'), ('doctors_user_id_key'),
        ('appointments_pkey'), ('pending_changes_pkey'),
        ('users_one_admin'), ('appointments_doctor_slot_uq'), ('appointments_patient_slot_uq'),
        ('pending_changes_one_per_doctor'), ('pending_changes_one_per_specialty'), ('doctors_specialty_id_idx')
    ),
    act_idx AS (
        SELECT ic.relname::text AS idxname
          FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
    ),
    exp_newidx(idxname, tbl, uniq, cols, props) AS (VALUES
        ('users_one_admin', 'users', true, 'role', true),
        ('appointments_doctor_slot_uq', 'appointments', true, 'doctor_id,appointment_date,appointment_time', true),
        ('appointments_patient_slot_uq', 'appointments', true, 'patient_id,appointment_date,appointment_time', true),
        ('pending_changes_one_per_doctor', 'pending_changes', true, 'doctor_id', true),
        ('pending_changes_one_per_specialty', 'pending_changes', true, 'specialty_id', true),
        ('doctors_specialty_id_idx', 'doctors', false, 'specialty_id', true)
    ),
    act_newidx AS (
        SELECT ic.relname::text AS idxname, t.relname::text AS tbl, i.indisunique AS uniq,
               (SELECT string_agg(pg_get_indexdef(i.indexrelid, k.n, true), ',' ORDER BY k.n) FROM generate_series(1, i.indnatts::int) AS k(n)) AS cols,
               (am.amname = 'btree' AND i.indnatts = i.indnkeyatts AND i.indisvalid AND i.indisready AND i.indislive
                AND NOT i.indisprimary AND NOT i.indisexclusion AND NOT i.indnullsnotdistinct AND i.indexprs IS NULL
                AND NOT i.indisclustered AND NOT i.indisreplident AND ic.reloptions IS NULL AND ic.reltablespace = 0
                AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
                AND pg_get_userbyid(ic.relowner) = 'omarsh') AS props
          FROM pg_index i
          JOIN pg_class ic ON ic.oid = i.indexrelid
          JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_am am ON am.oid = ic.relam
         WHERE n.nspname = 'public'
           AND ic.relname IN ('users_one_admin', 'appointments_doctor_slot_uq', 'appointments_patient_slot_uq',
                              'pending_changes_one_per_doctor', 'pending_changes_one_per_specialty', 'doctors_specialty_id_idx')
    ),
    exp_standalone(idxname) AS (VALUES
        ('users_one_admin'), ('appointments_doctor_slot_uq'), ('appointments_patient_slot_uq'),
        ('pending_changes_one_per_doctor'), ('pending_changes_one_per_specialty'), ('doctors_specialty_id_idx')
    ),
    act_standalone AS (
        SELECT ic.relname::text AS idxname, i.indisunique AS uniq
          FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public' AND NOT i.indisprimary
           AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
    ),
    exp_seq(tbl, col) AS (VALUES
        ('users', 'user_id'), ('specialties', 'specialty_id'), ('patients', 'patient_id'),
        ('doctors', 'doctor_id'), ('appointments', 'appointment_id'), ('pending_changes', 'change_id')
    ),
    act_seq AS (
        SELECT c.relname::text AS tbl, a.attname::text AS col, ps.sequencename::text AS seqname,
               pg_get_serial_sequence(format('public.%I', c.relname), a.attname) AS owned_seq,
               ps.data_type::text AS typ, ps.start_value, ps.min_value, ps.max_value, ps.increment_by, ps.cycle, ps.cache_size
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_sequences ps ON ps.schemaname = 'public' AND ps.sequencename = c.relname || '_' || a.attname || '_seq'
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attidentity = 'a'
    ),
    seq_state(seqname, last_value, is_called) AS (
        -- قراءة مباشرة من علاقات التسلسل: خطأ صلاحية صريح عند غياب الصلاحية بدل NULL مضلل
        SELECT 'users_user_id_seq', last_value, is_called FROM public.users_user_id_seq
        UNION ALL SELECT 'specialties_specialty_id_seq', last_value, is_called FROM public.specialties_specialty_id_seq
        UNION ALL SELECT 'patients_patient_id_seq', last_value, is_called FROM public.patients_patient_id_seq
        UNION ALL SELECT 'doctors_doctor_id_seq', last_value, is_called FROM public.doctors_doctor_id_seq
        UNION ALL SELECT 'appointments_appointment_id_seq', last_value, is_called FROM public.appointments_appointment_id_seq
        UNION ALL SELECT 'pending_changes_change_id_seq', last_value, is_called FROM public.pending_changes_change_id_seq
    ),
    exp_fn(fname, fargs, fret, flang, fvol, fstrict, fpar) AS (VALUES
        ('clinic_local', 'timestamp with time zone', 'timestamp without time zone', 'sql', 's', true, 's'),
        ('pending_execute_at', 'timestamp with time zone', 'timestamp with time zone', 'sql', 's', true, 's'),
        ('pending_new_data_valid', 'boolean, jsonb', 'boolean', 'sql', 'i', false, 's'),
        ('lock_specialty', 'integer, boolean', 'void', 'plpgsql', 'v', false, 'u'),
        ('lock_doctor', 'integer', 'void', 'plpgsql', 'v', false, 'u'),
        ('lock_patient', 'integer', 'void', 'plpgsql', 'v', false, 'u'),
        ('appointment_rule_violation', 'integer, integer, date, time without time zone, timestamp with time zone', 'text', 'plpgsql', 's', false, 'u')
    ),
    act_fn AS (
        SELECT p.proname::text AS fname, oidvectortypes(p.proargtypes)::text AS fargs, format_type(p.prorettype, NULL)::text AS fret,
               l.lanname::text AS flang, p.provolatile::text AS fvol, p.proisstrict AS fstrict, p.proparallel::text AS fpar
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
         WHERE n.nspname = 'public'
    ),
    checks(id, descr, ok, detail) AS (
        SELECT 'W01', 'exactly the six approved tables (no seventh table, no migrations table)',
               (SELECT array_agg(relname::text ORDER BY relname) FROM tbls WHERE relkind = 'r')
                 = ARRAY['appointments','doctors','patients','pending_changes','specialties','users'],
               (SELECT string_agg(relname, ',' ORDER BY relname) FROM tbls WHERE relkind = 'r')
        UNION ALL SELECT 'W02', 'relation inventory of public: 6 tables, 16 indexes (10 constraint indexes + 6 new), 6 identity sequences, nothing else (no views, matviews, foreign tables, composite types)',
               (SELECT count(*) FROM tbls WHERE relkind = 'r') = 6 AND (SELECT count(*) FROM tbls WHERE relkind = 'i') = 16
               AND (SELECT count(*) FROM tbls WHERE relkind = 'S') = 6 AND (SELECT count(*) FROM tbls WHERE relkind NOT IN ('r','i','S')) = 0,
               (SELECT string_agg(relkind::text || '=' || n, ' ' ORDER BY relkind) FROM (SELECT relkind, count(*) AS n FROM tbls GROUP BY relkind) k)
        UNION ALL SELECT 'W03', 'no other schema holds objects (only public)',
               NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                            WHERE n.nspname NOT IN ('public','pg_catalog','information_schema','pg_toast') AND n.nspname !~ '^pg_(temp|toast_temp)'),
               NULL
        UNION ALL SELECT 'W04', 'Stage 1B-2a columns intact: all 42 match the approved names, order, types, nullability, identity and defaults; 33 NOT NULL constraints (PostgreSQL 18 catalog)',
               NOT EXISTS (SELECT * FROM act_cols EXCEPT SELECT * FROM exp_cols)
               AND NOT EXISTS (SELECT * FROM exp_cols EXCEPT SELECT * FROM act_cols)
               AND (SELECT count(*) FROM act_cols) = 42
               AND (SELECT count(*) FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
                     WHERE n.nspname = 'public' AND co.contype = 'n') = 33,
               (SELECT count(*) || ' columns, ' || count(*) FILTER (WHERE nn) || ' not null' FROM act_cols)
        UNION ALL SELECT 'W05', 'years_of_experience is the doctors column name (report typos not copied)',
               EXISTS (SELECT 1 FROM act_cols WHERE tbl = 'doctors' AND col = 'years_of_experience')
               AND NOT EXISTS (SELECT 1 FROM act_cols WHERE col IN ('years_of_experince', 'bioghraphy', 'chang_type')),
               NULL
        UNION ALL SELECT 'W06', 'primary keys and unique constraints match exactly (10)',
               NOT EXISTS (SELECT * FROM act_con EXCEPT SELECT * FROM exp_con)
               AND NOT EXISTS (SELECT * FROM exp_con EXCEPT SELECT * FROM act_con),
               (SELECT count(*) || ' PK/UNIQUE constraints' FROM act_con)
        UNION ALL SELECT 'W07', 'foreign keys intact: correct tables and columns, RESTRICT on delete except pending_changes.specialty_id CASCADE, NO ACTION on update, not deferrable, validated',
               NOT EXISTS (SELECT * FROM act_fk EXCEPT SELECT * FROM exp_fk)
               AND NOT EXISTS (SELECT * FROM exp_fk EXCEPT SELECT * FROM act_fk),
               (SELECT string_agg(conname || ':' || del, ' ' ORDER BY conname) FROM act_fk)
        UNION ALL SELECT 'W08', 'exactly 26 CHECK constraints: the 25 approved in 1B-2a plus pending_changes_new_data_whitelist_ck, all validated',
               NOT EXISTS (SELECT * FROM act_ck EXCEPT SELECT * FROM exp_ck)
               AND NOT EXISTS (SELECT * FROM exp_ck EXCEPT SELECT * FROM act_ck)
               AND (SELECT count(*) FROM act_ck) = 26
               AND NOT EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace
                                WHERE n.nspname = 'public' AND co.contype = 'c' AND NOT co.convalidated),
               (SELECT count(*) || ' CHECK constraints' FROM act_ck)
        UNION ALL SELECT 'W09', 'constraint-type inventory of public is exactly p=6, u=4, f=7, c=26, n=33 (no exclusion or constraint-trigger constraints)',
               (SELECT string_agg(k.ctype || '=' || k.n, ',' ORDER BY k.ctype)
                  FROM (SELECT co.contype::text AS ctype, count(*) AS n FROM pg_constraint co JOIN pg_namespace n2 ON n2.oid = co.connamespace
                         WHERE n2.nspname = 'public' GROUP BY co.contype) k) = 'c=26,f=7,n=33,p=6,u=4',
               (SELECT string_agg(k.ctype || '=' || k.n, ',' ORDER BY k.ctype)
                  FROM (SELECT co.contype::text AS ctype, count(*) AS n FROM pg_constraint co JOIN pg_namespace n2 ON n2.oid = co.connamespace
                         WHERE n2.nspname = 'public' GROUP BY co.contype) k)
        UNION ALL SELECT 'W10', 'each CHECK definition still contains its approved key tokens (tolerant substring check; exact semantics are proven in W25 and W26 and by t2a_constraints.sql)',
               NOT EXISTS (SELECT 1 FROM ck_tokens t LEFT JOIN act_ck_def d ON d.conname = t.conname WHERE d.def IS NULL OR d.def !~* t.tok),
               (SELECT string_agg(t.conname || ' lacks ' || t.tok, '; ') FROM ck_tokens t LEFT JOIN act_ck_def d ON d.conname = t.conname WHERE d.def IS NULL OR d.def !~* t.tok)
        UNION ALL SELECT 'W11', 'identity: six GENERATED ALWAYS keys, no BY DEFAULT identity or serial default; each sequence integer, start 1, increment 1, min 1, max 2147483647, cache 1, no cycle, owned by its column',
               (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attidentity = 'a') = 6
               AND NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                                WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attidentity = 'd')
               AND NOT EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_class c ON c.oid = d.adrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                                WHERE n.nspname = 'public' AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%')
               AND (SELECT count(*) FROM act_seq) = 6
               AND NOT EXISTS (SELECT tbl, col FROM exp_seq EXCEPT SELECT tbl, col FROM act_seq)
               AND NOT EXISTS (SELECT 1 FROM act_seq WHERE typ IS DISTINCT FROM 'integer' OR start_value IS DISTINCT FROM 1 OR increment_by IS DISTINCT FROM 1
                                  OR min_value IS DISTINCT FROM 1 OR max_value IS DISTINCT FROM 2147483647 OR cache_size IS DISTINCT FROM 1
                                  OR cycle IS DISTINCT FROM false OR owned_seq IS DISTINCT FROM 'public.' || seqname),
               (SELECT string_agg(seqname, ',' ORDER BY seqname) FROM act_seq)
        UNION ALL SELECT 'W12', 'identity sequences are pristine: all six read directly (no NULL ambiguity), never used (is_called false, last_value 1); run as the sequence owner omarsh',
               current_user = 'omarsh'
               AND NOT EXISTS (SELECT 1 FROM tbls WHERE relkind = 'S' AND pg_get_userbyid(relowner) <> current_user)
               AND (SELECT count(*) FROM seq_state) = 6
               AND NOT EXISTS (SELECT 1 FROM seq_state WHERE is_called OR last_value IS DISTINCT FROM 1),
               (SELECT count(*) FILTER (WHERE NOT is_called AND last_value = 1) || ' of ' || count(*) || ' unused' FROM seq_state)
        UNION ALL SELECT 'W13', 'no persistent data: all six tables are empty',
               (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.doctors)
               + (SELECT count(*) FROM public.specialties) + (SELECT count(*) FROM public.appointments)
               + (SELECT count(*) FROM public.pending_changes) = 0,
               NULL
        UNION ALL SELECT 'W14', 'no application triggers (exactly the 28 internal foreign-key triggers = 7 FKs x 4: triggers start in 1B-2c), no rules, no event triggers',
               (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal) = 0
               AND (SELECT count(*) FROM pg_trigger WHERE tgisinternal) = 28
               AND (SELECT count(*) FROM pg_rewrite rw JOIN pg_class c ON c.oid = rw.ev_class JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public') = 0
               AND (SELECT count(*) FROM pg_event_trigger) = 0,
               (SELECT count(*) FILTER (WHERE tgisinternal) || ' internal, ' || count(*) FILTER (WHERE NOT tgisinternal) || ' application' FROM pg_trigger)
        UNION ALL SELECT 'W15', 'index inventory of public is exactly the 16 approved names (10 constraint indexes + the 6 of 003_indexes.sql), in both directions',
               NOT EXISTS (SELECT * FROM act_idx EXCEPT SELECT * FROM exp_idx)
               AND NOT EXISTS (SELECT * FROM exp_idx EXCEPT SELECT * FROM act_idx)
               AND (SELECT count(*) FROM act_idx) = 16,
               (SELECT count(*) || ' indexes' FROM act_idx)
        UNION ALL SELECT 'W16', 'the six new indexes: table, uniqueness, key columns in order, plain btree, valid/ready/live, no expressions or INCLUDE columns, not primary/exclusion/constraint-backed, owner omarsh',
               NOT EXISTS (SELECT idxname, tbl, uniq, cols, props FROM act_newidx EXCEPT SELECT idxname, tbl, uniq, cols, props FROM exp_newidx)
               AND NOT EXISTS (SELECT idxname, tbl, uniq, cols, props FROM exp_newidx EXCEPT SELECT idxname, tbl, uniq, cols, props FROM act_newidx)
               AND (SELECT count(*) FROM act_newidx) = 6,
               (SELECT string_agg(idxname || '(' || cols || ')', ' ' ORDER BY idxname) FROM act_newidx)
        UNION ALL SELECT 'W17', 'partial-index predicates by semantic evaluation (T/F/U truth tables incl. NULL): admin, booked x2, pending-doctor, pending-specialty; doctors_specialty_id_idx has no predicate',
               coalesce((v_sem_ok ->> 'p_admin')::boolean, false) AND coalesce((v_sem_ok ->> 'p_dslot')::boolean, false)
               AND coalesce((v_sem_ok ->> 'p_pslot')::boolean, false) AND coalesce((v_sem_ok ->> 'p_pdoc')::boolean, false)
               AND coalesce((v_sem_ok ->> 'p_pspec')::boolean, false)
               AND (SELECT count(*) FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
                     WHERE ic.relnamespace = 'public'::regnamespace AND ic.relname = 'doctors_specialty_id_idx' AND i.indpred IS NULL) = 1
               AND (SELECT count(*) FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid
                     WHERE t.relnamespace = 'public'::regnamespace AND i.indpred IS NOT NULL) = 5,
               'admin ' || coalesce(v_sem_det ->> 'p_admin', 'n/a') || '; dslot ' || coalesce(v_sem_det ->> 'p_dslot', 'n/a') || '; pslot ' || coalesce(v_sem_det ->> 'p_pslot', 'n/a')
               || '; pdoc ' || coalesce(v_sem_det ->> 'p_pdoc', 'n/a') || '; pspec ' || coalesce(v_sem_det ->> 'p_pspec', 'n/a')
        UNION ALL SELECT 'W18', 'constraint-backed indexes (10) are distinct from the standalone ones: the standalone set is exactly the six new indexes (5 unique + 1 non-unique), none referenced by a constraint, and all 16 indexes are valid, ready and live',
               (SELECT count(DISTINCT c.conindid) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
                 WHERE n.nspname = 'public' AND c.contype IN ('p', 'u')) = 10
               AND NOT EXISTS (SELECT idxname FROM act_standalone EXCEPT SELECT idxname FROM exp_standalone)
               AND NOT EXISTS (SELECT idxname FROM exp_standalone EXCEPT SELECT idxname FROM act_standalone)
               AND (SELECT count(*) FROM act_standalone WHERE uniq) = 5 AND (SELECT count(*) FROM act_standalone WHERE NOT uniq) = 1
               AND NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class ic ON ic.oid = c.conindid WHERE ic.relname IN (SELECT idxname FROM exp_standalone))
               AND NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
                                WHERE n.nspname = 'public' AND NOT (i.indisvalid AND i.indisready AND i.indislive)),
               (SELECT count(*) FILTER (WHERE uniq) || ' unique + ' || count(*) FILTER (WHERE NOT uniq) || ' non-unique standalone' FROM act_standalone)
        UNION ALL SELECT 'W19', 'function inventory: exactly the seven approved functions in public (name and argument types, both directions) and no other function, procedure or aggregate outside the system schemas',
               NOT EXISTS (SELECT fname, fargs FROM act_fn EXCEPT SELECT fname, fargs FROM exp_fn)
               AND NOT EXISTS (SELECT fname, fargs FROM exp_fn EXCEPT SELECT fname, fargs FROM act_fn)
               AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')) = 7
               AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind <> 'f') = 0,
               (SELECT string_agg(fname, ',' ORDER BY fname) FROM act_fn)
        UNION ALL SELECT 'W20', 'function attributes: return type, language, volatility, strictness and parallel safety match the approved definitions (clinic_local and pending_execute_at STABLE STRICT, pending_new_data_valid IMMUTABLE, lock_* VOLATILE, appointment_rule_violation STABLE)',
               NOT EXISTS (SELECT * FROM act_fn EXCEPT SELECT * FROM exp_fn)
               AND NOT EXISTS (SELECT * FROM exp_fn EXCEPT SELECT * FROM act_fn),
               (SELECT string_agg(fname || ':' || fvol || ':' || fpar, ' ' ORDER BY fname) FROM act_fn)
        UNION ALL SELECT 'W21', 'all seven functions: ordinary functions, not set-returning, SECURITY INVOKER, not leakproof, no defaults or variadics, owner omarsh, search_path exactly pg_catalog, pg_temp, not owned by an extension',
               (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.prokind = 'f' AND NOT p.proretset AND NOT p.prosecdef AND NOT p.proleakproof
                   AND p.pronargdefaults = 0 AND p.provariadic = 0 AND pg_get_userbyid(p.proowner) = 'omarsh'
                   AND p.proconfig IS NOT NULL AND cardinality(p.proconfig) = 1
                   AND replace(p.proconfig[1], ' ', '') = 'search_path=pg_catalog,pg_temp'
                   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')) = 7,
               (SELECT string_agg(p.proname || ':' || coalesce(array_to_string(p.proconfig, '|'), 'no config'), ' ' ORDER BY p.proname)
                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
        UNION ALL SELECT 'W22', 'function privileges at 1B-2b: no explicit GRANT or REVOKE (proacl IS NULL for all seven, no default ACLs configured); the PostgreSQL default PUBLIC EXECUTE still applies until 1B-2e, so it is reported, not asserted absent',
               (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proacl IS NULL) = 7
               AND (SELECT count(*) FROM pg_default_acl) = 0
               AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                WHERE n.nspname = 'public' AND NOT has_function_privilege('omarsh', p.oid, 'EXECUTE')),
               'afiyah_app effective EXECUTE (via the PUBLIC default): '
               || (SELECT count(*) FILTER (WHERE has_function_privilege('afiyah_app', p.oid, 'EXECUTE')) || '/' || count(*)
                     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
        UNION ALL SELECT 'W23', 'helper functions behave as specified on fixed inputs (clinic_local, pending_execute_at, pending_new_data_valid, appointment_rule_violation AF110/AF102; lock functions are not called)',
               v_beh IS NOT NULL AND v_beh = '' AND v_beh_err IS NULL,
               CASE WHEN v_beh_err IS NOT NULL THEN 'ERROR: ' || v_beh_err WHEN v_beh <> '' THEN 'failed: ' || v_beh ELSE NULL END
        UNION ALL SELECT 'W24', 'pending_changes_new_data_whitelist_ck: a validated CHECK on pending_changes that depends on public.pending_new_data_valid',
               (SELECT count(*) FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
                 WHERE n.nspname = 'public' AND cl.relname = 'pending_changes' AND co.conname = 'pending_changes_new_data_whitelist_ck'
                   AND co.contype = 'c' AND co.convalidated AND co.conislocal) = 1
               AND (SELECT count(*) FROM pg_depend d
                      JOIN pg_constraint co ON co.oid = d.objid AND d.classid = 'pg_constraint'::regclass
                      JOIN pg_proc p ON p.oid = d.refobjid AND d.refclassid = 'pg_proc'::regclass
                      JOIN pg_namespace pn ON pn.oid = p.pronamespace
                     WHERE co.conname = 'pending_changes_new_data_whitelist_ck' AND p.proname = 'pending_new_data_valid' AND pn.nspname = 'public') >= 1,
               NULL
        UNION ALL SELECT 'W25', 'whitelist constraint semantics by evaluating its own expression on a 13-row truth table (valid and invalid keys and values for doctor and specialty targets, delete, NULL, empty, non-object, NULL change_type -> unknown)',
               coalesce((v_sem_ok ->> 'c_wl')::boolean, false),
               v_sem_det ->> 'c_wl'
        UNION ALL SELECT 'W26', 'execute_at CHECK semantics by evaluating its own expression on a 12-row truth table (14 Damascus calendar days at local midnight accepted; +336 h, UTC midnight, 13/15 days, UTC-date mistake rejected; NULL -> unknown)',
               coalesce((v_sem_ok ->> 'c_exec')::boolean, false),
               v_sem_det ->> 'c_exec'
        UNION ALL SELECT 'W27', 'time zone database knows Asia/Damascus',
               (SELECT count(*) FROM pg_timezone_names WHERE name = 'Asia/Damascus') = 1,
               NULL
        UNION ALL SELECT 'W28', 'Damascus offsets: historical EET/EEST fixtures incl. exact transition instants, and +03:00 for the post-change fixtures',
               coalesce(v_tzres -> 'base' ->> 'off_fail', 'ERR') = '',
               coalesce(NULLIF(v_tzres -> 'base' ->> 'off_fail', ''), v_tzerr)
        UNION ALL SELECT 'W29', '14 Damascus calendar days at local midnight: 12 fixtures (DST start and end inside the window, repeated hour, post-change, boundaries, year, month and leap-year crossings; the DST-crossing ones differ from created + 336 hours)',
               coalesce(v_tzres -> 'base' ->> 'exec_fail', 'ERR') = '',
               coalesce(NULLIF(v_tzres -> 'base' ->> 'exec_fail', ''), v_tzerr)
        UNION ALL SELECT 'W30', 'post-change period 2022-11-01..2035-12-31: fixed +03:00, pending_execute_at equals the CHECK formula, local midnight, exactly 14 calendar days (about 16000 instants)',
               coalesce(v_tzres -> 'base' ->> 'post_fail', 'ERR') = '',
               coalesce(NULLIF(v_tzres -> 'base' ->> 'post_fail', ''), v_tzerr)
        UNION ALL SELECT 'W31', 'historical period 2020-01-01..2022-03-24: pending_execute_at equals the CHECK formula and is exactly 14 calendar days later (local midnight except the three midnight-transition days)',
               coalesce(v_tzres -> 'base' ->> 'hist_fail', 'ERR') = '',
               coalesce(NULLIF(v_tzres -> 'base' ->> 'hist_fail', ''), v_tzerr)
        UNION ALL SELECT 'W32', 'W28-W31 results are identical under a session TimeZone of America/Los_Angeles',
               coalesce(v_tzres -> 'la' ->> 'off_fail', 'ERR') = '' AND coalesce(v_tzres -> 'la' ->> 'exec_fail', 'ERR') = ''
               AND coalesce(v_tzres -> 'la' ->> 'post_fail', 'ERR') = '' AND coalesce(v_tzres -> 'la' ->> 'hist_fail', 'ERR') = '',
               coalesce(v_tzres -> 'la' ->> 'off_fail' || '/' || (v_tzres -> 'la' ->> 'exec_fail'), v_tzerr)
        UNION ALL SELECT 'W33', 'W28-W31 results are identical under a session TimeZone of Asia/Tokyo, and the original session TimeZone was restored',
               coalesce(v_tzres -> 'tk' ->> 'off_fail', 'ERR') = '' AND coalesce(v_tzres -> 'tk' ->> 'exec_fail', 'ERR') = ''
               AND coalesce(v_tzres -> 'tk' ->> 'post_fail', 'ERR') = '' AND coalesce(v_tzres -> 'tk' ->> 'hist_fail', 'ERR') = ''
               AND v_tz_after = v_tz0,
               coalesce(v_tzres -> 'tk' ->> 'off_fail' || '/' || (v_tzres -> 'tk' ->> 'exec_fail'), v_tzerr) || '; session TimeZone ' || v_tz_after
        UNION ALL SELECT 'W34', 'all tables, sequences, indexes and functions are owned by omarsh',
               NOT EXISTS (SELECT 1 FROM tbls WHERE relkind IN ('r','S','i') AND pg_get_userbyid(relowner) <> 'omarsh')
               AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> 'omarsh'),
               NULL
        UNION ALL SELECT 'W35', 'no table or sequence grants exist (relacl is NULL), and afiyah_app holds no table or sequence privilege',
               NOT EXISTS (SELECT 1 FROM tbls WHERE relacl IS NOT NULL)
               AND NOT EXISTS (SELECT 1 FROM tbls t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
                                WHERE t.relkind = 'r' AND has_table_privilege('afiyah_app', t.oid, p))
               AND NOT EXISTS (SELECT 1 FROM tbls t CROSS JOIN unnest(ARRAY['SELECT','USAGE','UPDATE']) p
                                WHERE t.relkind = 'S' AND has_sequence_privilege('afiyah_app', t.oid, p)),
               NULL
        UNION ALL SELECT 'W36', 'schema public ACL unchanged from the baseline (PUBLIC USAGE still present: revoked later in 1B-2e)',
               (SELECT nspacl::text FROM pg_namespace WHERE nspname = 'public') = '{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}',
               (SELECT nspacl::text FROM pg_namespace WHERE nspname = 'public')
        UNION ALL SELECT 'W37', 'database ACLs of afiyah_dev and afiyah_test unchanged (CONNECT only for afiyah_app) and no default privileges configured',
               (SELECT count(*) FROM pg_database WHERE datname IN ('afiyah_dev','afiyah_test') AND datacl::text = '{omarsh=CTc/omarsh,afiyah_app=c/omarsh}') = 2
               AND (SELECT count(*) FROM pg_default_acl) = 0,
               (SELECT string_agg(datname || '=' || datacl::text, ' ' ORDER BY datname) FROM pg_database WHERE datname LIKE 'afiyah_%')
        UNION ALL SELECT 'W38', 'roles unchanged (only afiyah_app, omarsh, postgres; no memberships); afiyah_app attributes and role settings unchanged',
               (SELECT array_agg(rolname::text ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_') = ARRAY['afiyah_app','omarsh','postgres']
               AND (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r2 ON r2.oid = m.roleid WHERE r2.rolname !~ '^pg_') = 0
               AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afiyah_app' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
                              AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit = 20)
               AND EXISTS (SELECT 1 FROM pg_db_role_setting s2 JOIN pg_roles r3 ON r3.oid = s2.setrole
                            WHERE r3.rolname = 'afiyah_app' AND s2.setdatabase = 0
                              AND s2.setconfig @> ARRAY['lock_timeout=5s','idle_in_transaction_session_timeout=30s']),
               (SELECT string_agg(rolname, ',' ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')
        UNION ALL SELECT 'W39', 'database-level time zone setting for afiyah_test is UTC (read from the catalog, independent of the session)',
               EXISTS (SELECT 1 FROM pg_db_role_setting s3 JOIN pg_database d ON d.oid = s3.setdatabase
                        WHERE d.datname = 'afiyah_test' AND s3.setrole = 0 AND s3.setconfig @> ARRAY['TimeZone=UTC']),
               'session TimeZone=' || v_tz0
        UNION ALL SELECT 'W40', 'tables are permanent, not partitioned, and have row-level security off',
               NOT EXISTS (SELECT 1 FROM tbls WHERE relkind = 'r' AND (relpersistence <> 'p' OR relrowsecurity OR relforcerowsecurity OR relispartition)),
               NULL
        UNION ALL SELECT 'W41', 'no extensions beyond plpgsql; no custom enum, domain, range or multirange types; no operators, user casts, policies, extended statistics or collations in public',
               (SELECT array_agg(extname::text ORDER BY extname) FROM pg_extension) = ARRAY['plpgsql']
               AND NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e','d','r','m'))
               AND (SELECT count(*) FROM pg_operator o JOIN pg_namespace n ON n.oid = o.oprnamespace WHERE n.nspname = 'public') = 0
               AND (SELECT count(*) FROM pg_cast WHERE oid >= 16384) = 0
               AND (SELECT count(*) FROM pg_policy) = 0
               AND (SELECT count(*) FROM pg_statistic_ext e JOIN pg_namespace n ON n.oid = e.stxnamespace WHERE n.nspname = 'public') = 0
               AND (SELECT count(*) FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname = 'public') = 0,
               NULL
        UNION ALL SELECT 'W42', 'execution context: afiyah_test as omarsh (session and current user), PostgreSQL 18, transaction is READ ONLY',
               current_database() = 'afiyah_test' AND current_user = 'omarsh' AND session_user = 'omarsh'
               AND current_setting('transaction_read_only') = 'on' AND current_setting('server_version_num')::int / 10000 = 18,
               current_setting('server_version')
    )
    SELECT * FROM checks ORDER BY id
    LOOP
        v_total := v_total + 1;
        IF chk.ok IS TRUE THEN
            RAISE NOTICE 'PASS  %  %', chk.id, chk.descr || CASE WHEN chk.detail IS NOT NULL THEN '  [' || chk.detail || ']' ELSE '' END;
        ELSE
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  %', chk.id, chk.descr || CASE WHEN chk.detail IS NOT NULL THEN '  [' || chk.detail || ']' ELSE '' END;
        END IF;
    END LOOP;

    RAISE NOTICE 'VERIFY 2b: %/% checks passed, % failed', v_total - v_fail, v_total, v_fail;
    IF v_total <> v_expect THEN
        RAISE EXCEPTION 'verify_2b: expected exactly % checks (W01-W42), ran %', v_expect, v_total;
    END IF;
    IF v_fail > 0 THEN
        RAISE EXCEPTION '% verification check(s) failed', v_fail;
    END IF;
END $v$;

ROLLBACK;
