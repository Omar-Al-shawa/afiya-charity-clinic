-- اختبارات المرحلة 1B-2d: التغييرات الإدارية المؤجَّلة (afiyah_test فقط). تُشغَّل بعد 005_pending_changes.sql.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f t2d_pending.sql
-- كل حالة داخل معاملة فرعية تُتراجع دائماً، والملف كله ينتهي بـ ROLLBACK؛ المعرّفات صريحة فلا تُستهلك قيم الهوية. حالات OK تتطلب chk، وحالات الفشل تُطابَق على SQLSTATE.
-- الطلبات المستحقة تُنشأ بـ created_at قديم: {PD} قبل 15 يوماً (سريانه أمس)، {P13} قبل 13 يوماً (سريانه غداً)، {P10} قبل 10 أيام (سريانه اليوم + 4)؛ {D1} أول يوم غير جمعة بعد اليوم، {DB} أول يوم غير جمعة من اليوم + 4.
\ir ../_guard.sql

BEGIN;

DO $pre$
BEGIN
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') <> 13 THEN
        RAISE EXCEPTION 'precondition failed: expected the 13 public functions (apply 002, 004 and 005)';
    END IF;
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
           AND t.tgname IN ('appointments_booking_trg', 'doctors_specialty_guard_trg', 'pending_changes_guard_trg', 'doctors_insert_guard_trg')) <> 4 THEN
        RAISE EXCEPTION 'precondition failed: the four application triggers are not installed';
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
    v_d1 date; v_db date;
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
    c_pc     constant text := 'INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES ';
    c_def    constant text := 'INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data) OVERRIDING SYSTEM VALUE VALUES ';
    c_lock   constant text := 'SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = ''advisory'' AND pid = pg_backend_pid() AND granted AND objsubid = 2 AND ';
BEGIN
    v_today := public.clinic_local(clock_timestamp())::date;
    v_d1 := v_today + 1; WHILE extract(dow FROM v_d1) = 5 LOOP v_d1 := v_d1 + 1; END LOOP;
    v_db := v_today + 4; WHILE extract(dow FROM v_db) = 5 LOOP v_db := v_db + 1; END LOOP;
    v_keys := ARRAY['{D1}', '{DB}', '{PD}', '{P13}', '{P10}'];
    v_vals := ARRAY[v_d1::text, v_db::text, (clock_timestamp() - interval '15 days')::text, (clock_timestamp() - interval '13 days')::text, (clock_timestamp() - interval '10 days')::text];

    -- بيانات تجريبية: اختصاصات S1 9001 (20 د) S2 9002 (30 د) S3 9003 و S4 9004 (بلا أطباء)؛ أطباء D1 9001 و D3 9003 في S1 و D2 9002 في S2؛ مريض P1 9001؛
    -- مستخدمون: 9101 مريض، 9201-9203 أطباء، 9205 لطبيب جديد، 9206 بريد محجوز (taken@t2d.local) لاختبار تعارض البريد.
    INSERT INTO public.users (user_id, email, password_hash, role, is_active) OVERRIDING SYSTEM VALUE VALUES
        (9101, 'p1@t2d.local', 'h', 'patient', true), (9201, 'd1@t2d.local', 'h', 'doctor', true), (9202, 'd2@t2d.local', 'h', 'doctor', true),
        (9203, 'd3@t2d.local', 'h', 'doctor', true), (9205, 'd5@t2d.local', 'h', 'doctor', true), (9206, 'taken@t2d.local', 'h', 'patient', true);
    INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES
        (9001, 't2d-s1', 20), (9002, 't2d-s2', 30), (9003, 't2d-s3', 25), (9004, 't2d-s4', 25);
    INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, gender) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9101, 'P', 'One', '0911111111', '1990-01-01', 'male');
    INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9201, 9001, 'D', 'One', '1980-01-01', '0922222221'),
        (9002, 9202, 9002, 'D', 'Two', '1980-01-02', '0922222222'),
        (9003, 9203, 9001, 'D', 'Three', '1980-01-03', '0922222223');

    FOR r IN
        SELECT * FROM (VALUES
        -- ===== C: إنشاء الطلبات =====
        ('C01 a doctor request gets execute_at from the database (14 Damascus days)', NULL,
            c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9101 AND status = 'pending' AND execute_at = public.pending_execute_at(created_at))$c$, 'OK'),
        ('C02 a specialty update request is accepted', NULL,
            c_def || $q$(9101, NULL, 9001, 'update', '{"appointment_duration":40}')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9101 AND status = 'pending' AND execute_at = public.pending_execute_at(created_at))$c$, 'OK'),
        ('C03 a specialty deletion request is accepted when no doctor references it', NULL,
            c_def || $q$(9101, NULL, 9003, 'delete', NULL)$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9101 AND change_type = 'delete')$c$, 'OK'),
        ('C04 a specialty deletion request is rejected while doctors reference the specialty', NULL,
            c_def || $q$(9101, NULL, 9001, 'delete', NULL)$q$, NULL, 'AF120'),
        ('C05 a second pending request for the same doctor is rejected', c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            c_def || $q$(9102, 9001, NULL, 'update', '{"phone":"0944444442"}')$q$, NULL, '23505'),
        ('C06 a doctor request takes the shared specialty lock and the doctor lock', NULL,
            c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            c_lock || $c$classid::bigint = 1 AND objid::bigint = 9001 AND mode = 'ShareLock') AND $c$ || substr(c_lock, 8) || $c$classid::bigint = 2 AND objid::bigint = 9001 AND mode = 'ExclusiveLock')$c$, 'OK'),
        ('C07 a specialty request takes the exclusive specialty lock', NULL,
            c_def || $q$(9101, NULL, 9001, 'update', '{"appointment_duration":40}')$q$,
            c_lock || $c$classid::bigint = 1 AND objid::bigint = 9001 AND mode = 'ExclusiveLock')$c$, 'OK'),

        -- ===== D: إضافة طبيب =====
        ('D01 a doctor can be added to a specialty without a pending deletion', NULL,
            $q$INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES (9005, 9205, 9002, 'D', 'Five', '1980-01-05', '0922222225')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9005)$c$, 'OK'),
        ('D02 a doctor cannot be added to a specialty with a pending deletion', c_def || $q$(9101, NULL, 9003, 'delete', NULL)$q$,
            $q$INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES (9005, 9205, 9003, 'D', 'Five', '1980-01-05', '0922222225')$q$, NULL, 'AF121'),
        ('D03 a pending update (not deletion) on the specialty does not block adding a doctor', c_def || $q$(9101, NULL, 9003, 'update', '{"appointment_duration":40}')$q$,
            $q$INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES (9005, 9205, 9003, 'D', 'Five', '1980-01-05', '0922222225')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9005)$c$, 'OK'),
        ('D04 adding a doctor takes the shared specialty lock', NULL,
            $q$INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE VALUES (9005, 9205, 9002, 'D', 'Five', '1980-01-05', '0922222225')$q$,
            c_lock || $c$classid::bigint = 1 AND objid::bigint = 9002 AND mode = 'ShareLock')$c$, 'OK'),

        -- ===== K: الإلغاء وتجميد الطلبات =====
        ('K01 cancelling before the effective time works and takes specialty (shared) then doctor locks', c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $q$SELECT public.cancel_pending_change(9101)$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9101 AND status = 'cancelled') AND $c$ || substr(c_lock, 8) || $c$classid::bigint = 1 AND objid::bigint = 9001 AND mode = 'ShareLock') AND $c$ || substr(c_lock, 8) || $c$classid::bigint = 2 AND objid::bigint = 9001 AND mode = 'ExclusiveLock')$c$, 'OK'),
        ('K02 cancelling after the effective time is rejected',
            c_pc || $q$(9101, 9001, NULL, 'update', '{"phone":"0966666666"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.cancel_pending_change(9101)$q$, NULL, 'AF122'),
        ('K03 cancelling an already executed change is rejected',
            c_pc || $q$(9101, 9001, NULL, 'update', '{"phone":"0966666666"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz)); SELECT public.execute_next_pending_change()$q$,
            $q$SELECT public.cancel_pending_change(9101)$q$, NULL, 'AF122'),
        ('K04 cancelling an unknown change is rejected', NULL, $q$SELECT public.cancel_pending_change(99999)$q$, NULL, 'AF122'),
        ('K05 cancelling NULL is rejected', NULL, $q$SELECT public.cancel_pending_change(NULL)$q$, NULL, '22004'),
        ('K06 the content of a pending change cannot be edited', c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $q$UPDATE public.pending_changes SET new_data = '{"phone":"0900000000"}' WHERE change_id = 9101$q$, NULL, 'AF122'),
        ('K07 a cancelled change is frozen', c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}'); SELECT public.cancel_pending_change(9101)$q$,
            $q$UPDATE public.pending_changes SET status = 'executed' WHERE change_id = 9101$q$, NULL, 'AF122'),
        ('K08 cancelling restores the booking horizon immediately',
            c_pc || $q$(9101, 9003, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '{P10}'::timestamptz, public.pending_execute_at('{P10}'::timestamptz)); SELECT public.cancel_pending_change(9101)$q$,
            c_ap || $q$(9201, 9001, 9003, '{DB}', '10:00', 'booked')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9201)$c$, 'OK'),

        -- ===== E: التنفيذ =====
        ('E01 nothing due: the executor returns NULL', NULL, NULL, $c$SELECT public.execute_next_pending_change() IS NULL$c$, 'OK'),
        ('E02 a request that is not yet due is left pending', c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$, NULL,
            $c$SELECT public.execute_next_pending_change() IS NULL AND (SELECT status FROM public.pending_changes WHERE change_id = 9101) = 'pending'$c$, 'OK'),
        ('E03 a due doctor update is applied (profile fields and account email)',
            c_pc || $q$(9101, 9001, NULL, 'update', '{"phone":"0966666666","email":"new-d1@t2d.local","years_of_experience":7,"biography":"bio","image_url":null}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.doctors d JOIN public.users u ON u.user_id = d.user_id WHERE d.doctor_id = 9001 AND d.phone = '0966666666' AND d.years_of_experience = 7 AND d.biography = 'bio' AND d.image_url IS NULL AND d.first_name = 'D' AND u.email = 'new-d1@t2d.local') AND (SELECT status FROM public.pending_changes WHERE change_id = 9101) = 'executed'$c$, 'OK'),
        ('E04 a due doctor deletion deactivates the account and keeps the doctor row',
            c_pc || $q$(9101, 9001, NULL, 'delete', NULL, 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.doctors d JOIN public.users u ON u.user_id = d.user_id WHERE d.doctor_id = 9001 AND NOT u.is_active) AND (SELECT status FROM public.pending_changes WHERE change_id = 9101) = 'executed'$c$, 'OK'),
        ('E05 a due specialty update is applied',
            c_pc || $q$(9101, NULL, 9001, 'update', '{"specialty_name":"t2d-renamed","appointment_duration":40}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.specialties WHERE specialty_id = 9001 AND specialty_name = 't2d-renamed' AND appointment_duration = 40) AND (SELECT status FROM public.pending_changes WHERE change_id = 9101) = 'executed'$c$, 'OK'),
        ('E06 a due specialty deletion physically deletes it (its own request goes with it by cascade)',
            c_pc || $q$(9101, NULL, 9003, 'delete', NULL, 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.specialties WHERE specialty_id = 9003) AND NOT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9101)$c$, 'OK'),
        ('E07 a conflict records failed with a reason and leaves the data unchanged (email already taken)',
            c_pc || $q$(9101, 9001, NULL, 'update', '{"phone":"0977777777","email":"taken@t2d.local"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9101 AND status = 'failed' AND failure_reason IS NOT NULL AND btrim(failure_reason) <> '') AND EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9001 AND phone = '0922222221')$c$, 'OK'),
        ('E08 defensive guard: a booked appointment on or after the effective date makes a doctor deletion fail',
            c_ap || $q$(9201, 9001, 9001, '{D1}', '10:00', 'booked'); $q$ || c_pc || $q$(9101, 9001, NULL, 'delete', NULL, 'pending', NULL, '{P13}'::timestamptz, public.pending_execute_at('{P13}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change(clock_timestamp() + interval '30 days')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9101 AND status = 'failed' AND failure_reason LIKE '%booked appointments%') AND EXISTS (SELECT 1 FROM public.users WHERE user_id = 9201 AND is_active)$c$, 'OK'),
        ('E09 one change per call, in order of effective time then id',
            c_pc || $q$(9101, 9001, NULL, 'update', '{"phone":"0966666661"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz)), (9102, 9002, NULL, 'update', '{"phone":"0966666662"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            $c$SELECT (SELECT string_agg(status, ',' ORDER BY change_id) FROM public.pending_changes) = 'executed,pending'$c$, 'OK'),
        ('E10 executing again is idempotent (nothing left to do)',
            c_pc || $q$(9101, 9001, NULL, 'update', '{"phone":"0966666661"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz)); SELECT public.execute_next_pending_change()$q$, NULL,
            $c$SELECT public.execute_next_pending_change() IS NULL AND (SELECT status FROM public.pending_changes WHERE change_id = 9101) = 'executed'$c$, 'OK'),
        ('E11 executing a doctor change takes the shared specialty lock then the doctor lock',
            c_pc || $q$(9101, 9001, NULL, 'update', '{"phone":"0966666661"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            c_lock || $c$classid::bigint = 1 AND objid::bigint = 9001 AND mode = 'ShareLock') AND $c$ || substr(c_lock, 8) || $c$classid::bigint = 2 AND objid::bigint = 9001 AND mode = 'ExclusiveLock')$c$, 'OK'),
        ('E12 executing a specialty change takes the exclusive specialty lock',
            c_pc || $q$(9101, NULL, 9002, 'update', '{"specialty_name":"t2d-s2b"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $q$SELECT public.execute_next_pending_change()$q$,
            c_lock || $c$classid::bigint = 1 AND objid::bigint = 9002 AND mode = 'ExclusiveLock')$c$, 'OK'),
        ('E13 after a doctor deletion executes, bookings with that doctor are rejected',
            c_pc || $q$(9101, 9001, NULL, 'delete', NULL, 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz)); SELECT public.execute_next_pending_change()$q$,
            c_ap || $q$(9201, 9001, 9001, '{D1}', '10:00', 'booked')$q$, NULL, 'AF102'),
        ('E14 a cancelled request is never executed', c_def || $q$(9101, 9001, NULL, 'update', '{"phone":"0944444441"}'); SELECT public.cancel_pending_change(9101)$q$, NULL,
            $c$SELECT public.execute_next_pending_change(clock_timestamp() + interval '30 days') IS NULL AND (SELECT status FROM public.pending_changes WHERE change_id = 9101) = 'cancelled'$c$, 'OK'),

        -- ===== X =====
        ('X01 the identity sequences were not consumed', NULL, NULL,
            $c$SELECT (SELECT count(*) FROM pg_sequences WHERE schemaname = 'public') = 6 AND NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL)$c$, 'OK'),
        ('X02 exactly the four application triggers exist and are enabled', NULL, NULL,
            $c$SELECT (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace AND t.tgenabled = 'O') = 4$c$, 'OK')
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
                IF v_stmt IS NOT NULL THEN EXECUTE v_stmt; END IF;
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
