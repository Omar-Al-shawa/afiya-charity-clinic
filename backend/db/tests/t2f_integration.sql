-- المرحلة 1B-2f: اختبار تكامل نهائي لسير العمل الكامل (afiyah_test فقط). تُشغَّل بعد 001-006.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f t2f_integration.sql
-- سير عمل واحد متسلسل داخل معاملة واحدة تنتهي بـ ROLLBACK: كل خطوة تُنفَّذ بدور afiyah_app (SET LOCAL ROLE) إلا خطوة تجهيز طلب مستحق واحد بدور المالك.
-- الخطوة الناجحة تبقى آثارها للخطوات اللاحقة؛ والخطوة المتوقع فشلها تُتراجع وحدها وتُطابَق على SQLSTATE. معرّفات صريحة ومنحة اختبارية لأعمدة الهوية داخل المعاملة فقط (تُتراجع)
-- فلا تُستهلك التسلسلات. التزامن مغطى باختبارات t2b_locks و t2c_race و t2d_race الموجودة. {D1} أول يوم غير جمعة بعد اليوم، {PD} وقت إنشاء قبل 15 يوماً.
\ir ../_guard.sql

BEGIN;

DO $pre$
BEGIN
    IF (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.doctors)
       + (SELECT count(*) FROM public.specialties) + (SELECT count(*) FROM public.appointments)
       + (SELECT count(*) FROM public.pending_changes) > 0 THEN
        RAISE EXCEPTION 'precondition failed: tables must be empty';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL) THEN
        RAISE EXCEPTION 'precondition failed: identity sequences are already in use';
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') <> 14
       OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace) <> 4 THEN
        RAISE EXCEPTION 'precondition failed: expected 14 functions and 4 triggers (stages 1B-2b to 1B-2e)';
    END IF;
END $pre$;

DO $t$
DECLARE
    r        record;
    v_today  date;
    v_d1     date;
    v_keys   text[];
    v_vals   text[];
    k        int;
    v_stmt   text; v_chk text;
    v_state  text; v_msg text; v_stage text; v_ok boolean; v_bool boolean;
    v_total  int := 0;
    v_fail   int := 0;
    c_book   constant text := 'INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time) OVERRIDING SYSTEM VALUE VALUES ';
    c_pend   constant text := 'INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data) OVERRIDING SYSTEM VALUE VALUES ';
BEGIN
    v_today := public.clinic_local(clock_timestamp())::date;
    v_d1 := v_today + 1; WHILE extract(dow FROM v_d1) = 5 LOOP v_d1 := v_d1 + 1; END LOOP;
    v_keys := ARRAY['{D1}', '{PD}'];
    v_vals := ARRAY[v_d1::text, (clock_timestamp() - interval '15 days')::text];

    -- منح اختبارية داخل هذه المعاملة فقط (تُتراجع): إدراج أعمدة الهوية بمعرّفات صريحة دون استهلاك التسلسلات
    GRANT INSERT (user_id) ON public.users TO afiyah_app;
    GRANT INSERT (patient_id) ON public.patients TO afiyah_app;
    GRANT INSERT (doctor_id) ON public.doctors TO afiyah_app;
    GRANT INSERT (specialty_id) ON public.specialties TO afiyah_app;
    GRANT INSERT (appointment_id) ON public.appointments TO afiyah_app;
    GRANT INSERT (change_id) ON public.pending_changes TO afiyah_app;

    FOR r IN
        SELECT * FROM (VALUES
        -- ===== 1. المرضى: تسجيل وتعديل الملف =====
        ('F01 register patient A (users + patients)', 'app',
            $q$WITH u AS (INSERT INTO public.users (user_id, email, password_hash, role) OVERRIDING SYSTEM VALUE VALUES (9101, 'a@t2f.local', 'h', 'patient') RETURNING user_id) INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, gender) OVERRIDING SYSTEM VALUE SELECT 9001, user_id, 'Anna', 'A', '0911111111', '1990-01-01', 'female' FROM u$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.patients WHERE patient_id = 9001)$c$, 'OK'),
        ('F02 register patient B', 'app',
            $q$WITH u AS (INSERT INTO public.users (user_id, email, password_hash, role) OVERRIDING SYSTEM VALUE VALUES (9102, 'b@t2f.local', 'h', 'patient') RETURNING user_id) INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, gender) OVERRIDING SYSTEM VALUE SELECT 9002, user_id, 'Bob', 'B', '0911111112', '1991-02-02', 'male' FROM u$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.patients WHERE patient_id = 9002)$c$, 'OK'),
        ('F03 patient A edits the profile', 'app',
            $q$UPDATE public.patients SET first_name = 'Edited', phone = '0955555555', address = 'Damascus', blood_type = 'A+' WHERE patient_id = 9001$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.patients WHERE patient_id = 9001 AND first_name = 'Edited' AND phone = '0955555555' AND address = 'Damascus' AND blood_type = 'A+')$c$, 'OK'),
        -- ===== 2. الاختصاصات والأطباء =====
        ('F04 create two specialties (20 and 30 minutes)', 'app',
            $q$INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9001, 'General', 20), (9002, 'Cardiology', 30)$q$,
            $c$SELECT (SELECT count(*) FROM public.specialties) = 2$c$, 'OK'),
        ('F05 create two doctors with their accounts', 'app',
            $q$WITH u AS (INSERT INTO public.users (user_id, email, password_hash, role) OVERRIDING SYSTEM VALUE VALUES (9201, 'd1@t2f.local', 'h', 'doctor'), (9202, 'd2@t2f.local', 'h', 'doctor') RETURNING user_id) INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone) OVERRIDING SYSTEM VALUE SELECT user_id - 9200 + 9000, user_id, CASE user_id WHEN 9201 THEN 9001 ELSE 9002 END, 'Doc', 'N', '1980-01-01', '0922222222' FROM u$q$,
            $c$SELECT (SELECT count(*) FROM public.doctors) = 2 AND EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9001 AND specialty_id = 9001) AND EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9002 AND specialty_id = 9002)$c$, 'OK'),
        -- ===== 3-5. الحجز والتعارض والإلغاء =====
        ('F06 book A with doctor 1 at 10:00', 'app', c_book || $q$(9401, 9001, 9001, '{D1}', '10:00')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9401 AND status = 'booked')$c$, 'OK'),
        ('F07 duplicate booking of the same slot by B is rejected (AF107)', 'app', c_book || $q$(9402, 9002, 9001, '{D1}', '10:00')$q$, NULL, 'AF107'),
        ('F08 partially overlapping booking with the same doctor (10:10) is rejected (AF107)', 'app', c_book || $q$(9402, 9002, 9001, '{D1}', '10:10')$q$, NULL, 'AF107'),
        ('F09 patient A double-booked with another doctor at 10:00 is rejected (AF108)', 'app', c_book || $q$(9402, 9001, 9002, '{D1}', '10:00')$q$, NULL, 'AF108'),
        ('F10 patient A partially overlapping with another doctor (10:10) is rejected (AF108)', 'app', c_book || $q$(9402, 9001, 9002, '{D1}', '10:10')$q$, NULL, 'AF108'),
        ('F11 patient A books a non-overlapping slot with doctor 2 (11:00)', 'app', c_book || $q$(9402, 9001, 9002, '{D1}', '11:00')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9402 AND status = 'booked')$c$, 'OK'),
        ('F12 patient A cancels the 10:00 booking', 'app', $q$UPDATE public.appointments SET status = 'cancelled' WHERE appointment_id = 9401$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9401 AND status = 'cancelled')$c$, 'OK'),
        ('F13 the cancelled slot is available again: B books doctor 1 at 10:00', 'app', c_book || $q$(9403, 9002, 9001, '{D1}', '10:00')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9403 AND status = 'booked')$c$, 'OK'),
        ('F14 a cancelled booking cannot be reactivated (AF112)', 'app', $q$UPDATE public.appointments SET status = 'booked' WHERE appointment_id = 9401$q$, NULL, 'AF112'),
        -- ===== 6-7. التغييرات المؤجلة =====
        ('F15 the admin requests a doctor change: execute_at is 00:00 Damascus, 14 calendar days later', 'app',
            c_pend || $q$(9501, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9501 AND status = 'pending' AND execute_at = public.pending_execute_at(created_at) AND public.clinic_local(execute_at)::date = public.clinic_local(created_at)::date + 14 AND public.clinic_local(execute_at)::time = time '00:00')$c$, 'OK'),
        ('F16 a second pending change for the same doctor is rejected (23505)', 'app', c_pend || $q$(9502, 9001, NULL, 'update', '{"phone":"0944444442"}')$q$, NULL, '23505'),
        ('F17 the admin cancels the pending change', 'app', $q$SELECT public.cancel_pending_change(9501)$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9501 AND status = 'cancelled')$c$, 'OK'),
        ('F18 a new pending change for the doctor is accepted after the cancellation', 'app', c_pend || $q$(9503, 9001, NULL, 'update', '{"phone":"0944444441"}')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9503 AND status = 'pending')$c$, 'OK'),
        ('F19 running the executor now does NOT apply the not-yet-due change', 'app', $q$SELECT public.execute_due_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9503 AND status = 'pending') AND EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9001 AND phone = '0922222222')$c$, 'OK'),
        ('F20 the application role cannot run the executor with an arbitrary timestamp (42501)', 'app', $q$SELECT public.execute_next_pending_change(clock_timestamp() + interval '30 days')$q$, NULL, '42501'),
        ('F21 (owner) prepare one change that is already due (created 15 days ago) for doctor 2', 'owner',
            $q$INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, failure_reason, created_at, execute_at) OVERRIDING SYSTEM VALUE VALUES (9504, 9002, NULL, 'update', '{"phone":"0966666666"}', 'pending', NULL, '{PD}'::timestamptz, public.pending_execute_at('{PD}'::timestamptz))$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9504)$c$, 'OK'),
        ('F22 a due-but-unexecuted change still restricts new bookings of that doctor (AF106)', 'app', c_book || $q$(9404, 9002, 9002, '{D1}', '14:00')$q$, NULL, 'AF106'),
        ('F23 the executor applies exactly the due change and leaves the not-yet-due one pending', 'app', $q$SELECT public.execute_due_pending_change()$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9504 AND status = 'executed') AND EXISTS (SELECT 1 FROM public.doctors WHERE doctor_id = 9002 AND phone = '0966666666') AND EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9503 AND status = 'pending')$c$, 'OK'),
        ('F24 after execution the restriction is lifted: B books doctor 2 at 14:00', 'app', c_book || $q$(9404, 9002, 9002, '{D1}', '14:00')$q$,
            $c$SELECT EXISTS (SELECT 1 FROM public.appointments WHERE appointment_id = 9404 AND status = 'booked')$c$, 'OK'),
        -- ===== 8. محاولات تجاوز القيود بدور afiyah_app =====
        ('F25 cannot update a doctor directly (42501)', 'app', $q$UPDATE public.doctors SET phone = '0900000000' WHERE doctor_id = 9001$q$, NULL, '42501'),
        ('F26 cannot delete an appointment (42501)', 'app', $q$DELETE FROM public.appointments WHERE appointment_id = 9402$q$, NULL, '42501'),
        ('F27 cannot edit a pending change directly (42501)', 'app', $q$UPDATE public.pending_changes SET status = 'executed' WHERE change_id = 9503$q$, NULL, '42501'),
        ('F28 cannot change an account email directly (42501)', 'app', $q$UPDATE public.users SET email = 'x@t2f.local' WHERE user_id = 9201$q$, NULL, '42501'),
        ('F29 cannot choose an appointment status on insert (42501)', 'app', $q$INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, appointment_time, status) VALUES (9001, 9001, current_date, '10:00', 'cancelled')$q$, NULL, '42501'),
        -- ===== 9. سلامة البيانات بعد السير الكامل =====
        ('F30 integrity: row counts, no overlapping booked appointments, one pending change per target, execute_at consistent', 'owner', NULL,
            $c$SELECT (SELECT count(*) FROM public.users) = 4 AND (SELECT count(*) FROM public.patients) = 2 AND (SELECT count(*) FROM public.doctors) = 2
                AND (SELECT count(*) FROM public.specialties) = 2 AND (SELECT count(*) FROM public.appointments) = 4 AND (SELECT count(*) FROM public.pending_changes) = 3
                AND (SELECT string_agg(status, ',' ORDER BY appointment_id) FROM public.appointments) = 'cancelled,booked,booked,booked'
                AND NOT EXISTS (SELECT 1 FROM public.appointments a
                                  JOIN public.appointments b ON a.appointment_id < b.appointment_id AND a.status = 'booked' AND b.status = 'booked' AND a.appointment_date = b.appointment_date
                                   AND (a.doctor_id = b.doctor_id OR a.patient_id = b.patient_id)
                                  JOIN public.doctors da ON da.doctor_id = a.doctor_id JOIN public.specialties sa ON sa.specialty_id = da.specialty_id
                                  JOIN public.doctors db ON db.doctor_id = b.doctor_id JOIN public.specialties sb ON sb.specialty_id = db.specialty_id
                                 WHERE a.appointment_time < b.appointment_time + make_interval(mins => sb.appointment_duration)
                                   AND b.appointment_time < a.appointment_time + make_interval(mins => sa.appointment_duration))
                AND NOT EXISTS (SELECT doctor_id FROM public.pending_changes WHERE status = 'pending' AND doctor_id IS NOT NULL GROUP BY doctor_id HAVING count(*) > 1)
                AND NOT EXISTS (SELECT 1 FROM public.pending_changes WHERE execute_at <> public.pending_execute_at(created_at))$c$, 'OK'),
        ('F31 identity sequences were not consumed by the whole workflow (read as owner)', 'owner', NULL,
            $c$SELECT NOT EXISTS (SELECT 1 FROM public.users_user_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.patients_patient_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.doctors_doctor_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.specialties_specialty_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.appointments_appointment_id_seq WHERE is_called) AND NOT EXISTS (SELECT 1 FROM public.pending_changes_change_id_seq WHERE is_called)$c$, 'OK')
        ) AS t(id, who, stmt, chk, expect)
    LOOP
        v_stmt := r.stmt; v_chk := r.chk;
        FOR k IN 1 .. cardinality(v_keys) LOOP
            v_stmt := replace(v_stmt, v_keys[k], v_vals[k]);
            v_chk  := replace(v_chk,  v_keys[k], v_vals[k]);
        END LOOP;
        v_state := NULL; v_msg := NULL; v_stage := 'init';
        BEGIN
            v_stage := 'stmt';
            IF v_stmt IS NOT NULL THEN
                IF r.who = 'app' THEN EXECUTE 'SET LOCAL ROLE afiyah_app'; END IF;
                EXECUTE v_stmt;
                IF r.who = 'app' THEN EXECUTE 'RESET ROLE'; END IF;
            END IF;
            v_stage := 'chk';
            IF v_chk IS NOT NULL THEN
                EXECUTE v_chk INTO v_bool;
                IF v_bool IS DISTINCT FROM true THEN
                    RAISE EXCEPTION USING ERRCODE = 'AF998', MESSAGE = 'check-false';
                END IF;
            END IF;
            v_stage := 'end';
            IF r.expect <> 'OK' THEN
                RAISE EXCEPTION USING ERRCODE = 'AF997', MESSAGE = 'expected an error but the statement succeeded';
            END IF;
            v_state := 'DONE';
        EXCEPTION WHEN OTHERS THEN
            v_state := SQLSTATE;
            v_msg := SQLERRM;
        END;

        IF r.expect = 'OK' THEN
            v_ok := (v_stage = 'end' AND v_state = 'DONE');
        ELSE
            v_ok := (v_stage = 'stmt' AND v_state = r.expect);
        END IF;
        v_total := v_total + 1;
        IF NOT v_ok THEN
            v_fail := v_fail + 1;
            RAISE NOTICE 'FAIL  %  (expected %, got % at stage %; %)', r.id, r.expect, coalesce(v_state, 'NULL'), v_stage, coalesce(v_msg, '-');
        END IF;
    END LOOP;

    RAISE NOTICE 'TOTAL: %/% passed, % failed', v_total - v_fail, v_total, v_fail;
    IF v_fail > 0 THEN
        RAISE EXCEPTION '% integration step(s) failed', v_fail;
    END IF;
END $t$;

ROLLBACK;
