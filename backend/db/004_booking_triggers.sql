-- المرحلة 1B-2c: مشغّلا الحجز وتثبيت اختصاص الطبيب (afiyah_test فقط).
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -1 -v expect_db=afiyah_test -d afiyah_test -f 004_booking_triggers.sql
--
-- appointments_booking_trg (قبل الإدراج أو التعديل، لكل صف):
--  * إدراج حجز بحالة booked: يقرأ اختصاص الطبيب، ثم يأخذ الأقفال بالترتيب الثابت اختصاص (مشترك) ثم طبيب ثم مريض،
--    ثم يستدعي appointment_rule_violation بتعليمة SELECT مستقلة بعد الأقفال حتى تُنشأ لقطة جديدة (READ COMMITTED) ترى ما اعتُمد أثناء الانتظار.
--    وقت التحقق clock_timestamp() (لا now() لأن الأخيرة وقت بدء المعاملة). أي رمز غير NULL يُرفع استثناءً برمز SQLSTATE نفسه (AF102..AF111).
--  * إدراج بحالة أخرى أو بعمود مفتاحي فارغ: لا تحقق هنا (تتولاه قيود الجدول).
--  * AF113: يُرفض الإدراج إن لم يكن مستوى العزل READ COMMITTED.
--  * التعديل: لا يجوز تغيير المريض أو الطبيب أو التاريخ أو الوقت، ولا إعادة تفعيل حجز ملغى (AF112؛ إعادة الحجز تكون إدراجاً جديداً)؛
--    الإلغاء (booked -> cancelled) مسموح بلا أقفال لأنه يحرّر الفتحة فقط.
-- doctors_specialty_guard_trg: يمنع تغيير specialty_id للطبيب (AF114)؛ وعليه تعتمد قراءة الاختصاص قبل أخذ الأقفال.
-- كلا الدالتين SECURITY INVOKER مع search_path ثابت؛ تشديد الصلاحيات في 1B-2e.
\ir _guard.sql

CREATE FUNCTION public.appointments_booking_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
    v_spec integer;
    v_code text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
           OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
           OR NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
           OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time THEN
            RAISE EXCEPTION 'appointment patient, doctor, date and time cannot be changed' USING ERRCODE = 'AF112';
        END IF;
        IF OLD.status = 'cancelled' AND NEW.status = 'booked' THEN
            RAISE EXCEPTION 'a cancelled appointment cannot be reactivated; create a new booking' USING ERRCODE = 'AF112';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM 'booked'
       OR NEW.doctor_id IS NULL OR NEW.patient_id IS NULL OR NEW.appointment_date IS NULL OR NEW.appointment_time IS NULL THEN
        RETURN NEW;
    END IF;

    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'bookings require the READ COMMITTED isolation level' USING ERRCODE = 'AF113';
    END IF;

    SELECT d.specialty_id INTO v_spec FROM public.doctors d WHERE d.doctor_id = NEW.doctor_id;
    IF v_spec IS NOT NULL THEN
        PERFORM public.lock_specialty(v_spec, true);
    END IF;
    PERFORM public.lock_doctor(NEW.doctor_id);
    PERFORM public.lock_patient(NEW.patient_id);

    SELECT public.appointment_rule_violation(NEW.doctor_id, NEW.patient_id, NEW.appointment_date, NEW.appointment_time, clock_timestamp())
      INTO v_code;
    IF v_code IS NOT NULL THEN
        RAISE EXCEPTION 'booking rejected: %', CASE v_code
            WHEN 'AF102' THEN 'doctor not found or inactive'
            WHEN 'AF103' THEN 'the appointment time has already started or passed'
            WHEN 'AF104' THEN 'beyond the 14-day booking window'
            WHEN 'AF105' THEN 'the appointment would end after 17:00'
            WHEN 'AF106' THEN 'a pending administrative change restricts this date'
            WHEN 'AF107' THEN 'the doctor has an overlapping appointment'
            WHEN 'AF108' THEN 'the patient has an overlapping appointment'
            WHEN 'AF109' THEN 'Friday is closed'
            WHEN 'AF110' THEN 'missing booking data'
            WHEN 'AF111' THEN 'start time outside 09:00-16:59 or not a whole minute'
            ELSE v_code
        END USING ERRCODE = v_code;
    END IF;
    RETURN NEW;
END
$fn$;

CREATE FUNCTION public.doctors_specialty_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
    IF NEW.specialty_id IS DISTINCT FROM OLD.specialty_id THEN
        RAISE EXCEPTION 'the specialty of a doctor cannot be changed' USING ERRCODE = 'AF114';
    END IF;
    RETURN NEW;
END
$fn$;

CREATE TRIGGER appointments_booking_trg
    BEFORE INSERT OR UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.appointments_booking_guard();

CREATE TRIGGER doctors_specialty_guard_trg
    BEFORE UPDATE OF specialty_id ON public.doctors
    FOR EACH ROW EXECUTE FUNCTION public.doctors_specialty_guard();
