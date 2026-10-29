-- اختبارات المرحلة 1B-2e: صلاحيات afiyah_app (afiyah_test فقط). تُشغَّل بعد 006_privileges.sql، بدور omarsh (مالك قاعدة وsuperuser) الذي يبدّل إلى afiyah_app لكل حالة.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f t2e_privileges.sql
-- الحالات P تفحص الكتالوج (قبل أي منحة اختبارية). ثم تُمنح داخل معاملة الاختبار وحدها (وتُتراجع بـ ROLLBACK) صلاحية إدراج أعمدة الهوية كي تُدرَج صفوف الاختبار بمعرّفات صريحة
-- فلا تُستهلك قيم التسلسلات ويُختبر مسار المشغّلات الفعلي بصلاحيات afiyah_app. كل حالة: prep بدور المالك، ثم SET LOCAL ROLE afiyah_app، ثم stmt، ثم RESET ROLE، ثم chk بدور المالك.
-- الفشل المتوقع 42501 (permission denied). {D1} أول يوم غير جمعة بعد اليوم و {PD} وقت إنشاء قديم (قبل 15 يوماً) لطلب مستحق.
\ir ../_guard.sql

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'execute_due_pending_change') THEN
        RAISE EXCEPTION 'precondition failed: 006_privileges.sql is not applied';
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
    v_today  date;
    v_d1     date;
    v_pre    jsonb := '{}';
    v_b      boolean;
    v_keys   text[];
    v_vals   text[];
    k        int;
    v_prep   text; v_stmt text; v_chk text;
    v_stage  text; v_state text; v_msg text; v_harn text;
    v_bool   boolean; v_ok boolean; v_grp text;
    v_n      jsonb := '{}';
    v_p      jsonb := '{}';
    v_total  int := 0;
    v_fail   int := 0;
    c_ap     constant text := 'INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time, status) OVERRIDING SYSTEM VALUE VALUES ';
    c_pcd    constant text := 'INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data) OVERRIDING SYSTEM VALUE VALUES ';
    c_pcp    constant text := 'INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES ';
BEGIN
    v_today := public.clinic_local(clock_timestamp())::date;
    v_d1 := v_today + 1; WHILE extract(dow FROM v_d1) = 5 LOOP v_d1 := v_d1 + 1; END LOOP;
    v_keys := ARRAY['{D1}', '{PD}'];
    v_vals := ARRAY[v_d1::text, (clock_timestamp() - interval '15 days')::text];

    -- فحوص الكتالوج (قبل المنح الاختبارية)
    SELECT NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)))
      INTO v_b;
    v_pre := v_pre || jsonb_build_object('p01', v_b);
    SELECT NOT EXISTS (SELECT p.proname::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND has_function_privilege('afiyah_app', p.oid, 'EXECUTE')
                       EXCEPT SELECT unnest(ARRAY['clinic_local','pending_execute_at','pending_new_data_valid','lock_specialty','lock_doctor','lock_patient','appointment_rule_violation','cancel_pending_change','execute_due_pending_change']))
       AND NOT EXISTS (SELECT unnest(ARRAY['clinic_local','pending_execute_at','pending_new_data_valid','lock_specialty','lock_doctor','lock_patient','appointment_rule_violation','cancel_pending_change','execute_due_pending_change'])
                       EXCEPT SELECT p.proname::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                               WHERE n.nspname = 'public' AND has_function_privilege('afiyah_app', p.oid, 'EXECUTE'))
      INTO v_b;
    v_pre := v_pre || jsonb_build_object('p02', v_b);
    SELECT (SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef)
             = ARRAY['cancel_pending_change','execute_due_pending_change']
       AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND p.prosecdef
                          AND (pg_get_userbyid(p.proowner) <> 'omarsh' OR p.proconfig IS NULL OR replace(p.proconfig[1], ' ', '') <> 'search_path=pg_catalog,pg_temp'))
      INTO v_b;
    v_pre := v_pre || jsonb_build_object('p03', v_b);
    SELECT has_schema_privilege('afiyah_app', 'public', 'USAGE')
       AND NOT EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a WHERE n.nspname = 'public' AND a.grantee = 0)
      INTO v_b;
    v_pre := v_pre || jsonb_build_object('p04', v_b);
    SELECT NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pr
                        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND has_table_privilege('afiyah_app', c.oid, pr))
       AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT has_table_privilege('afiyah_app', c.oid, 'SELECT'))
      INTO v_b;
    v_pre := v_pre || jsonb_build_object('p05', v_b);
    SELECT NOT EXISTS (
             SELECT c.relname::text, a.attname::text, pr
               FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
               CROSS JOIN unnest(ARRAY['INSERT','UPDATE']) pr
              WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND has_column_privilege('afiyah_app', c.oid, a.attnum, pr)
             EXCEPT SELECT * FROM (VALUES
               ('users','email','INSERT'),('users','password_hash','INSERT'),('users','role','INSERT'),('users','password_hash','UPDATE'),
               ('patients','user_id','INSERT'),('patients','first_name','INSERT'),('patients','last_name','INSERT'),('patients','phone','INSERT'),('patients','birth_date','INSERT'),
               ('patients','address','INSERT'),('patients','gender','INSERT'),('patients','blood_type','INSERT'),
               ('patients','first_name','UPDATE'),('patients','last_name','UPDATE'),('patients','phone','UPDATE'),('patients','birth_date','UPDATE'),
               ('patients','address','UPDATE'),('patients','gender','UPDATE'),('patients','blood_type','UPDATE'),
               ('doctors','user_id','INSERT'),('doctors','specialty_id','INSERT'),('doctors','first_name','INSERT'),('doctors','last_name','INSERT'),('doctors','birth_date','INSERT'),
               ('doctors','phone','INSERT'),('doctors','image_url','INSERT'),('doctors','biography','INSERT'),('doctors','years_of_experience','INSERT'),
               ('specialties','specialty_name','INSERT'),('specialties','appointment_duration','INSERT'),
               ('appointments','patient_id','INSERT'),('appointments','doctor_id','INSERT'),('appointments','appointment_date','INSERT'),('appointments','appointment_time','INSERT'),
               ('appointments','status','UPDATE'),
               ('pending_changes','doctor_id','INSERT'),('pending_changes','specialty_id','INSERT'),('pending_changes','change_type','INSERT'),('pending_changes','new_data','INSERT')) e)
       AND (SELECT count(*) FROM (
             SELECT 1 FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
               CROSS JOIN unnest(ARRAY['INSERT','UPDATE']) pr
              WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND has_column_privilege('afiyah_app', c.oid, a.attnum, pr)) z) = 39
      INTO v_b;
    v_pre := v_pre || jsonb_build_object('p06', v_b);
    SELECT NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN unnest(ARRAY['SELECT','USAGE','UPDATE']) pr
                        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' AND has_sequence_privilege('afiyah_app', c.oid, pr))
      INTO v_b;
    v_pre := v_pre || jsonb_build_object('p07', v_b);

    -- بيانات تجريبية بدور المالك (معرّفات صريحة)
    INSERT INTO public.users (user_id, email, password_hash, role, is_active) OVERRIDING SYSTEM VALUE VALUES
        (9101, 'p1@t2e.local', 'h', 'patient', true), (9102, 'p2@t2e.local', 'h', 'patient', true),
        (9201, 'd1@t2e.local', 'h', 'doctor', true), (9301, 'newdoc@t2e.local', 'h', 'doctor', true);
    INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9001, 't2e-s1', 20), (9002, 't2e-s2', 30);
    INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, gender) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9101, 'P', 'One', '0911111111', '1990-01-01', 'male'), (9002, 9102, 'P', 'Two', '0911111112', '1990-01-02', 'female');
    INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9201, 9001, 'D', 'One', '1980-01-01', '0922222221');

    -- منح اختبارية داخل هذه المعاملة فقط (تُتراجع): إدراج أعمدة الهوية لإدراج معرّفات صريحة دون استهلاك التسلسلات
    GRANT INSERT (user_id) ON public.users TO afiyah_app;
    GRANT INSERT (patient_id) ON public.patients TO afiyah_app;
    GRANT INSERT (doctor_id) ON public.doctors TO afiyah_app;
    GRANT INSERT (specialty_id) ON public.specialties TO afiyah_app;
    GRANT INSERT (appointment_id) ON public.appointments TO afiyah_app;
    GRANT INSERT (change_id) ON public.pending_changes TO afiyah_app;

    FOR r IN
        SELECT * FROM (VALUES
        -- ===== P: الكتالوج =====
        ('P01 no function is executable by PUBLIC (explicit ACLs, no PUBLIC entry)', NULL, NULL, format('SELECT %L::boolean', v_pre ->> 'p01'), 'OK'),
        ('P02 EXECUTE for afiyah_app is exactly the 7 helpers, cancel_pending_change and execute_due_pending_change (not execute_next_pending_change, not trigger functions)', NULL, NULL, format('SELECT %L::boolean', v_pre ->> 'p02'), 'OK'),
        ('P03 exactly the two entry points are SECURITY DEFINER, owned by omarsh, with the fixed search_path', NULL, NULL, format('SELECT %L::boolean', v_pre ->> 'p03'), 'OK'),
        ('P04 schema public: USAGE for afiyah_app, none for PUBLIC', NULL, NULL, format('SELECT %L::boolean', v_pre ->> 'p04'), 'OK'),
        ('P05 afiyah_app has SELECT but no table-level write, DELETE, TRUNCATE, REFERENCES or TRIGGER privilege', NULL, NULL, format('SELECT %L::boolean', v_pre ->> 'p05'), 'OK'),
        ('P06 column-level INSERT/UPDATE privileges are exactly the approved 39 (no identity, status, created_at, execute_at, role-change or email-update columns)', NULL, NULL, format('SELECT %L::boolean', v_pre ->> 'p06'), 'OK'),
        ('P07 afiyah_app has no privilege on any sequence', NULL, NULL, format('SELECT %L::boolean', v_pre ->> 'p07'), 'OK'),

        -- ===== B: عمليات مسموحة بدور afiyah_app =====
        ('B01 register a patient (users + patients)', NULL,
            $q$WITH u AS (INSERT INTO public.users (user_id, email, password_hash, role) OVERRIDING SYSTEM VALUE VALUES (9401, 'new@t2e.local', 'h', 'patient') RETURNING user_id) INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, gender) OVERRIDING SYSTEM VALUE SELECT 9401, user_id, 'N', 'P', '0933333333', '1995-05-05', 'male' FROM u$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.patients WHERE patient_id = 9401)$c$, 'OK'),
        ('B02 add a specialty', NULL,
            $q$INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9401, 't2e-new', 30)$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.specialties WHERE specialty_id = 9401)$c$, 'OK'),
        ('B03 add a doctor (the insert trigger runs with afiyah_app privileges)', NULL,
            $q$INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES (9401, 9301, 9002, 'D', 'New', '1980-02-02', '0922222229')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9401)$c$, 'OK'),
        ('B04 book an appointment (booking trigger, helpers and lock functions run as afiyah_app)', NULL,
            $q$INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time) OVERRIDING SYSTEM VALUE VALUES (9401, 9001, 9001, '{D1}', '10:00')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9401 AND status = 'booked')$c$, 'OK'),
        ('B05 cancel an appointment (UPDATE status)', c_ap || $q$(9401, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 9401$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9401 AND status = 'cancelled')$c$, 'OK'),
        ('B06 create a pending change (execute_at derived by the trigger, status pending)', NULL,
            c_pcd || $q$(9401, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9401 AND status = 'pending' AND execute_at = public.pending_execute_at(created_at))$c$, 'OK'),
        ('B07 cancel a pending change through the SECURITY DEFINER function', c_pcd || $q$(9401, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $q$SELECT public.cancel_pending_change(9401)$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9401 AND status = 'cancelled')$c$, 'OK'),
        ('B08 execute_due_pending_change() applies a due change',
            c_pcp || $q$(9401, 9001, NULL, 'update', '{"phone":"0966666666"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_due_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9001 AND phone = '0966666666') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9401 AND status = 'executed')$c$, 'OK'),
        ('B09 execute_due_pending_change() does NOT execute a change before its time (no early execution)', c_pcd || $q$(9401, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $q$SELECT public.execute_due_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9401 AND status = 'pending') AND EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9001 AND phone = '0922222221')$c$, 'OK'),
        ('B10 a patient can edit the profile fields', NULL,
            $q$UPDATE public.patients SET first_name = 'Edited', last_name = 'Name', phone = '0955555555', birth_date = '1991-01-01', address = 'Somewhere', gender = 'female', blood_type = 'O+' WHERE patient_id = 9001$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.patients WHERE patient_id = 9001 AND first_name = 'Edited' AND phone = '0955555555' AND address = 'Somewhere' AND gender = 'female' AND blood_type = 'O+')$c$, 'OK'),
        ('B11 a user can change the password hash', NULL,
            $q$UPDATE public.users SET password_hash = 'h2' WHERE user_id = 9101$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.users WHERE user_id = 9101 AND password_hash = 'h2')$c$, 'OK'),
        ('B12 login lookup (SELECT by email) works', NULL,
            $q$SELECT user_id, password_hash, role, is_active FROM public.users WHERE email = 'p1@t2e.local'$q$,
            $c$SELECT true$c$, 'OK'),

        -- ===== D: عمليات ممنوعة (42501) =====
        ('D01 cannot change patients.user_id', NULL, $q$UPDATE public.patients SET user_id = 9102 WHERE patient_id = 9001$q$, NULL, '42501'),
        ('D02 cannot change patients.patient_id (rejected by the GENERATED ALWAYS identity, 428C9, and not privileged anyway)', NULL, $q$UPDATE public.patients SET patient_id = 9999 WHERE patient_id = 9001$q$, NULL, '428C9'),
        ('D03 cannot change users.role', NULL, $q$UPDATE public.users SET role = 'admin' WHERE user_id = 9101$q$, NULL, '42501'),
        ('D04 cannot change users.email directly (doctor emails are deferred)', NULL, $q$UPDATE public.users SET email = 'x@t2e.local' WHERE user_id = 9201$q$, NULL, '42501'),
        ('D05 cannot change users.is_active directly', NULL, $q$UPDATE public.users SET is_active = false WHERE user_id = 9201$q$, NULL, '42501'),
        ('D06 cannot delete users', NULL, $q$DELETE FROM public.users WHERE user_id = 9101$q$, NULL, '42501'),
        ('D07 cannot delete patients', NULL, $q$DELETE FROM public.patients WHERE patient_id = 9001$q$, NULL, '42501'),
        ('D08 cannot update a doctor directly (deferred)', NULL, $q$UPDATE public.doctors SET phone = '0900000000' WHERE doctor_id = 9001$q$, NULL, '42501'),
        ('D09 cannot delete a doctor', NULL, $q$DELETE FROM public.doctors WHERE doctor_id = 9001$q$, NULL, '42501'),
        ('D10 cannot update a specialty directly (deferred)', NULL, $q$UPDATE public.specialties SET appointment_duration = 99 WHERE specialty_id = 9001$q$, NULL, '42501'),
        ('D11 cannot delete a specialty directly', NULL, $q$DELETE FROM public.specialties WHERE specialty_id = 9002$q$, NULL, '42501'),
        ('D12 cannot delete appointments', c_ap || $q$(9401, 9001, 9001, '{D1}', '10:00', 'booked')$q$, $q$DELETE FROM public.appointments WHERE appointment_id = 9401$q$, NULL, '42501'),
        ('D13 cannot move an appointment (time column)', c_ap || $q$(9401, 9001, 9001, '{D1}', '10:00', 'booked')$q$, $q$UPDATE public.appointments SET appointment_time = '11:00' WHERE appointment_id = 9401$q$, NULL, '42501'),
        ('D14 cannot update pending_changes directly', c_pcd || $q$(9401, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$, $q$UPDATE public.pending_changes SET status = 'executed' WHERE change_id = 9401$q$, NULL, '42501'),
        ('D15 cannot delete pending_changes', c_pcd || $q$(9401, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$, $q$DELETE FROM public.pending_changes WHERE change_id = 9401$q$, NULL, '42501'),
        ('D16 cannot insert a pending change with a status', NULL, $q$INSERT INTO public.pending_changes (doctor_id, change_type, new_data, status) VALUES (9001, 'update', '{"phone":"x"}', 'executed')$q$, NULL, '42501'),
        ('D17 cannot back-date a pending change (created_at)', NULL, $q$INSERT INTO public.pending_changes (doctor_id, change_type, new_data, created_at) VALUES (9001, 'update', '{"phone":"x"}', now() - interval '20 days')$q$, NULL, '42501'),
        ('D18 cannot insert an appointment with a chosen status', NULL, $q$INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, status) VALUES (9001, 9001, current_date, '10:00', 'cancelled')$q$, NULL, '42501'),
        ('D19 cannot insert users.is_active', NULL, $q$INSERT INTO public.users (email, password_hash, role, is_active) VALUES ('y@t2e.local', 'h', 'patient', false)$q$, NULL, '42501'),
        ('D20 cannot call execute_next_pending_change with an arbitrary timestamp (no early execution)', NULL, $q$SELECT public.execute_next_pending_change(clock_timestamp() + interval '30 days')$q$, NULL, '42501'),
        ('D21 cannot call a trigger function directly', NULL, $q$SELECT public.appointments_booking_guard()$q$, NULL, '42501'),
        ('D22 cannot TRUNCATE', NULL, $q$TRUNCATE public.appointments$q$, NULL, '42501'),
        ('D23 cannot create objects in public', NULL, $q$CREATE TABLE public.t2e_forbidden (a int)$q$, NULL, '42501'),
        ('D24 cannot disable triggers through session_replication_role', NULL, $q$SET session_replication_role = replica$q$, NULL, '42501'),

        -- ===== X: لا أثر باقٍ =====
        ('X01 the identity sequences were not consumed (read as owner)', NULL, NULL,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.users_user_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.patients_patient_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.doctors_doctor_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.specialties_specialty_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.appointments_appointment_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.pending_changes_change_id_seq WHERE is_called)$c$, 'OK')
        ) AS t(id, prep, stmt, chk, expect)
    LOOP
        v_prep := r.prep; v_stmt := r.stmt; v_chk := r.chk;
        FOR k IN 1 .. cardinality(v_keys) LOOP
            v_prep := replace(v_prep, v_keys[k], v_vals[k]);
            v_stmt := replace(v_stmt, v_keys[k], v_vals[k]);
            v_chk  := replace(v_chk,  v_keys[k], v_vals[k]);
        END LOOP;
        v_stage := 'init'; v_state := NULL; v_msg := NULL; v_harn := NULL;
        IF r.expect = 'OK' THEN
            IF v_chk IS NULL THEN v_harn := 'an OK case must have a chk'; END IF;
        ELSE
            IF v_stmt IS NULL THEN v_harn := 'an expected-failure case must have a stmt'; END IF;
            IF v_chk IS NOT NULL THEN v_harn := 'an expected-failure case must not have a chk'; END IF;
        END IF;
        IF v_stmt IS NOT NULL AND position(';' IN rtrim(v_stmt, '; ')) > 0 THEN v_harn := 'stmt must be a single statement'; END IF;

        IF v_harn IS NULL THEN
            BEGIN
                v_stage := 'prep';
                IF v_prep IS NOT NULL THEN EXECUTE v_prep; END IF;
                v_stage := 'stmt';
                IF v_stmt IS NOT NULL THEN
                    EXECUTE 'SET LOCAL ROLE afiyah_app';
                    EXECUTE v_stmt;
                    EXECUTE 'RESET ROLE';
                END IF;
                v_stage := 'chk';
                IF v_chk IS NOT NULL THEN
                    EXECUTE v_chk INTO v_bool;
                    IF v_bool IS DISTINCT FROM true THEN
                        RAISE EXCEPTION USING ERRCODE = 'AF998', MESSAGE = 'check-false';
                    END IF;
                END IF;
                v_stage := 'end';
                RAISE EXCEPTION USING ERRCODE = 'AF999', MESSAGE = 'ok-rollback';
            EXCEPTION WHEN OTHERS THEN
                v_state := SQLSTATE;
                v_msg := SQLERRM;
            END;
        END IF;

        IF v_harn IS NOT NULL THEN
            v_ok := false;
        ELSIF r.expect = 'OK' THEN
            v_ok := (v_stage = 'end' AND v_state = 'AF999');
        ELSE
            v_ok := (v_stage = 'stmt' AND v_state = r.expect);
        END IF;

        v_total := v_total + 1;
        v_grp := substring(r.id FROM '^[A-Z]+');
        v_n := jsonb_set(v_n, ARRAY[v_grp], to_jsonb(coalesce((v_n ->> v_grp)::int, 0) + 1));
        IF v_ok THEN
            v_p := jsonb_set(v_p, ARRAY[v_grp], to_jsonb(coalesce((v_p ->> v_grp)::int, 0) + 1));
        ELSE
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  (expected %, got % at stage %; %)', r.id, r.expect, coalesce(v_state, 'NULL'), v_stage, coalesce(v_msg, coalesce(v_harn, '-'));
        END IF;
    END LOOP;

    FOR r IN SELECT key AS grp, value::int AS n, coalesce((v_p ->> key)::int, 0) AS passed FROM jsonb_each_text(v_n) ORDER BY key LOOP
        RAISE NOTICE 'group %: %/% passed', r.grp, r.passed, r.n;
    END LOOP;
    RAISE NOTICE 'TOTAL: %/% passed, % failed', v_total - v_fail, v_total, v_fail;
    IF v_fail > 0 THEN
        RAISE EXCEPTION '% test(s) failed', v_fail;
    END IF;
END $t$;

ROLLBACK;
