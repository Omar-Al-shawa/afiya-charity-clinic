-- المرحلة 1B-2d: التغييرات الإدارية المؤجَّلة 14 يوماً (afiyah_test فقط).
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -1 -v expect_db=afiyah_test -d afiyah_test -f 005_pending_changes.sql
--
-- pending_changes_guard (قبل الإدراج أو التعديل):
--  * إدراج طلب بحالة pending: يُملأ execute_at من pending_execute_at(created_at) إن كان NULL (يُشتق في القاعدة بتقويم دمشق)، ثم تؤخذ الأقفال بترتيب الحجز نفسه:
--    للطبيب اختصاصه (مشترك) ثم الطبيب؛ ولطلب على اختصاص قفل الاختصاص الحصري. طلب حذف اختصاص يُرفض (AF120) ما دام طبيب (ولو غير نشط) يشير إليه.
--  * التعديل: انتقال pending إلى executed أو cancelled أو failed فقط دون تغيير أي عمود آخر؛ والإلغاء قبل execute_at فقط؛ وأي تعديل آخر يُرفض (AF122).
-- doctors_insert_guard: يمنع إضافة طبيب إلى اختصاص عليه طلب حذف معلّق (AF121)، بعد أخذ قفل الاختصاص المشترك فيتسلسل مع قفل الحذف الحصري.
-- execute_next_pending_change(p_now): ينفّذ طلباً مستحقاً واحداً فقط ويعيد معرّفه (أو NULL إن لم يوجد)؛ يكرّره الخلفي عند الإقلاع وقبل العمليات المعتمدة عليه (لا مجدوِل).
--  الأقفال ثم قفل الصف FOR UPDATE ثم إعادة التحقق من أنه لا يزال pending (idempotent)؛ التطبيق داخل كتلة فرعية، وأي تعارض أو خرق قيد يسجَّل failed مع failure_reason.
--  حذف الاختصاص DELETE فعلي؛ ON DELETE CASCADE المعتمد يزيل طلبه نفسه (لا يُحفظ سجله). حذف الطبيب ناعم: users.is_active = FALSE.
--  حماية دفاعية: إن وُجد حجز قائم في أو بعد تاريخ السريان لطبيب محذوف أو لاختصاص تتغيّر مدته، يصبح الطلب failed (لا يحدث عملياً لأن الحجز محجوب بتاريخ السريان).
-- cancel_pending_change(p_change_id): يأخذ أقفال التنفيذ نفسها بالترتيب نفسه قبل التعديل (فلا يتعارض مع التنفيذ ولا ينقلب ترتيب الأقفال مع قفل الصف)، ثم يلغي إن كان pending.
-- الرموز: AF120 حذف اختصاص يشير إليه أطباء | AF121 إضافة طبيب إلى اختصاص عليه حذف معلّق | AF122 تعديل أو إلغاء غير صالح (وAF113 العزل ليس READ COMMITTED).
-- SECURITY INVOKER مع search_path ثابت؛ تشديد الصلاحيات في 1B-2e.
\ir _guard.sql

CREATE FUNCTION public.pending_changes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
    v_spec integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.execute_at IS NULL AND NEW.created_at IS NOT NULL THEN
            NEW.execute_at := public.pending_execute_at(NEW.created_at);
        END IF;
        IF NEW.status = 'pending' THEN
            IF current_setting('transaction_isolation') <> 'read committed' THEN
                RAISE EXCEPTION 'pending changes require the READ COMMITTED isolation level' USING ERRCODE = 'AF113';
            END IF;
            IF NEW.doctor_id IS NOT NULL AND NEW.specialty_id IS NULL THEN
                SELECT d.specialty_id INTO v_spec FROM public.doctors d WHERE d.doctor_id = NEW.doctor_id;
                IF v_spec IS NOT NULL THEN
                    PERFORM public.lock_specialty(v_spec, true);
                END IF;
                PERFORM public.lock_doctor(NEW.doctor_id);
            ELSIF NEW.specialty_id IS NOT NULL AND NEW.doctor_id IS NULL THEN
                PERFORM public.lock_specialty(NEW.specialty_id, false);
                IF NEW.change_type = 'delete'
                   AND EXISTS (SELECT 1 FROM public.doctors d WHERE d.specialty_id = NEW.specialty_id) THEN
                    RAISE EXCEPTION 'a specialty referenced by doctors cannot be deleted' USING ERRCODE = 'AF120';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status <> 'pending' OR NEW.status NOT IN ('executed', 'cancelled', 'failed')
       OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
       OR NEW.specialty_id IS DISTINCT FROM OLD.specialty_id
       OR NEW.change_type IS DISTINCT FROM OLD.change_type
       OR NEW.new_data IS DISTINCT FROM OLD.new_data
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.execute_at IS DISTINCT FROM OLD.execute_at THEN
        RAISE EXCEPTION 'a pending change can only move from pending to executed, cancelled or failed' USING ERRCODE = 'AF122';
    END IF;
    IF NEW.status = 'cancelled' AND clock_timestamp() >= OLD.execute_at THEN
        RAISE EXCEPTION 'a pending change can only be cancelled before its effective time' USING ERRCODE = 'AF122';
    END IF;
    RETURN NEW;
END
$fn$;

CREATE FUNCTION public.doctors_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
    IF NEW.specialty_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'adding a doctor requires the READ COMMITTED isolation level' USING ERRCODE = 'AF113';
    END IF;
    PERFORM public.lock_specialty(NEW.specialty_id, true);
    IF EXISTS (SELECT 1 FROM public.pending_changes pc
                WHERE pc.specialty_id = NEW.specialty_id AND pc.change_type = 'delete' AND pc.status = 'pending') THEN
        RAISE EXCEPTION 'cannot add a doctor to a specialty with a pending deletion' USING ERRCODE = 'AF121';
    END IF;
    RETURN NEW;
END
$fn$;

CREATE FUNCTION public.execute_next_pending_change(p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
    v_id     integer;
    v_doc    integer;
    v_spec_t integer;
    v_spec   integer;
    v_type   text;
    v_nd     jsonb;
    v_exec   timestamptz;
    v_status text;
    v_eff    date;
    v_err    text;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'executing pending changes requires the READ COMMITTED isolation level' USING ERRCODE = 'AF113';
    END IF;

    SELECT pc.change_id, pc.doctor_id, pc.specialty_id
      INTO v_id, v_doc, v_spec_t
      FROM public.pending_changes pc
     WHERE pc.status = 'pending' AND pc.execute_at <= p_now
     ORDER BY pc.execute_at, pc.change_id
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- الأقفال بترتيب الحجز: اختصاص ثم طبيب (حصري للاختصاص عند طلب على اختصاص)
    IF v_doc IS NOT NULL THEN
        SELECT d.specialty_id INTO v_spec FROM public.doctors d WHERE d.doctor_id = v_doc;
        IF v_spec IS NOT NULL THEN
            PERFORM public.lock_specialty(v_spec, true);
        END IF;
        PERFORM public.lock_doctor(v_doc);
    ELSE
        PERFORM public.lock_specialty(v_spec_t, false);
    END IF;

    SELECT pc.change_type, pc.new_data, pc.execute_at, pc.status
      INTO v_type, v_nd, v_exec, v_status
      FROM public.pending_changes pc
     WHERE pc.change_id = v_id
       FOR UPDATE;
    IF NOT FOUND OR v_status <> 'pending' THEN
        RETURN v_id;
    END IF;
    v_eff := public.clinic_local(v_exec)::date;

    BEGIN
        IF v_doc IS NOT NULL AND v_type = 'update' THEN
            UPDATE public.doctors d
               SET first_name          = CASE WHEN v_nd ? 'first_name' THEN v_nd ->> 'first_name' ELSE d.first_name END,
                   last_name           = CASE WHEN v_nd ? 'last_name' THEN v_nd ->> 'last_name' ELSE d.last_name END,
                   birth_date          = CASE WHEN v_nd ? 'birth_date' THEN (v_nd ->> 'birth_date')::date ELSE d.birth_date END,
                   phone               = CASE WHEN v_nd ? 'phone' THEN v_nd ->> 'phone' ELSE d.phone END,
                   image_url           = CASE WHEN v_nd ? 'image_url' THEN v_nd ->> 'image_url' ELSE d.image_url END,
                   biography           = CASE WHEN v_nd ? 'biography' THEN v_nd ->> 'biography' ELSE d.biography END,
                   years_of_experience = CASE WHEN v_nd ? 'years_of_experience' THEN (v_nd ->> 'years_of_experience')::numeric::integer ELSE d.years_of_experience END
             WHERE d.doctor_id = v_doc;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'doctor % not found', v_doc;
            END IF;
            IF v_nd ? 'email' THEN
                UPDATE public.users u SET email = v_nd ->> 'email'
                 WHERE u.user_id = (SELECT d.user_id FROM public.doctors d WHERE d.doctor_id = v_doc);
            END IF;
        ELSIF v_doc IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.appointments a
                        WHERE a.doctor_id = v_doc AND a.status = 'booked' AND a.appointment_date >= v_eff) THEN
                RAISE EXCEPTION 'booked appointments exist on or after the effective date';
            END IF;
            UPDATE public.users u SET is_active = false
             WHERE u.user_id = (SELECT d.user_id FROM public.doctors d WHERE d.doctor_id = v_doc);
            IF NOT FOUND THEN
                RAISE EXCEPTION 'doctor % not found', v_doc;
            END IF;
        ELSIF v_type = 'update' THEN
            IF v_nd ? 'appointment_duration'
               AND EXISTS (SELECT 1 FROM public.appointments a JOIN public.doctors d ON d.doctor_id = a.doctor_id
                            WHERE d.specialty_id = v_spec_t AND a.status = 'booked' AND a.appointment_date >= v_eff) THEN
                RAISE EXCEPTION 'booked appointments exist on or after the effective date';
            END IF;
            UPDATE public.specialties s
               SET specialty_name       = CASE WHEN v_nd ? 'specialty_name' THEN v_nd ->> 'specialty_name' ELSE s.specialty_name END,
                   appointment_duration = CASE WHEN v_nd ? 'appointment_duration' THEN (v_nd ->> 'appointment_duration')::numeric::integer ELSE s.appointment_duration END
             WHERE s.specialty_id = v_spec_t;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'specialty % not found', v_spec_t;
            END IF;
        ELSE
            -- حذف فعلي؛ الأطباء يمنعون الحذف بالمفتاح الأجنبي RESTRICT، وCASCADE يزيل هذا الطلب نفسه
            DELETE FROM public.specialties s WHERE s.specialty_id = v_spec_t;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'specialty % not found', v_spec_t;
            END IF;
            RETURN v_id;
        END IF;
        UPDATE public.pending_changes pc SET status = 'executed' WHERE pc.change_id = v_id;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    IF v_err IS NOT NULL THEN
        UPDATE public.pending_changes pc
           SET status = 'failed', failure_reason = left(coalesce(nullif(btrim(v_err), ''), 'execution failed'), 500)
         WHERE pc.change_id = v_id;
    END IF;
    RETURN v_id;
END
$fn$;

CREATE FUNCTION public.cancel_pending_change(p_change_id integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
    v_doc    integer;
    v_spec_t integer;
    v_spec   integer;
BEGIN
    IF p_change_id IS NULL THEN
        RAISE EXCEPTION 'cancel_pending_change: p_change_id is required' USING ERRCODE = '22004';
    END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'cancelling a pending change requires the READ COMMITTED isolation level' USING ERRCODE = 'AF113';
    END IF;

    SELECT pc.doctor_id, pc.specialty_id INTO v_doc, v_spec_t
      FROM public.pending_changes pc WHERE pc.change_id = p_change_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pending change % not found', p_change_id USING ERRCODE = 'AF122';
    END IF;

    IF v_doc IS NOT NULL THEN
        SELECT d.specialty_id INTO v_spec FROM public.doctors d WHERE d.doctor_id = v_doc;
        IF v_spec IS NOT NULL THEN
            PERFORM public.lock_specialty(v_spec, true);
        END IF;
        PERFORM public.lock_doctor(v_doc);
    ELSE
        PERFORM public.lock_specialty(v_spec_t, false);
    END IF;

    UPDATE public.pending_changes pc SET status = 'cancelled' WHERE pc.change_id = p_change_id AND pc.status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pending change % is not pending', p_change_id USING ERRCODE = 'AF122';
    END IF;
END
$fn$;

CREATE TRIGGER pending_changes_guard_trg
    BEFORE INSERT OR UPDATE ON public.pending_changes
    FOR EACH ROW EXECUTE FUNCTION public.pending_changes_guard();

CREATE TRIGGER doctors_insert_guard_trg
    BEFORE INSERT ON public.doctors
    FOR EACH ROW EXECUTE FUNCTION public.doctors_insert_guard();
