-- اختبارات المرحلة 1B-2c: مشغّلا الحجز وتثبيت اختصاص الطبيب (afiyah_test فقط). تُشغَّل بعد 004_booking_triggers.sql.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f t2c_booking.sql
-- كل حالة داخل معاملة فرعية تُتراجع دائماً، والملف كله ينتهي بـ ROLLBACK؛ المعرّفات صريحة (OVERRIDING SYSTEM VALUE) فلا تُستهلك قيم الهوية.
-- التواريخ ديناميكية بتوقيت دمشق (النافذة: اليوم حتى اليوم + 13، والجمعة مغلقة): {D1} {D2} أول أيام غير الجمعة بعد اليوم، {FRI} أول جمعة، {PAST} آخر يوم غير جمعة ماضٍ،
-- {LAST} آخر يوم غير جمعة داخل النافذة، {FAR} أول يوم غير جمعة بعد النافذة، {DB} أول يوم غير جمعة من اليوم + 4 (تاريخ سريان التغيير المعلّق التجريبي)، {PC} وقت إنشاء ذلك الطلب.
-- حالات الفشل المتوقع تُطابَق على SQLSTATE (AF1xx)، وحالات النجاح (OK) تتطلب chk. اختبار AF113 (عزل REPEATABLE READ) في concurrency/t2c_race.sh لأنه يحتاج معاملة مستقلة.
\ir ../_guard.sql

BEGIN;

DO $pre$
BEGIN
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') <> 9 THEN
        RAISE EXCEPTION 'precondition failed: expected the 9 public functions (apply 002_functions.sql and 004_booking_triggers.sql)';
    END IF;
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
           AND t.tgname IN ('appointments_booking_trg', 'doctors_specialty_guard_trg')) <> 2 THEN
        RAISE EXCEPTION 'precondition failed: the two Stage 1B-2c triggers are not installed';
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
    v_d1 date; v_d2 date; v_fri date; v_past date; v_last date; v_far date; v_db date;
    v_pc     text;
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
    c_pcd    constant text := $q$INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES (9101, 9004, NULL, 'update', '{"phone":"0944444441"}', 'pending', NULL, '{PC}'::timestamptz, public.pending_execute_at('{PC}'::timestamptz))$q$;
    c_pcs    constant text := $q$INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES (9101, NULL, 9002, 'update', '{"appointment_duration":40}', 'pending', NULL, '{PC}'::timestamptz, public.pending_execute_at('{PC}'::timestamptz))$q$;
BEGIN
    v_today := public.clinic_local(clock_timestamp())::date;
    v_d1 := v_today + 1;   WHILE extract(dow FROM v_d1) = 5 LOOP v_d1 := v_d1 + 1; END LOOP;
    v_d2 := v_d1 + 1;      WHILE extract(dow FROM v_d2) = 5 LOOP v_d2 := v_d2 + 1; END LOOP;
    v_fri := v_today + 1;  WHILE extract(dow FROM v_fri) <> 5 LOOP v_fri := v_fri + 1; END LOOP;
    v_past := v_today - 1; WHILE extract(dow FROM v_past) = 5 LOOP v_past := v_past - 1; END LOOP;
    v_last := v_today + 13; WHILE extract(dow FROM v_last) = 5 LOOP v_last := v_last - 1; END LOOP;
    v_far := v_today + 14; WHILE extract(dow FROM v_far) = 5 LOOP v_far := v_far + 1; END LOOP;
    v_db := v_today + 4;   WHILE extract(dow FROM v_db) = 5 LOOP v_db := v_db + 1; END LOOP;
    v_pc := (clock_timestamp() - interval '10 days')::text;
    v_keys := ARRAY['{D1}', '{D2}', '{FRI}', '{PAST}', '{LAST}', '{FAR}', '{DB}', '{PC}'];
    v_vals := ARRAY[v_d1::text, v_d2::text, v_fri::text, v_past::text, v_last::text, v_far::text, v_db::text, v_pc];

    -- بيانات تجريبية بمعرّفات صريحة. اختصاصان: S1 9001 (20 د) S2 9002 (30 د). أطباء: D1 9001 و D3 9003 (حسابه غير نشط) و D4 9004 في S1؛ D2 9002 في S2. مرضى: P1 9001 P2 9002 P3 9003.
    INSERT INTO public.users (user_id, email, password_hash, role, is_active) OVERRIDING SYSTEM VALUE VALUES
        (9101, 'p1@t2c.local', 'h', 'patient', true), (9102, 'p2@t2c.local', 'h', 'patient', true), (9103, 'p3@t2c.local', 'h', 'patient', true),
        (9201, 'd1@t2c.local', 'h', 'doctor', true), (9202, 'd2@t2c.local', 'h', 'doctor', true),
        (9203, 'd3@t2c.local', 'h', 'doctor', false), (9204, 'd4@t2c.local', 'h', 'doctor', true);
    INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9001, 't2c-s1', 20), (9002, 't2c-s2', 30);
    INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, address, gender, blood_type) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9101, 'P', 'One', '0911111111', '1990-01-01', NULL, 'male', NULL),
        (9002, 9102, 'P', 'Two', '0911111112', '1990-01-02', NULL, 'female', NULL),
        (9003, 9103, 'P', 'Three', '0911111113', '1990-01-03', NULL, 'male', NULL);
    INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone, image_url, biography, years_of_experience) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9201, 9001, 'D', 'One',   '1980-01-01', '0922222221', NULL, NULL, NULL),
        (9002, 9202, 9002, 'D', 'Two',   '1980-01-02', '0922222222', NULL, NULL, NULL),
        (9003, 9203, 9001, 'D', 'Three', '1980-01-03', '0922222223', NULL, NULL, NULL),
        (9004, 9204, 9001, 'D', 'Four',  '1980-01-04', '0922222224', NULL, NULL, NULL);

    FOR r IN
        SELECT * FROM (VALUES
        -- ===== V: حجوزات صالحة وإلغاء =====
        ('V01 a valid booking is accepted', NULL, c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9101 AND status = 'booked')$c$, 'OK'),
        ('V02 adjacent after the doctor booking (10:20) is accepted', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9002, 9001, '{D1}', '10:20', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 9001 AND status = 'booked') = 2$c$, 'OK'),
        ('V03 adjacent before the doctor booking (09:40) is accepted', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9002, 9001, '{D1}', '09:40', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 9001 AND status = 'booked') = 2$c$, 'OK'),
        ('V04 another doctor at the same time for another patient is accepted', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9002, 9002, '{D1}', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE status = 'booked') = 2$c$, 'OK'),
        ('V05 a booking that ends exactly at 17:00 (16:40, 20 min) is accepted', NULL, c_ap || $q$(9101, 9001, 9001, '{D1}', '16:40', 'booked')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9101)$c$, 'OK'),
        ('V06 the last non-Friday day of the window is accepted', NULL, c_ap || $q$(9101, 9001, 9001, '{LAST}', '10:00', 'booked')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9101)$c$, 'OK'),
        ('V07 a cancelled booking releases its slot for a new booking',
            c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked'); UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 9101$q$,
            c_ap || $q$(9102, 9002, 9001, '{D1}', '10:00', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE doctor_id = 9001 AND status = 'booked') = 1 AND EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9101 AND status = 'cancelled')$c$, 'OK'),
        ('V08 cancelling a booked appointment is accepted', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 9101$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9101 AND status = 'cancelled')$c$, 'OK'),
        ('V09 a patient booking adjacent to another doctor booking of different duration is accepted', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9001, 9002, '{D1}', '10:20', 'booked')$q$,
            $c$SELECT (SELECT count(*) FROM public.appointments WHERE patient_id = 9001 AND status = 'booked') = 2$c$, 'OK'),
        ('V10 a cancelled row can be inserted directly without validation (history)', NULL, c_ap || $q$(9101, 9001, 9001, '{PAST}', '10:00', 'cancelled')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9101 AND status = 'cancelled')$c$, 'OK'),

        -- ===== O: تعارض المواعيد (بدايات مختلفة لا تكشفها الفهارس) =====
        ('O01 doctor overlap: starts inside (10:10)', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9002, 9001, '{D1}', '10:10', 'booked')$q$, NULL, 'AF107'),
        ('O02 doctor overlap: starts one minute before the end (10:19)', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9002, 9001, '{D1}', '10:19', 'booked')$q$, NULL, 'AF107'),
        ('O03 doctor overlap: ends inside (09:50)', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9002, 9001, '{D1}', '09:50', 'booked')$q$, NULL, 'AF107'),
        ('O04 doctor overlap: same start for another patient', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9002, 9001, '{D1}', '10:00', 'booked')$q$, NULL, 'AF107'),
        ('O05 patient overlap: same start with another doctor', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9001, 9002, '{D1}', '10:00', 'booked')$q$, NULL, 'AF108'),
        ('O06 patient overlap across durations (30 min visit 10:00, 20 min visit 10:20)', c_ap || $q$(9101, 9001, 9002, '{D1}', '10:00', 'booked')$q$,
            c_ap || $q$(9102, 9001, 9001, '{D1}', '10:20', 'booked')$q$, NULL, 'AF108'),
        ('O07 two overlapping rows in one statement: the second is rejected', NULL,
            c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked'), (9102, 9002, 9001, '{D1}', '10:10', 'booked')$q$, NULL, 'AF107'),

        -- ===== R: قواعد الحجز =====
        ('R01 Friday is closed', NULL, c_ap || $q$(9101, 9001, 9001, '{FRI}', '10:00', 'booked')$q$, NULL, 'AF109'),
        ('R02 a past date', NULL, c_ap || $q$(9101, 9001, 9001, '{PAST}', '10:00', 'booked')$q$, NULL, 'AF103'),
        ('R03 beyond the 14-day window', NULL, c_ap || $q$(9101, 9001, 9001, '{FAR}', '10:00', 'booked')$q$, NULL, 'AF104'),
        ('R04 before opening (08:30)', NULL, c_ap || $q$(9101, 9001, 9001, '{D1}', '08:30', 'booked')$q$, NULL, 'AF111'),
        ('R05 at closing time (17:00)', NULL, c_ap || $q$(9101, 9001, 9001, '{D1}', '17:00', 'booked')$q$, NULL, 'AF111'),
        ('R06 ends after 17:00 (16:45, 20 min)', NULL, c_ap || $q$(9101, 9001, 9001, '{D1}', '16:45', 'booked')$q$, NULL, 'AF105'),
        ('R07 an inactive doctor cannot receive bookings', NULL, c_ap || $q$(9101, 9001, 9003, '{D1}', '10:00', 'booked')$q$, NULL, 'AF102'),
        ('R08 an unknown doctor is rejected by the booking rules', NULL, c_ap || $q$(9101, 9001, 99999, '{D1}', '10:00', 'booked')$q$, NULL, 'AF102'),
        ('R09 a pending doctor change blocks bookings from its effective date', c_pcd, c_ap || $q$(9101, 9001, 9004, '{DB}', '10:00', 'booked')$q$, NULL, 'AF106'),
        ('R10 a pending doctor change allows bookings before its effective date', c_pcd, c_ap || $q$(9101, 9001, 9004, '{D1}', '10:00', 'booked')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9101)$c$, 'OK'),
        ('R11 a pending specialty change blocks bookings of its doctors from its effective date', c_pcs, c_ap || $q$(9101, 9001, 9002, '{DB}', '10:00', 'booked')$q$, NULL, 'AF106'),

        -- ===== T: تعديل الحجوزات وتثبيت اختصاص الطبيب =====
        ('T01 a cancelled appointment cannot be reactivated',
            c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked'); UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 9101$q$,
            $q$UPDATE public.appointments SET status = 'booked' WHERE appointment_id = 9101$q$, NULL, 'AF112'),
        ('T02 the time of a booking cannot be changed', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET appointment_time = '10:30' WHERE appointment_id = 9101$q$, NULL, 'AF112'),
        ('T03 the doctor of a booking cannot be changed', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET doctor_id = 9002 WHERE appointment_id = 9101$q$, NULL, 'AF112'),
        ('T04 the patient of a booking cannot be changed', c_ap || $q$(9101, 9001, 9001, '{D1}', '10:00', 'booked')$q$,
            $q$UPDATE public.appointments SET patient_id = 9002 WHERE appointment_id = 9101$q$, NULL, 'AF112'),
        ('T05 the specialty of a doctor cannot be changed', NULL,
            $q$UPDATE public.doctors SET specialty_id = 9002 WHERE doctor_id = 9001$q$, NULL, 'AF114'),
        ('T06 other doctor columns can still be updated', NULL,
            $q$UPDATE public.doctors SET phone = '0955555555' WHERE doctor_id = 9001$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9001 AND phone = '0955555555')$c$, 'OK'),

        -- ===== X: لا أثر باقٍ، والمشغّلان مثبَّتان =====
        ('X01 the identity sequences were not consumed', NULL, NULL,
            $c$SELECT (SELECT count(*) FROM pg_sequences WHERE schemaname = 'public') = 6 AND NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL)$c$, 'OK'),
        ('X02 exactly the two Stage 1B-2c triggers are installed and enabled', NULL, NULL,
            $c$SELECT (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace) = 2
               AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = 'appointments_booking_trg' AND c.relname = 'appointments' AND t.tgenabled = 'O')
               AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = 'doctors_specialty_guard_trg' AND c.relname = 'doctors' AND t.tgenabled = 'O')$c$, 'OK')
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
