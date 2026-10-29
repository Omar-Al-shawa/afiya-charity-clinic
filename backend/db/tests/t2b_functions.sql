-- اختبارات المرحلة 1B-2b: الدوال المساعدة وقيد القائمة البيضاء (afiyah_test فقط). تُشغَّل بعد 002_functions.sql.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f t2b_functions.sql
--
-- *** تحذير: لا يجوز تشغيل هذا الملف كاملاً بعد تثبيت مشغّلات المرحلة 1B-2c. ***
-- *** DO NOT RUN THIS FILE AFTER THE STAGE 1B-2C TRIGGERS ARE INSTALLED. ***
-- السبب: يتضمن بيانات تجهيز غير صالحة عمداً (الحجز A9005 يقع في يوم يسري فيه تغيير معلّق، وتواريخ التجهيز مرتبطة بساعة محقونة لا بساعة الخادم)،
-- فمشغّل الحجز في 1B-2c سيرفض صفوف التجهيز نفسها قبل أي اختبار. بعد 1B-2c تلزم اختبارات جديدة خاصة بتلك المرحلة.
-- هذا الملف صالح لحالة المخطط في نهاية 1B-2b فقط (قبل أي مشغّل).
--
-- كل حالة تُنفَّذ داخل معاملة فرعية تُتراجع دائماً، وكل الملف داخل معاملة تنتهي بـ ROLLBACK (لا يبقى أي صف).
-- المعرّفات صريحة (OVERRIDING SYSTEM VALUE) فلا تُستهلك قيم الهوية، ولا يُستعمل أي استدعاء لدوال التسلسلات؛ وفي النهاية يتحقق الاختبار أن التسلسلات الستة لم تُستعمل (X01).
-- الأقفال الاستشارية تُؤخذ داخل المعاملة الفرعية فتُحرَّر عند تراجعها؛ كل حالة LK تتحقق من العدد الكلي لأقفال الجلسة الاستشارية (لا من القفل المقصود فقط)
-- فيُكتشف أي قفل متسرِّب من حالة سابقة؛ LK00 و LK12 يتحققان من الصفر في بداية مجموعة LK ونهايتها، و X02 قبل ROLLBACK النهائي.
-- اختبارات الجلستين في concurrency/t2b_locks.sh.
-- صيغة النتيجة المتوقعة: OK = نجاح (والتحقق chk إن وُجد يرجع true)، أو SQLSTATE، أو SQLSTATE:اسم1|اسم2 (اسم القيد، أو اسم العمود لـ 23502).
-- المرحلة الثانية (V...) جدولية: كل صف يستدعي appointment_rule_violation بوسائط صريحة ويقارن الرمز المُعاد (NULL = صالح) بالمتوقع.
-- بيانات V تحترم الفهارس الفريدة في 003_indexes.sql أيضاً (لا حجزان قائمان بنفس الطبيب والوقت ولا بنفس المريض والوقت، وطلب معلّق واحد لكل هدف)،
-- فيمكن إعادة تشغيل الملف بعد تطبيق الفهارس (وقبل مشغّلات 1B-2c فقط).
\ir ../_guard.sql

BEGIN;

DO $pre$
BEGIN
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('clinic_local', 'pending_execute_at', 'pending_new_data_valid', 'lock_specialty',
                             'lock_doctor', 'lock_patient', 'appointment_rule_violation')) <> 7 THEN
        RAISE EXCEPTION 'precondition failed: the seven helper functions do not exist (apply 002_functions.sql first)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.pending_changes'::regclass
                      AND conname = 'pending_changes_new_data_whitelist_ck') THEN
        RAISE EXCEPTION 'precondition failed: pending_changes_new_data_whitelist_ck does not exist';
    END IF;
    IF (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.doctors)
       + (SELECT count(*) FROM public.specialties) + (SELECT count(*) FROM public.appointments)
       + (SELECT count(*) FROM public.pending_changes) > 0 THEN
        RAISE EXCEPTION 'precondition failed: tables must be empty (fixtures use fixed ids)';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL) THEN
        RAISE EXCEPTION 'precondition failed: identity sequences are already in use';
    END IF;
END $pre$;

DO $t$
DECLARE
    r        record;
    vc       record;
    g        record;
    v_state  text;
    v_con    text;
    v_col    text;
    v_bool   boolean;
    v_obj    text;
    v_ok     boolean;
    v_grp    text;
    v_code   text;
    v_n      jsonb := '{}';
    v_p      jsonb := '{}';
    v_total  int := 0;
    v_fail   int := 0;
BEGIN
    -- بيانات تجريبية بمعرّفات صريحة. الأطباء: D1 9001 (20 د) D2 9002 (30 د) D3 9003 (حسابه غير نشط) D4 9004 (25 د) D5 9005 (480 د)
    -- D6 9006 (20 د) D7 9007 (30 د، بلا أي تغيير معلّق) D8 9008 (30 د). المرضى: P1 9001 P2 9002 P3 9003.
    INSERT INTO public.users (user_id, email, password_hash, role, is_active) OVERRIDING SYSTEM VALUE VALUES
        (9101, 'p1@t2b.local', 'h', 'patient', true),
        (9102, 'p2@t2b.local', 'h', 'patient', true),
        (9103, 'p3@t2b.local', 'h', 'patient', true),
        (9201, 'd1@t2b.local', 'h', 'doctor', true),
        (9202, 'd2@t2b.local', 'h', 'doctor', true),
        (9203, 'd3@t2b.local', 'h', 'doctor', false),
        (9204, 'd4@t2b.local', 'h', 'doctor', true),
        (9205, 'd5@t2b.local', 'h', 'doctor', true),
        (9206, 'd6@t2b.local', 'h', 'doctor', true),
        (9207, 'd7@t2b.local', 'h', 'doctor', true),
        (9208, 'd8@t2b.local', 'h', 'doctor', true);
    INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES
        (9001, 't2b-s1', 20), (9002, 't2b-s2', 30), (9003, 't2b-s3', 25), (9004, 't2b-s4', 480);
    INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, address, gender, blood_type) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9101, 'P', 'One',   '0911111111', '1990-01-01', NULL, 'male', NULL),
        (9002, 9102, 'P', 'Two',   '0911111112', '1990-01-02', NULL, 'female', NULL),
        (9003, 9103, 'P', 'Three', '0911111113', '1990-01-03', NULL, 'male', NULL);
    INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone, image_url, biography, years_of_experience) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9201, 9001, 'D', 'One',   '1980-01-01', '0922222221', NULL, NULL, NULL),
        (9002, 9202, 9002, 'D', 'Two',   '1980-01-02', '0922222222', NULL, NULL, NULL),
        (9003, 9203, 9001, 'D', 'Three', '1980-01-03', '0922222223', NULL, NULL, NULL),
        (9004, 9204, 9003, 'D', 'Four',  '1980-01-04', '0922222224', NULL, NULL, NULL),
        (9005, 9205, 9004, 'D', 'Five',  '1980-01-05', '0922222225', NULL, NULL, NULL),
        (9006, 9206, 9001, 'D', 'Six',   '1980-01-06', '0922222226', NULL, NULL, NULL),
        (9007, 9207, 9002, 'D', 'Seven', '1980-01-07', '0922222227', NULL, NULL, NULL),
        (9008, 9208, 9002, 'D', 'Eight', '1980-01-08', '0922222228', NULL, NULL, NULL);
    -- حجوزات: D1 يوم 2 تشرين الثاني 10:00 للمريض P2؛ D2 يوم 3 10:00 للمريض P1؛ حجزان ملغيان يوم 4؛ والحجز A9005 المبيَّن أدناه.
    INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time, status) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9002, 9001, '2026-11-02', '10:00', 'booked'),
        (9002, 9001, 9002, '2026-11-03', '10:00', 'booked'),
        (9003, 9002, 9001, '2026-11-04', '10:00', 'cancelled'),
        (9004, 9002, 9002, '2026-11-04', '11:00', 'cancelled'),
        -- A9005: حجز غير صالح عمداً (INTENTIONALLY INVALID booking fixture)، وُضع حصراً لاختبار أسبقية رمز AF106 على AF107 في الحالة V095.
        -- يسري يوم 9 تشرين الثاني تغيير معلّق على اختصاص D6 (الطلب 9005)، فكان مشغّل الحجز في 1B-2c سيرفض هذا الصف؛ يُقبل هنا لأن المشغّلات غير موجودة بعد.
        -- لا يجوز تشغيل هذا الملف بعد تثبيت مشغّلات 1B-2c. تحقّقنا أنه يحقق قيود 1B-2a والفهارس الفريدة المخطَّطة ولا يغيّر نتيجة أي حالة أخرى.
        (9005, 9003, 9006, '2026-11-09', '10:00', 'booked');
    -- تغييرات معلّقة (كل زوج created_at/execute_at يطابق صيغة القيد): D4 طبيب يسري 13 ت2 (جمعة)؛ S3 اختصاص يسري 15 ت2؛ S4 يسري 11 ت2؛
    -- D6 طبيب يسري 12 ت2؛ S1 يسري 9 ت2؛ D8 حذف مستحق غير منفَّذ (يسري 24 ت1)؛ D2 صفوف منفَّذ وملغى وفاشل لا تقيّد شيئاً.
    INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9004, NULL, 'update', '{"phone":"0911111111"}',          'pending',   NULL, '2026-10-30 12:00+03', '2026-11-13 00:00+03'),
        (9002, NULL, 9003, 'update', '{"appointment_duration":30}',     'pending',   NULL, '2026-11-01 07:00+03', '2026-11-15 00:00+03'),
        (9003, NULL, 9004, 'update', '{"appointment_duration":480}',    'pending',   NULL, '2026-10-28 09:00+03', '2026-11-11 00:00+03'),
        (9004, 9006, NULL, 'update', '{"biography":"x"}',               'pending',   NULL, '2026-10-29 10:00+03', '2026-11-12 00:00+03'),
        (9005, NULL, 9001, 'update', '{"specialty_name":"renamed"}',    'pending',   NULL, '2026-10-26 10:00+03', '2026-11-09 00:00+03'),
        (9006, 9008, NULL, 'delete', NULL,                              'pending',   NULL, '2026-10-10 09:00+03', '2026-10-24 00:00+03'),
        (9007, 9002, NULL, 'update', '{"phone":"0933333331"}',          'executed',  NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (9008, 9002, NULL, 'update', '{"phone":"0933333332"}',          'cancelled', NULL, '2026-10-01 10:30+03', '2026-10-15 00:00+03'),
        (9009, 9002, NULL, 'update', '{"phone":"0933333333"}',          'failed',    'x',  '2026-10-01 10:30+03', '2026-10-15 00:00+03');

    FOR r IN
        SELECT * FROM (VALUES
        -- ===== CL: clinic_local =====
        ('CL01 21:00:00Z is already the next day in Damascus', NULL, $c$SELECT public.clinic_local(timestamptz '2026-11-01 21:00:00+00') = timestamp '2026-11-02 00:00:00'$c$, 'OK'),
        ('CL02 20:59:59.999999Z is still the same day', NULL, $c$SELECT public.clinic_local(timestamptz '2026-11-01 20:59:59.999999+00') = timestamp '2026-11-01 23:59:59.999999'$c$, 'OK'),
        ('CL03 January is UTC+3', NULL, $c$SELECT public.clinic_local(timestamptz '2026-01-15 12:00+00') = timestamp '2026-01-15 15:00:00'$c$, 'OK'),
        ('CL04 July is UTC+3', NULL, $c$SELECT public.clinic_local(timestamptz '2026-07-15 12:00+00') = timestamp '2026-07-15 15:00:00'$c$, 'OK'),
        ('CL05 canary 2037 is UTC+3', NULL, $c$SELECT public.clinic_local(timestamptz '2037-07-01 12:00+00') = timestamp '2037-07-01 15:00:00'$c$, 'OK'),
        ('CL06 canary 2045 is UTC+3', NULL, $c$SELECT public.clinic_local(timestamptz '2045-07-01 12:00+00') = timestamp '2045-07-01 15:00:00'$c$, 'OK'),
        ('CL07 independent of a session TimeZone of America/Los_Angeles', $q$SET LOCAL timezone = 'America/Los_Angeles'$q$, $c$SELECT public.clinic_local(timestamptz '2026-11-01 21:00:00+00') = timestamp '2026-11-02 00:00:00'$c$, 'OK'),
        ('CL08 independent of a session TimeZone of Asia/Tokyo', $q$SET LOCAL timezone = 'Asia/Tokyo'$q$, $c$SELECT public.clinic_local(timestamptz '2026-11-01 20:59:59+00') = timestamp '2026-11-01 23:59:59'$c$, 'OK'),
        ('CL09 NULL in, NULL out', NULL, $c$SELECT public.clinic_local(NULL::timestamptz) IS NULL$c$, 'OK'),
        ('CL10 returns timestamp without time zone', NULL, $c$SELECT pg_typeof(public.clinic_local(now())) = 'timestamp without time zone'::regtype$c$, 'OK'),

        -- ===== PE: pending_execute_at =====
        ('PE01 10:30 Damascus on 1 Oct', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 10:30+03') = timestamptz '2026-10-15 00:00+03'$c$, 'OK'),
        ('PE02 exactly 00:00:00 Damascus on 1 Oct', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 00:00:00+03') = timestamptz '2026-10-15 00:00+03'$c$, 'OK'),
        ('PE03 23:59:59.999999 Damascus on 1 Oct', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 23:59:59.999999+03') = timestamptz '2026-10-15 00:00+03'$c$, 'OK'),
        ('PE04 exactly 00:00:00 Damascus on 2 Oct', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-02 00:00:00+03') = timestamptz '2026-10-16 00:00+03'$c$, 'OK'),
        ('PE05 20:59:59 UTC is 23:59:59 Damascus on 1 Oct', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 20:59:59+00') = timestamptz '2026-10-15 00:00+03'$c$, 'OK'),
        ('PE06 21:00:00 UTC is already 2 Oct in Damascus', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 21:00:00+00') = timestamptz '2026-10-16 00:00+03'$c$, 'OK'),
        ('PE07 year crossing 25 Dec to 8 Jan', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-12-25 12:00+03') = timestamptz '2027-01-08 00:00+03'$c$, 'OK'),
        ('PE08 month crossing 20 Feb to 6 Mar (2026)', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-02-20 01:00+03') = timestamptz '2026-03-06 00:00+03'$c$, 'OK'),
        ('PE09 leap year 20 Feb to 5 Mar (2028)', NULL, $c$SELECT public.pending_execute_at(timestamptz '2028-02-20 12:00+03') = timestamptz '2028-03-05 00:00+03'$c$, 'OK'),
        ('PE10 summer date 30 Jun to 14 Jul', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-06-30 12:00+03') = timestamptz '2026-07-14 00:00+03'$c$, 'OK'),
        ('PE11 created_at given in UTC (07:30Z = 10:30 Damascus)', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 07:30:00+00') = timestamptz '2026-10-15 00:00+03'$c$, 'OK'),
        ('PE12 it is not created + 336 hours', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 10:30+03') <> timestamptz '2026-10-15 10:30+03'$c$, 'OK'),
        ('PE13 it is not midnight of day 15', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 10:30+03') <> timestamptz '2026-10-16 00:00+03'$c$, 'OK'),
        ('PE14 it is not UTC midnight', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 10:30+03') <> timestamptz '2026-10-15 00:00+00'$c$, 'OK'),
        ('PE15 crossing the 21:00Z boundary moves the result by exactly 24 hours', NULL, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 21:00:00+00') - public.pending_execute_at(timestamptz '2026-10-01 20:59:59+00') = interval '24 hours'$c$, 'OK'),
        ('PE16 NULL in, NULL out', NULL, $c$SELECT public.pending_execute_at(NULL::timestamptz) IS NULL$c$, 'OK'),
        ('PE17 equals the inline CHECK formula for about 19000 instants from 2020 to 2035', NULL, $c$SELECT NOT EXISTS (SELECT 1 FROM generate_series(timestamptz '2020-01-01 00:00+00', timestamptz '2035-12-31 00:00+00', interval '7 hours 13 minutes') gs(t) WHERE public.pending_execute_at(gs.t) IS DISTINCT FROM ((date_trunc('day', gs.t AT TIME ZONE 'Asia/Damascus') + interval '14 days') AT TIME ZONE 'Asia/Damascus'))$c$, 'OK'),
        ('PE18 from 2022-11-01 the result is exactly Damascus midnight, 14 calendar days later (older dates cross daylight-saving changes)', NULL, $c$SELECT NOT EXISTS (SELECT 1 FROM generate_series(timestamptz '2022-11-01 00:00+00', timestamptz '2035-12-31 00:00+00', interval '7 hours 13 minutes') gs(t) WHERE NOT (public.clinic_local(public.pending_execute_at(gs.t))::time = time '00:00' AND public.clinic_local(public.pending_execute_at(gs.t))::date - public.clinic_local(gs.t)::date = 14))$c$, 'OK'),
        ('PE19 independent of a session TimeZone of America/Los_Angeles', $q$SET LOCAL timezone = 'America/Los_Angeles'$q$, $c$SELECT public.pending_execute_at(timestamptz '2026-10-01 21:00:00+00') = timestamptz '2026-10-16 00:00+03'$c$, 'OK'),
        ('PE20 returns timestamptz', NULL, $c$SELECT pg_typeof(public.pending_execute_at(now())) = 'timestamp with time zone'::regtype$c$, 'OK'),

        -- ===== DJ: pending_new_data_valid, doctor target (true) =====
        ('DJ01 first_name string', NULL, $c$SELECT public.pending_new_data_valid(true, '{"first_name":"A"}'::jsonb)$c$, 'OK'),
        ('DJ02 last_name string', NULL, $c$SELECT public.pending_new_data_valid(true, '{"last_name":"B"}'::jsonb)$c$, 'OK'),
        ('DJ03 phone string', NULL, $c$SELECT public.pending_new_data_valid(true, '{"phone":"0911111111"}'::jsonb)$c$, 'OK'),
        ('DJ04 email string', NULL, $c$SELECT public.pending_new_data_valid(true, '{"email":"a@b.c"}'::jsonb)$c$, 'OK'),
        ('DJ05 birth_date string', NULL, $c$SELECT public.pending_new_data_valid(true, '{"birth_date":"1980-01-01"}'::jsonb)$c$, 'OK'),
        ('DJ06 image_url string', NULL, $c$SELECT public.pending_new_data_valid(true, '{"image_url":"/i.png"}'::jsonb)$c$, 'OK'),
        ('DJ07 image_url null', NULL, $c$SELECT public.pending_new_data_valid(true, '{"image_url":null}'::jsonb)$c$, 'OK'),
        ('DJ08 biography string', NULL, $c$SELECT public.pending_new_data_valid(true, '{"biography":"x"}'::jsonb)$c$, 'OK'),
        ('DJ09 biography null', NULL, $c$SELECT public.pending_new_data_valid(true, '{"biography":null}'::jsonb)$c$, 'OK'),
        ('DJ10 years_of_experience 5', NULL, $c$SELECT public.pending_new_data_valid(true, '{"years_of_experience":5}'::jsonb)$c$, 'OK'),
        ('DJ11 years_of_experience null', NULL, $c$SELECT public.pending_new_data_valid(true, '{"years_of_experience":null}'::jsonb)$c$, 'OK'),
        ('DJ12 years_of_experience 5.0 (whole by value)', NULL, $c$SELECT public.pending_new_data_valid(true, '{"years_of_experience":5.0}'::jsonb)$c$, 'OK'),
        ('DJ13 all eight keys together', NULL, $c$SELECT public.pending_new_data_valid(true, '{"first_name":"A","last_name":"B","birth_date":"1980-01-01","phone":"0911111111","image_url":null,"biography":"x","years_of_experience":3,"email":"a@b.c"}'::jsonb)$c$, 'OK'),
        ('DJ14 years_of_experience 0', NULL, $c$SELECT public.pending_new_data_valid(true, '{"years_of_experience":0}'::jsonb)$c$, 'OK'),
        ('DJ15 years_of_experience 2147483647', NULL, $c$SELECT public.pending_new_data_valid(true, '{"years_of_experience":2147483647}'::jsonb)$c$, 'OK'),
        ('DJ20 unknown key role', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"role":"admin"}'::jsonb)$c$, 'OK'),
        ('DJ21 forbidden key is_active', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"is_active":false}'::jsonb)$c$, 'OK'),
        ('DJ22 forbidden key specialty_id', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"specialty_id":2}'::jsonb)$c$, 'OK'),
        ('DJ23 forbidden key user_id', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"user_id":2}'::jsonb)$c$, 'OK'),
        ('DJ24 forbidden key password_hash', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"password_hash":"x"}'::jsonb)$c$, 'OK'),
        ('DJ25 forbidden key doctor_id', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"doctor_id":1}'::jsonb)$c$, 'OK'),
        ('DJ26 forbidden key status', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"status":"x"}'::jsonb)$c$, 'OK'),
        ('DJ27 key case differs (Phone)', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"Phone":"x"}'::jsonb)$c$, 'OK'),
        ('DJ28 specialty key on a doctor target', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"appointment_duration":30}'::jsonb)$c$, 'OK'),
        ('DJ29 first_name null (required)', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"first_name":null}'::jsonb)$c$, 'OK'),
        ('DJ30 last_name number', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"last_name":5}'::jsonb)$c$, 'OK'),
        ('DJ31 phone boolean', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"phone":true}'::jsonb)$c$, 'OK'),
        ('DJ32 email array', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"email":["a"]}'::jsonb)$c$, 'OK'),
        ('DJ33 birth_date nested object', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"birth_date":{"y":1}}'::jsonb)$c$, 'OK'),
        ('DJ34 image_url number', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"image_url":5}'::jsonb)$c$, 'OK'),
        ('DJ35 biography array', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"biography":[]}'::jsonb)$c$, 'OK'),
        ('DJ36 years_of_experience string', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"years_of_experience":"5"}'::jsonb)$c$, 'OK'),
        ('DJ37 years_of_experience -1', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"years_of_experience":-1}'::jsonb)$c$, 'OK'),
        ('DJ38 years_of_experience 5.5', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"years_of_experience":5.5}'::jsonb)$c$, 'OK'),
        ('DJ39 years_of_experience 2147483648', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"years_of_experience":2147483648}'::jsonb)$c$, 'OK'),
        ('DJ40 years_of_experience boolean', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"years_of_experience":true}'::jsonb)$c$, 'OK'),
        ('DJ41 valid keys plus one unknown key', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{"phone":"x","role":"admin"}'::jsonb)$c$, 'OK'),
        ('DJ42 empty object', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '{}'::jsonb)$c$, 'OK'),
        ('DJ43 array payload', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '[]'::jsonb)$c$, 'OK'),
        ('DJ44 scalar string payload', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '"x"'::jsonb)$c$, 'OK'),
        ('DJ45 scalar number payload', NULL, $c$SELECT NOT public.pending_new_data_valid(true, '1'::jsonb)$c$, 'OK'),
        ('DJ46 JSON null payload', NULL, $c$SELECT NOT public.pending_new_data_valid(true, 'null'::jsonb)$c$, 'OK'),
        ('DJ47 SQL NULL payload', NULL, $c$SELECT NOT public.pending_new_data_valid(true, NULL::jsonb)$c$, 'OK'),
        ('DJ48 NULL target flag', NULL, $c$SELECT NOT public.pending_new_data_valid(NULL::boolean, '{"phone":"x"}'::jsonb)$c$, 'OK'),
        ('DJ49 never returns NULL', NULL, $c$SELECT public.pending_new_data_valid(NULL::boolean, NULL::jsonb) IS NOT NULL AND public.pending_new_data_valid(true, '{"phone":"x"}'::jsonb) IS NOT NULL$c$, 'OK'),

        -- ===== SJ: pending_new_data_valid, specialty target (false) =====
        ('SJ01 specialty_name string', NULL, $c$SELECT public.pending_new_data_valid(false, '{"specialty_name":"x"}'::jsonb)$c$, 'OK'),
        ('SJ02 appointment_duration 30', NULL, $c$SELECT public.pending_new_data_valid(false, '{"appointment_duration":30}'::jsonb)$c$, 'OK'),
        ('SJ03 both keys', NULL, $c$SELECT public.pending_new_data_valid(false, '{"specialty_name":"x","appointment_duration":30}'::jsonb)$c$, 'OK'),
        ('SJ04 appointment_duration 1', NULL, $c$SELECT public.pending_new_data_valid(false, '{"appointment_duration":1}'::jsonb)$c$, 'OK'),
        ('SJ05 appointment_duration 480', NULL, $c$SELECT public.pending_new_data_valid(false, '{"appointment_duration":480}'::jsonb)$c$, 'OK'),
        ('SJ06 appointment_duration 30.0 accepted (whole by value)', NULL, $c$SELECT public.pending_new_data_valid(false, '{"appointment_duration":30.0}'::jsonb)$c$, 'OK'),
        ('SJ07 appointment_duration 30.00 accepted', NULL, $c$SELECT public.pending_new_data_valid(false, '{"appointment_duration":30.00}'::jsonb)$c$, 'OK'),
        ('SJ08 appointment_duration 3e1 accepted', NULL, $c$SELECT public.pending_new_data_valid(false, '{"appointment_duration":3e1}'::jsonb)$c$, 'OK'),
        ('SJ09 appointment_duration 3.0e1 accepted', NULL, $c$SELECT public.pending_new_data_valid(false, '{"appointment_duration":3.0e1}'::jsonb)$c$, 'OK'),
        ('SJ10 appointment_duration 0', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":0}'::jsonb)$c$, 'OK'),
        ('SJ11 appointment_duration 481', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":481}'::jsonb)$c$, 'OK'),
        ('SJ12 appointment_duration -1', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":-1}'::jsonb)$c$, 'OK'),
        ('SJ13 appointment_duration 30.5', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":30.5}'::jsonb)$c$, 'OK'),
        ('SJ14 appointment_duration 29.999999999', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":29.999999999}'::jsonb)$c$, 'OK'),
        ('SJ15 appointment_duration 1e3 (1000, out of range)', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":1e3}'::jsonb)$c$, 'OK'),
        ('SJ16 appointment_duration 1e400 (whole but out of range, must not raise)', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":1e400}'::jsonb)$c$, 'OK'),
        ('SJ17 appointment_duration string', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":"30"}'::jsonb)$c$, 'OK'),
        ('SJ18 appointment_duration boolean', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":true}'::jsonb)$c$, 'OK'),
        ('SJ19 appointment_duration null', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":null}'::jsonb)$c$, 'OK'),
        ('SJ20 appointment_duration array', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":[30]}'::jsonb)$c$, 'OK'),
        ('SJ21 appointment_duration nested object', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":{"v":30}}'::jsonb)$c$, 'OK'),
        ('SJ22 specialty_name null', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"specialty_name":null}'::jsonb)$c$, 'OK'),
        ('SJ23 specialty_name number', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"specialty_name":5}'::jsonb)$c$, 'OK'),
        ('SJ24 doctor key on a specialty target', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"phone":"x"}'::jsonb)$c$, 'OK'),
        ('SJ25 unknown key role', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"role":"admin"}'::jsonb)$c$, 'OK'),
        ('SJ26 appointment_duration 0.0 (whole, out of range)', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"appointment_duration":0.0}'::jsonb)$c$, 'OK'),
        ('SJ27 forbidden key specialty_id', NULL, $c$SELECT NOT public.pending_new_data_valid(false, '{"specialty_id":1}'::jsonb)$c$, 'OK'),

        -- ===== WL: the whitelist CHECK on the table (rows use status cancelled so the one-pending index never interferes) =====
        ('WL01 doctor update with a valid key', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{"phone":"0933333333"}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('WL02 specialty update with a valid key', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,9002,'update','{"appointment_duration":30}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('WL03 doctor update with key role', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{"role":"admin"}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),
        ('WL04 specialty update with a doctor key', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,9002,'update','{"phone":"x"}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),
        ('WL05 doctor update with forbidden key specialty_id', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{"specialty_id":2}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),
        ('WL06 doctor update with first_name null', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{"first_name":null}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),
        ('WL07 specialty update with duration 481', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,9002,'update','{"appointment_duration":481}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),
        ('WL08 specialty update with duration 30.5', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,9002,'update','{"appointment_duration":30.5}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),
        ('WL09 specialty update with duration 30.0 is accepted', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,9002,'update','{"appointment_duration":30.0}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('WL10 doctor update with years_of_experience -1', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{"years_of_experience":-1}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),
        ('WL11 delete with new_data is left to the shape check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'delete','{"role":"admin"}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('WL12 update without new_data is left to the shape check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update',NULL,'cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('WL13 update with an empty object is left to the shape check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('WL14 update with an array is left to the shape check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','[{"phone":"x"}]','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('WL15 update with a scalar string is left to the shape check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','"x"','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('WL16 update with a JSON null is left to the shape check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','null'::jsonb,'cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('WL17 delete with SQL NULL new_data is accepted', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'delete',NULL,'cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('WL18 both targets are left to the target check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9002,'update','{"phone":"x"}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_target_ck'),
        ('WL19 doctor update with all eight keys', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{"first_name":"A","last_name":"B","birth_date":"1980-01-01","phone":"0911111111","image_url":null,"biography":"x","years_of_experience":3,"email":"a@b.c"}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('WL20 doctor update with valid keys plus one unknown key', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'update','{"phone":"x","is_active":false}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_whitelist_ck'),

        -- ===== TZ: results independent of the session TimeZone =====
        ('TZ01 validator, session America/Los_Angeles: 15 Nov is today + 13 after the Damascus rollover', $q$SET LOCAL timezone = 'America/Los_Angeles'$q$, $c$SELECT public.appointment_rule_violation(9007, 9001, date '2026-11-15', time '10:00', timestamptz '2026-11-01 21:00:00+00') IS NULL$c$, 'OK'),
        ('TZ02 validator, session America/Los_Angeles: 16 Nov is beyond the window', $q$SET LOCAL timezone = 'America/Los_Angeles'$q$, $c$SELECT public.appointment_rule_violation(9007, 9001, date '2026-11-16', time '10:00', timestamptz '2026-11-01 21:00:00+00') = 'AF104'$c$, 'OK'),
        ('TZ03 validator, session Asia/Tokyo: 1 Nov has passed after the rollover', $q$SET LOCAL timezone = 'Asia/Tokyo'$q$, $c$SELECT public.appointment_rule_violation(9007, 9001, date '2026-11-01', time '10:00', timestamptz '2026-11-01 21:00:00+00') = 'AF103'$c$, 'OK'),

        -- ===== LK: lock wrappers inside one session (two-session behaviour is tested by concurrency/t2b_locks.sh).
        -- Every check asserts the TOTAL number of advisory locks held by this backend, so a lock leaked by any earlier case is detected. =====
        ('LK00 no advisory lock is held at the start of the group', NULL, $c$SELECT count(*) = 0 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()$c$, 'OK'),
        ('LK01 lock_doctor takes exactly one exclusive lock of class 2', $q$SELECT public.lock_doctor(7)$q$, $c$SELECT (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) = 1 AND EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND classid::bigint = 2 AND objid::bigint = 7 AND objsubid = 2 AND mode = 'ExclusiveLock')$c$, 'OK'),
        ('LK02 lock_patient takes exactly one exclusive lock of class 3', $q$SELECT public.lock_patient(7)$q$, $c$SELECT (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) = 1 AND EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND classid::bigint = 3 AND objid::bigint = 7 AND objsubid = 2 AND mode = 'ExclusiveLock')$c$, 'OK'),
        ('LK03 lock_specialty exclusive takes exactly one exclusive lock of class 1', $q$SELECT public.lock_specialty(7, false)$q$, $c$SELECT (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) = 1 AND EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND classid::bigint = 1 AND objid::bigint = 7 AND objsubid = 2 AND mode = 'ExclusiveLock')$c$, 'OK'),
        ('LK04 lock_specialty shared takes exactly one share lock of class 1 (no exclusive lock leaked from LK03)', $q$SELECT public.lock_specialty(7, true)$q$, $c$SELECT (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) = 1 AND EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND classid::bigint = 1 AND objid::bigint = 7 AND objsubid = 2 AND mode = 'ShareLock')$c$, 'OK'),
        ('LK05 the same id in the three classes gives exactly three distinct locks', $q$SELECT public.lock_doctor(7), public.lock_patient(7), public.lock_specialty(7, false)$q$, $c$SELECT (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) = 3 AND (SELECT count(DISTINCT classid::bigint) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND objid::bigint = 7) = 3$c$, 'OK'),
        ('LK06 acquiring twice in one transaction is re-entrant and keeps exactly one lock', $q$SELECT public.lock_doctor(7); SELECT public.lock_doctor(7)$q$, $c$SELECT (SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) = 1 AND EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND classid::bigint = 2 AND objid::bigint = 7)$c$, 'OK'),
        ('LK07 lock_doctor rejects a NULL id', $q$SELECT public.lock_doctor(NULL)$q$, NULL, '22004'),
        ('LK08 lock_patient rejects a NULL id', $q$SELECT public.lock_patient(NULL)$q$, NULL, '22004'),
        ('LK09 lock_specialty rejects a NULL id', $q$SELECT public.lock_specialty(NULL, true)$q$, NULL, '22004'),
        ('LK10 lock_specialty rejects a NULL mode', $q$SELECT public.lock_specialty(7, NULL)$q$, NULL, '22004'),
        ('LK11 a rejected NULL call takes no lock', $q$DO $do$ BEGIN BEGIN PERFORM public.lock_doctor(NULL); EXCEPTION WHEN SQLSTATE '22004' THEN NULL; END; END $do$ $q$, $c$SELECT count(*) = 0 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()$c$, 'OK'),
        ('LK12 no advisory lock is held at the end of the group', NULL, $c$SELECT count(*) = 0 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()$c$, 'OK')
        ) AS t(id, setup, chk, expect)
    LOOP
        v_state := NULL; v_con := NULL; v_col := NULL;
        BEGIN
            IF r.setup IS NOT NULL THEN
                EXECUTE r.setup;
            END IF;
            IF r.chk IS NOT NULL THEN
                EXECUTE r.chk INTO v_bool;
                IF v_bool IS DISTINCT FROM true THEN
                    RAISE EXCEPTION USING ERRCODE = 'AF998', MESSAGE = 'check-false';
                END IF;
            END IF;
            RAISE EXCEPTION USING ERRCODE = 'AF999', MESSAGE = 'ok-rollback';
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME, v_col = COLUMN_NAME;
            v_state := SQLSTATE;
        END;

        v_obj := CASE WHEN v_state = '23502' THEN v_col ELSE v_con END;
        IF r.expect = 'OK' THEN
            v_ok := (v_state = 'AF999');
        ELSIF position(':' IN r.expect) > 0 THEN
            v_ok := coalesce(v_state = split_part(r.expect, ':', 1) AND v_obj = ANY (string_to_array(split_part(r.expect, ':', 2), '|')), false);
        ELSE
            v_ok := (v_state = r.expect);
        END IF;

        v_total := v_total + 1;
        v_grp := substring(r.id FROM '^[A-Z]+');
        v_n := jsonb_set(v_n, ARRAY[v_grp], to_jsonb(coalesce((v_n ->> v_grp)::int, 0) + 1));
        IF v_ok THEN
            v_p := jsonb_set(v_p, ARRAY[v_grp], to_jsonb(coalesce((v_p ->> v_grp)::int, 0) + 1));
        ELSE
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  (expected %, got % [%])', r.id, r.expect, v_state, coalesce(v_obj, '-');
        END IF;
    END LOOP;

    -- المرحلة الثانية: appointment_rule_violation. now0 = الأحد 1 ت2 08:00 بتوقيت دمشق (النافذة 1-14 ت2؛ الجمعتان 6 و13)؛ now1 = الأحد 12:00؛
    -- nowA = 23:59:59 بتوقيت دمشق يوم 1 ت2؛ nowB = 00:00:00 يوم 2 ت2 (الحد الفاصل 21:00Z). ترتيب الأعمدة: id, الطبيب, المريض, التاريخ, الوقت, الآن, المتوقع.
    FOR vc IN
        SELECT * FROM (VALUES
        -- وسائط فارغة
        ('V001 NULL doctor',  NULL::int, 9001, '2026-11-02', '10:00', '2026-11-01 08:00+03', 'AF110'),
        ('V002 NULL patient', 9007,      NULL, '2026-11-02', '10:00', '2026-11-01 08:00+03', 'AF110'),
        ('V003 NULL date',    9007,      9001, NULL,         '10:00', '2026-11-01 08:00+03', 'AF110'),
        ('V004 NULL time',    9007,      9001, '2026-11-02', NULL,    '2026-11-01 08:00+03', 'AF110'),
        ('V005 NULL now',     9007,      9001, '2026-11-02', '10:00', NULL,                  'AF110'),
        -- الطبيب
        ('V006 doctor does not exist',   99999, 9001, '2026-11-02', '10:00', '2026-11-01 08:00+03', 'AF102'),
        ('V007 doctor account inactive', 9003,  9001, '2026-11-02', '10:00', '2026-11-01 08:00+03', 'AF102'),
        ('V008 valid booking (D7, P1, Monday 10:00)', 9007, 9001, '2026-11-02', '10:00', '2026-11-01 08:00+03', NULL),
        ('V009 an inactive doctor on a Friday is AF102, before the Friday rule', 9003, 9001, '2026-11-06', '10:00', '2026-11-01 08:00+03', 'AF102'),
        -- الجمعة (تُفحص قبل الماضي والنافذة)
        ('V010 Friday inside the window',   9007, 9001, '2026-11-06', '10:00', '2026-11-01 08:00+03', 'AF109'),
        ('V011 Friday in the past',         9007, 9001, '2026-10-30', '10:00', '2026-11-01 08:00+03', 'AF109'),
        ('V012 Friday beyond the window',   9007, 9001, '2026-11-20', '10:00', '2026-11-01 08:00+03', 'AF109'),
        ('V013 Friday at today + 12',       9007, 9001, '2026-11-13', '10:00', '2026-11-01 08:00+03', 'AF109'),
        ('V014 Friday with an out-of-hours start is AF109, before the hours rule', 9007, 9001, '2026-11-06', '08:00', '2026-11-01 08:00+03', 'AF109'),
        -- ساعات العمل وبداية الموعد
        ('V020 08:59 is before opening',    9007, 9001, '2026-11-02', '08:59',       '2026-11-01 08:00+03', 'AF111'),
        ('V021 09:00 is the first slot',    9007, 9001, '2026-11-02', '09:00',       '2026-11-01 08:00+03', NULL),
        ('V022 16:30 ends exactly at 17:00 (30 min)', 9007, 9001, '2026-11-02', '16:30', '2026-11-01 08:00+03', NULL),
        ('V023 16:31 ends after 17:00 (30 min)',      9007, 9001, '2026-11-02', '16:31', '2026-11-01 08:00+03', 'AF105'),
        ('V024 17:00 is closing time',      9007, 9001, '2026-11-02', '17:00',       '2026-11-01 08:00+03', 'AF111'),
        ('V025 17:01',                      9007, 9001, '2026-11-02', '17:01',       '2026-11-01 08:00+03', 'AF111'),
        ('V026 00:00',                      9007, 9001, '2026-11-02', '00:00',       '2026-11-01 08:00+03', 'AF111'),
        ('V027 23:59',                      9007, 9001, '2026-11-02', '23:59',       '2026-11-01 08:00+03', 'AF111'),
        ('V028 seconds are not whole minutes',   9007, 9001, '2026-11-02', '09:00:30',   '2026-11-01 08:00+03', 'AF111'),
        ('V029 fractional second',          9007, 9001, '2026-11-02', '09:00:00.5',  '2026-11-01 08:00+03', 'AF111'),
        -- موعد بدأ أو مضى
        ('V030 today 09:00 already started at 12:00',      9007, 9001, '2026-11-01', '09:00', '2026-11-01 12:00+03', 'AF103'),
        ('V031 today 11:59 already started at 12:00',      9007, 9001, '2026-11-01', '11:59', '2026-11-01 12:00+03', 'AF103'),
        ('V032 a slot starting exactly now has started',   9007, 9001, '2026-11-01', '12:00', '2026-11-01 12:00+03', 'AF103'),
        ('V033 a slot starting one minute from now',       9007, 9001, '2026-11-01', '12:01', '2026-11-01 12:00+03', NULL),
        ('V034 yesterday',                                 9007, 9001, '2026-10-31', '10:00', '2026-11-01 12:00+03', 'AF103'),
        ('V035 today 09:00 is still ahead at 08:00',       9007, 9001, '2026-11-01', '09:00', '2026-11-01 08:00+03', NULL),
        ('V036 hours are checked before the past (08:59)', 9007, 9001, '2026-11-01', '08:59', '2026-11-01 08:00+03', 'AF111'),
        -- النافذة (اليوم حتى اليوم + 13)
        ('V040 today',                9007, 9001, '2026-11-01', '10:00', '2026-11-01 08:00+03', NULL),
        ('V041 today + 13 (Saturday)', 9007, 9001, '2026-11-14', '10:00', '2026-11-01 08:00+03', NULL),
        ('V042 today + 14 (Sunday)',  9007, 9001, '2026-11-15', '10:00', '2026-11-01 08:00+03', 'AF104'),
        ('V043 today + 15',           9007, 9001, '2026-11-16', '10:00', '2026-11-01 08:00+03', 'AF104'),
        ('V044 beyond the window AND ends after 17:00 reports the window first (D5, 480 min)', 9005, 9001, '2026-11-16', '16:59', '2026-11-01 08:00+03', 'AF104'),
        -- حد منتصف الليل في دمشق
        ('V050 23:59:59 Damascus: today + 13 is valid',        9007, 9001, '2026-11-14', '10:00', '2026-11-01 20:59:59+00', NULL),
        ('V051 23:59:59 Damascus: today + 14 is beyond',       9007, 9001, '2026-11-15', '10:00', '2026-11-01 20:59:59+00', 'AF104'),
        ('V052 23:59:59 Damascus: 10:00 today has passed',     9007, 9001, '2026-11-01', '10:00', '2026-11-01 20:59:59+00', 'AF103'),
        ('V053 00:00:00 next day: the previous day is past',   9007, 9001, '2026-11-01', '10:00', '2026-11-01 21:00:00+00', 'AF103'),
        ('V054 00:00:00 next day: 09:00 that day is ahead',    9007, 9001, '2026-11-02', '09:00', '2026-11-01 21:00:00+00', NULL),
        ('V055 00:00:00 next day: today + 13 is valid',        9007, 9001, '2026-11-15', '10:00', '2026-11-01 21:00:00+00', NULL),
        ('V056 00:00:00 next day: today + 14 is beyond',       9007, 9001, '2026-11-16', '10:00', '2026-11-01 21:00:00+00', 'AF104'),
        -- نهاية الدوام حسب مدة الاختصاص
        ('V060 20 min: 16:40 ends at 17:00',  9001, 9003, '2026-11-04', '16:40', '2026-11-01 08:00+03', NULL),
        ('V061 20 min: 16:41 ends after',     9001, 9003, '2026-11-04', '16:41', '2026-11-01 08:00+03', 'AF105'),
        ('V062 25 min: 16:35 ends at 17:00',  9004, 9001, '2026-11-02', '16:35', '2026-11-01 08:00+03', NULL),
        ('V063 25 min: 16:36 ends after',     9004, 9001, '2026-11-02', '16:36', '2026-11-01 08:00+03', 'AF105'),
        ('V064 480 min: 09:00 ends at 17:00', 9005, 9001, '2026-11-02', '09:00', '2026-11-01 08:00+03', NULL),
        ('V065 480 min: 09:01 ends after',    9005, 9001, '2026-11-02', '09:01', '2026-11-01 08:00+03', 'AF105'),
        ('V066 480 min: 16:59 must not wrap past midnight', 9005, 9001, '2026-11-02', '16:59', '2026-11-01 08:00+03', 'AF105'),
        ('V067 30 min: 16:30 ends at 17:00',  9002, 9003, '2026-11-04', '16:30', '2026-11-01 08:00+03', NULL),
        ('V068 30 min: 16:31 ends after',     9002, 9003, '2026-11-04', '16:31', '2026-11-01 08:00+03', 'AF105'),
        -- ترتيب الفحوص
        ('V070 end of day is checked before pending changes', 9004, 9001, '2026-11-14', '16:36', '2026-11-01 08:00+03', 'AF105'),
        ('V071 Friday is checked before pending changes',     9004, 9001, '2026-11-13', '09:00', '2026-11-01 08:00+03', 'AF109'),
        -- التغييرات المعلّقة
        ('V080 doctor request: the day before the effective date', 9004, 9001, '2026-11-12', '09:00', '2026-11-01 08:00+03', NULL),
        ('V081 doctor request: after the effective date',          9004, 9001, '2026-11-14', '09:00', '2026-11-01 08:00+03', 'AF106'),
        ('V082 doctor request: far before the effective date',     9004, 9001, '2026-11-02', '09:00', '2026-11-01 08:00+03', NULL),
        ('V083 specialty request: the day before',                 9005, 9001, '2026-11-10', '09:00', '2026-11-01 08:00+03', NULL),
        ('V084 specialty request: the effective date itself',      9005, 9001, '2026-11-11', '09:00', '2026-11-01 08:00+03', 'AF106'),
        ('V085 specialty request: after the effective date',       9005, 9001, '2026-11-12', '09:00', '2026-11-01 08:00+03', 'AF106'),
        ('V086 both requests: before either date',                 9006, 9001, '2026-11-08', '10:00', '2026-11-01 08:00+03', NULL),
        ('V087 both requests: the earlier (specialty) date wins',  9006, 9001, '2026-11-09', '10:00', '2026-11-01 08:00+03', 'AF106'),
        ('V088 both requests: after both dates',                   9006, 9001, '2026-11-11', '10:00', '2026-11-01 08:00+03', 'AF106'),
        ('V089 a specialty request restricts every doctor of it',  9001, 9001, '2026-11-09', '10:00', '2026-11-01 08:00+03', 'AF106'),
        ('V090 and not before its effective date',                 9001, 9001, '2026-11-08', '10:00', '2026-11-01 08:00+03', NULL),
        ('V091 a due but unexecuted request still restricts',      9008, 9001, '2026-11-02', '10:00', '2026-11-01 08:00+03', 'AF106'),
        ('V092 executed, cancelled and failed requests do not restrict', 9002, 9001, '2026-11-14', '10:00', '2026-11-01 08:00+03', NULL),
        ('V093 requests on other doctors and specialties do not restrict', 9007, 9001, '2026-11-14', '10:00', '2026-11-01 08:00+03', NULL),
        ('V094 an unknown patient id is not the validator concern (the foreign key guards it)', 9007, 99999, '2026-11-02', '10:00', '2026-11-01 08:00+03', NULL),
        ('V095 a pending-change block is reported before a doctor overlap (A9005 books D6 on 9 Nov at 10:00)', 9006, 9001, '2026-11-09', '10:00', '2026-11-01 08:00+03', 'AF106'),
        -- تعارض مع حجز آخر لنفس الطبيب (D1 مدته 20 دقيقة وله حجز 10:00 يوم 2 ت2)
        ('V100 same doctor, same start',          9001, 9001, '2026-11-02', '10:00', '2026-11-01 08:00+03', 'AF107'),
        ('V101 same doctor, starts inside',       9001, 9001, '2026-11-02', '10:10', '2026-11-01 08:00+03', 'AF107'),
        ('V102 same doctor, ends inside (09:50)', 9001, 9001, '2026-11-02', '09:50', '2026-11-01 08:00+03', 'AF107'),
        ('V103 same doctor, ends one minute inside (09:59)', 9001, 9001, '2026-11-02', '09:59', '2026-11-01 08:00+03', 'AF107'),
        ('V104 same doctor, starts one minute before the end (10:19)', 9001, 9001, '2026-11-02', '10:19', '2026-11-01 08:00+03', 'AF107'),
        ('V105 adjacent before (09:40 ends at 10:00)', 9001, 9001, '2026-11-02', '09:40', '2026-11-01 08:00+03', NULL),
        ('V106 adjacent after (10:20)',           9001, 9001, '2026-11-02', '10:20', '2026-11-01 08:00+03', NULL),
        ('V107 later slot (10:30)',               9001, 9001, '2026-11-02', '10:30', '2026-11-01 08:00+03', NULL),
        ('V108 another doctor at the same time',  9006, 9001, '2026-11-02', '10:00', '2026-11-01 08:00+03', NULL),
        ('V109 same doctor on another date',      9001, 9001, '2026-11-05', '10:00', '2026-11-01 08:00+03', NULL),
        ('V110 same doctor, 11:00',               9001, 9001, '2026-11-02', '11:00', '2026-11-01 08:00+03', NULL),
        -- الحجوزات الملغاة لا تُحتسب
        ('V120 a cancelled booking of the doctor does not block', 9001, 9001, '2026-11-04', '10:00', '2026-11-01 08:00+03', NULL),
        ('V121 a cancelled booking of the doctor D2 does not block', 9002, 9003, '2026-11-04', '11:00', '2026-11-01 08:00+03', NULL),
        ('V122 a cancelled booking of the patient does not block', 9001, 9002, '2026-11-04', '11:10', '2026-11-01 08:00+03', NULL),
        -- تعارض مع حجز آخر لنفس المريض عند طبيب آخر (P1 له حجز مع D2 مدته 30 دقيقة يوم 3 ت2 الساعة 10:00 أي [600,630))
        ('V130 patient, D1 20 min at 10:20 overlaps',          9001, 9001, '2026-11-03', '10:20', '2026-11-01 08:00+03', 'AF108'),
        ('V131 patient, D1 at 10:29 overlaps by one minute',   9001, 9001, '2026-11-03', '10:29', '2026-11-01 08:00+03', 'AF108'),
        ('V132 patient, D1 at 10:30 is adjacent',              9001, 9001, '2026-11-03', '10:30', '2026-11-01 08:00+03', NULL),
        ('V133 patient, D1 at 09:40 ends exactly at 10:00',    9001, 9001, '2026-11-03', '09:40', '2026-11-01 08:00+03', NULL),
        ('V134 patient, D1 at 09:41 overlaps by one minute',   9001, 9001, '2026-11-03', '09:41', '2026-11-01 08:00+03', 'AF108'),
        ('V135 patient, D1 at 09:45 overlaps',                 9001, 9001, '2026-11-03', '09:45', '2026-11-01 08:00+03', 'AF108'),
        ('V136 patient P1, D4 25 min at 09:36 overlaps',       9004, 9001, '2026-11-03', '09:36', '2026-11-01 08:00+03', 'AF108'),
        ('V137 patient P1, D4 25 min at 09:35 is adjacent',    9004, 9001, '2026-11-03', '09:35', '2026-11-01 08:00+03', NULL),
        ('V138 patient P1, D5 480 min contains the other booking', 9005, 9001, '2026-11-03', '09:00', '2026-11-01 08:00+03', 'AF108'),
        ('V139 patient, another doctor at the same start',     9001, 9001, '2026-11-03', '10:00', '2026-11-01 08:00+03', 'AF108'),
        ('V140 another patient P3 with D1 at 10:00 is free',   9001, 9003, '2026-11-03', '10:00', '2026-11-01 08:00+03', NULL),
        ('V141 another patient with the busy doctor D2 hits the doctor rule', 9002, 9003, '2026-11-03', '10:10', '2026-11-01 08:00+03', 'AF107'),
        ('V142 the same patient on another date',              9001, 9001, '2026-11-05', '10:00', '2026-11-01 08:00+03', NULL),
        ('V143 doctor overlap is reported before patient overlap', 9002, 9001, '2026-11-03', '10:00', '2026-11-01 08:00+03', 'AF107')
        ) AS t(id, doc, pat, d, tm, now_, expect)
    LOOP
        v_code := NULL;
        BEGIN
            SELECT public.appointment_rule_violation(vc.doc, vc.pat, vc.d::date, vc.tm::time, vc.now_::timestamptz) INTO v_code;
            v_state := 'DONE';
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
        END;
        v_ok := (v_state = 'DONE' AND v_code IS NOT DISTINCT FROM vc.expect);

        v_total := v_total + 1;
        v_grp := substring(vc.id FROM '^[A-Z]+');
        v_n := jsonb_set(v_n, ARRAY[v_grp], to_jsonb(coalesce((v_n ->> v_grp)::int, 0) + 1));
        IF v_ok THEN
            v_p := jsonb_set(v_p, ARRAY[v_grp], to_jsonb(coalesce((v_p ->> v_grp)::int, 0) + 1));
        ELSE
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  (expected %, got % [%])', vc.id, coalesce(vc.expect, 'NULL'), v_state, coalesce(v_code, 'NULL');
        END IF;
    END LOOP;

    -- X01: لم تُستهلك أي قيمة هوية في الاختبارات
    v_ok := NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL);
    v_total := v_total + 1;
    v_n := jsonb_set(v_n, '{X}', to_jsonb(coalesce((v_n ->> 'X')::int, 0) + 1));
    IF v_ok THEN
        v_p := jsonb_set(v_p, '{X}', to_jsonb(coalesce((v_p ->> 'X')::int, 0) + 1));
    ELSE
        v_fail := v_fail + 1;
        RAISE NOTICE 'FAIL  X01 identity sequences were consumed by the tests';
    END IF;

    -- X02: لا يحمل هذا الاتصال أي قفل استشاري قبل ROLLBACK النهائي (كل قفل أُخذ في حالة سابقة حُرِّر بتراجع معاملتها الفرعية)
    v_ok := NOT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid());
    v_total := v_total + 1;
    v_n := jsonb_set(v_n, '{X}', to_jsonb(coalesce((v_n ->> 'X')::int, 0) + 1));
    IF v_ok THEN
        v_p := jsonb_set(v_p, '{X}', to_jsonb(coalesce((v_p ->> 'X')::int, 0) + 1));
    ELSE
        v_fail := v_fail + 1;
        RAISE NOTICE 'FAIL  X02 this backend still holds advisory locks before the final rollback';
    END IF;

    FOR g IN SELECT key AS grp, value::int AS n, coalesce((v_p ->> key)::int, 0) AS passed FROM jsonb_each_text(v_n) ORDER BY key LOOP
        RAISE NOTICE 'group %: %/% passed', g.grp, g.passed, g.n;
    END LOOP;
    RAISE NOTICE 'TOTAL: %/% passed, % failed', v_total - v_fail, v_total, v_fail;

    IF v_fail > 0 THEN
        RAISE EXCEPTION '% test(s) failed', v_fail;
    END IF;
END $t$;

ROLLBACK;
