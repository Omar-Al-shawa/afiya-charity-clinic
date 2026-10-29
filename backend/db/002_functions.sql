-- المرحلة 1B-2b (الجزء 1): الدوال المساعدة السبع وقيد القائمة البيضاء لـ pending_changes.new_data (afiyah_test فقط).
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -1 -v expect_db=afiyah_test -d afiyah_test -f 002_functions.sql
--
-- مبادئ مشتركة بين كل الدوال: المالك omarsh، SECURITY INVOKER، SET search_path = pg_catalog, pg_temp، وكل جدول يُكتب بالصيغة public.<table>.
-- لا صلاحيات ولا مشغّلات ولا أدوار هنا: تبقى EXECUTE الافتراضية لـ PUBLIC حتى المرحلة 1B-2e (ولا يستطيع PUBLIC الاتصال بالقاعدة أصلاً).
-- clinic_local و pending_execute_at بوسم STABLE (لا IMMUTABLE) لأن نتيجتهما تعتمد على قاعدة بيانات المناطق الزمنية التي قد تتغير قواعدها؛
-- لا تُستعملان في أي فهرس أو عمود مولَّد أو CHECK (قيد execute_at في 001_tables.sql يحتفظ بتعبيره المضمَّن كما هو).
-- pending_new_data_valid بوسم IMMUTABLE لأنها تعتمد على بنية JSON فقط (لا مناطق زمنية ولا جداول ولا إعدادات).
--
-- رموز المخالفات التي تعيدها appointment_rule_violation (تُربط لاحقاً في 1B-2c برموز SQLSTATE من الفئة AF):
--   AF110 وسيط فارغ | AF102 طبيب غير موجود أو حسابه غير نشط | AF109 يوم الجمعة | AF111 وقت البداية خارج 09:00-16:59 أو ليس بدقائق كاملة
--   AF103 الموعد بدأ أو التاريخ مضى | AF104 بعد اليوم + 13 | AF105 ينتهي بعد 17:00 | AF106 مقيَّد بتغيير معلّق
--   AF107 تعارض مع حجز آخر لنفس الطبيب | AF108 تعارض مع حجز آخر لنفس المريض (مدة كل حجز من اختصاص طبيبه)
\ir _guard.sql

-- 1) اليوم المحلي في دمشق: طابع زمني بلا منطقة.
CREATE FUNCTION public.clinic_local(p_ts timestamptz)
RETURNS timestamp
LANGUAGE sql STABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT p_ts AT TIME ZONE 'Asia/Damascus'
$fn$;

-- 2) لحظة تنفيذ الطلب: منتصف ليل Asia/Damascus لتاريخ الإنشاء الدمشقي + 14 يوماً تقويمياً (مطابقة تماماً لتعبير القيد pending_changes_execute_at_ck).
CREATE FUNCTION public.pending_execute_at(p_created_at timestamptz)
RETURNS timestamptz
LANGUAGE sql STABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT (date_trunc('day', p_created_at AT TIME ZONE 'Asia/Damascus') + interval '14 days') AT TIME ZONE 'Asia/Damascus'
$fn$;

-- 3) صلاحية حمولة new_data لطلب تعديل: بنية فقط (مفاتيح مسموحة لكل هدف، أنواع القيم، أعداد صحيحة بالقيمة).
--    الأعداد: صحيحة بالقيمة (30 و 30.0 و 3e1 مقبولة)، المدة 1-480، سنوات الخبرة 0-2147483647 أو null.
--    لا تُطلق استثناءً أبداً: التحويل إلى numeric يجري داخل CASE بعد التأكد أن النوع number، والإدخال غير الصالح يعيد false.
--    القيم النصية (فراغ، طول، بريد، تاريخ) يتحقق منها الخلفي عند الإنشاء وقيود الجداول عند التنفيذ.
CREATE FUNCTION public.pending_new_data_valid(p_doctor_target boolean, p_new_data jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT CASE
        WHEN p_doctor_target IS NULL
          OR p_new_data IS NULL
          OR jsonb_typeof(p_new_data) <> 'object'
          OR p_new_data = '{}'::jsonb
            THEN false
        ELSE NOT EXISTS (
            SELECT 1
              FROM jsonb_each(p_new_data) AS e(k, v)
             WHERE NOT CASE
                 WHEN p_doctor_target THEN
                     CASE
                         WHEN e.k IN ('first_name', 'last_name', 'phone', 'email', 'birth_date')
                             THEN jsonb_typeof(e.v) = 'string'
                         WHEN e.k IN ('image_url', 'biography')
                             THEN jsonb_typeof(e.v) IN ('string', 'null')
                         WHEN e.k = 'years_of_experience'
                             THEN CASE jsonb_typeof(e.v)
                                      WHEN 'null' THEN true
                                      WHEN 'number' THEN (e.v)::numeric = trunc((e.v)::numeric)
                                                         AND (e.v)::numeric BETWEEN 0 AND 2147483647
                                      ELSE false
                                  END
                         ELSE false
                     END
                 ELSE
                     CASE
                         WHEN e.k = 'specialty_name'
                             THEN jsonb_typeof(e.v) = 'string'
                         WHEN e.k = 'appointment_duration'
                             THEN CASE jsonb_typeof(e.v)
                                      WHEN 'number' THEN (e.v)::numeric = trunc((e.v)::numeric)
                                                         AND (e.v)::numeric BETWEEN 1 AND 480
                                      ELSE false
                                  END
                         ELSE false
                     END
             END
        )
    END
$fn$;

-- 4-6) أقفال استشارية على مستوى المعاملة، بترتيب ثابت للأصناف: 1 اختصاص (مشترك أو حصري)، 2 طبيب (حصري)، 3 مريض (حصري).
--      تُرفض المعرّفات الفارغة صراحةً: دوال الأقفال الاستشارية STRICT وتعيد NULL دون أن تقفل شيئاً إن أُعطيت NULL.
CREATE FUNCTION public.lock_specialty(p_id integer, p_shared boolean)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
    IF p_id IS NULL OR p_shared IS NULL THEN
        RAISE EXCEPTION 'lock_specialty: p_id and p_shared are required' USING ERRCODE = '22004';
    END IF;
    IF p_shared THEN
        PERFORM pg_advisory_xact_lock_shared(1, p_id);
    ELSE
        PERFORM pg_advisory_xact_lock(1, p_id);
    END IF;
END
$fn$;

CREATE FUNCTION public.lock_doctor(p_id integer)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
    IF p_id IS NULL THEN
        RAISE EXCEPTION 'lock_doctor: p_id is required' USING ERRCODE = '22004';
    END IF;
    PERFORM pg_advisory_xact_lock(2, p_id);
END
$fn$;

CREATE FUNCTION public.lock_patient(p_id integer)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
    IF p_id IS NULL THEN
        RAISE EXCEPTION 'lock_patient: p_id is required' USING ERRCODE = '22004';
    END IF;
    PERFORM pg_advisory_xact_lock(3, p_id);
END
$fn$;

-- 7) مدقّق قواعد الحجز: للقراءة فقط، يعيد NULL إن كان الحجز صالحاً وإلا رمز أول مخالفة بالترتيب المذكور أدناه.
--    يُستدعى في 1B-2c من مشغّل الحجز بعد أخذ الأقفال (S ثم D ثم P) وبتعليمة SELECT مستقلة حتى يرى لقطة جديدة تشمل ما اعتُمد أثناء الانتظار.
--    كل الأوقات بتوقيت دمشق عبر clinic_local(p_now)؛ الفترات نصف مفتوحة [بداية, بداية + مدة) بالدقائق الصحيحة منذ منتصف الليل (دون التفاف).
CREATE FUNCTION public.appointment_rule_violation(
    p_doctor_id  integer,
    p_patient_id integer,
    p_date       date,
    p_time       time,
    p_now        timestamptz
)
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
    v_spec   integer;
    v_dur    integer;
    v_local  timestamp;
    v_today  date;
    v_s1     integer;
    v_e1     integer;
    v_block  date;
BEGIN
    -- 0) وسيط فارغ
    IF p_doctor_id IS NULL OR p_patient_id IS NULL OR p_date IS NULL OR p_time IS NULL OR p_now IS NULL THEN
        RETURN 'AF110';
    END IF;

    -- 1) الطبيب وحسابه النشط ومدة اختصاصه الحالية في استعلام واحد
    SELECT d.specialty_id, s.appointment_duration
      INTO v_spec, v_dur
      FROM public.doctors d
      JOIN public.users u ON u.user_id = d.user_id
      JOIN public.specialties s ON s.specialty_id = d.specialty_id
     WHERE d.doctor_id = p_doctor_id
       AND u.is_active;
    IF NOT FOUND THEN
        RETURN 'AF102';
    END IF;

    -- 2) قواعد التقويم بتوقيت دمشق
    v_local := public.clinic_local(p_now);
    v_today := v_local::date;

    IF extract(dow FROM p_date) = 5 THEN
        RETURN 'AF109';
    END IF;
    IF p_time < time '09:00' OR p_time >= time '17:00' OR extract(second FROM p_time) <> 0 THEN
        RETURN 'AF111';
    END IF;
    IF p_date < v_today OR (p_date + p_time) <= v_local THEN
        RETURN 'AF103';
    END IF;
    IF p_date > v_today + 13 THEN
        RETURN 'AF104';
    END IF;

    -- 3) الفترة [v_s1, v_e1) بالدقائق الصحيحة؛ 17:00 تساوي 1020 دقيقة، ولا التفاف لأن v_s1 < 1020 و v_dur <= 480
    v_s1 := (extract(hour FROM p_time) * 60 + extract(minute FROM p_time))::integer;
    v_e1 := v_s1 + v_dur;
    IF v_e1 > 1020 THEN
        RETURN 'AF105';
    END IF;

    -- 4) التغييرات المعلّقة: تُحتسب الحالة pending فقط (على الطبيب أو على اختصاصه)؛ أبكر تاريخ سريان يحكم، والتاريخ نفسه محظور
    SELECT min(public.clinic_local(pc.execute_at)::date)
      INTO v_block
      FROM public.pending_changes pc
     WHERE pc.status = 'pending'
       AND (pc.doctor_id = p_doctor_id OR pc.specialty_id = v_spec);
    IF v_block IS NOT NULL AND p_date >= v_block THEN
        RETURN 'AF106';
    END IF;

    -- 5) تعارض مع حجز آخر لنفس الطبيب في اليوم نفسه (حجوزات الطبيب كلها بمدة اختصاصه v_dur؛ الملغاة لا تُحتسب)
    IF EXISTS (
        SELECT 1
          FROM public.appointments a
         WHERE a.doctor_id = p_doctor_id
           AND a.status = 'booked'
           AND a.appointment_date = p_date
           AND v_s1 < (extract(hour FROM a.appointment_time) * 60 + extract(minute FROM a.appointment_time))::integer + v_dur
           AND (extract(hour FROM a.appointment_time) * 60 + extract(minute FROM a.appointment_time))::integer < v_e1
    ) THEN
        RETURN 'AF107';
    END IF;

    -- 6) تعارض مع حجز آخر لنفس المريض عند أي طبيب: مدة كل حجز قائم من اختصاص طبيبه الحالي (الملغاة لا تُحتسب)
    IF EXISTS (
        SELECT 1
          FROM public.appointments a
          JOIN public.doctors dx ON dx.doctor_id = a.doctor_id
          JOIN public.specialties sx ON sx.specialty_id = dx.specialty_id
         WHERE a.patient_id = p_patient_id
           AND a.status = 'booked'
           AND a.appointment_date = p_date
           AND v_s1 < (extract(hour FROM a.appointment_time) * 60 + extract(minute FROM a.appointment_time))::integer + sx.appointment_duration
           AND (extract(hour FROM a.appointment_time) * 60 + extract(minute FROM a.appointment_time))::integer < v_e1
    ) THEN
        RETURN 'AF108';
    END IF;

    RETURN NULL;
END
$fn$;

-- قيد القائمة البيضاء لـ new_data: يحكم المفاتيح وأنواع القيم فقط. الحالات التي يرفضها pending_changes_new_data_shape_ck
-- (غير كائن، NULL، كائن فارغ، أو طلب حذف) تُترك له حتى يبلّغ كل قيد عن مشكلته وحده بصرف النظر عن ترتيب تقييم القيود.
ALTER TABLE public.pending_changes
    ADD CONSTRAINT pending_changes_new_data_whitelist_ck CHECK (
        change_type <> 'update'
        OR new_data IS NULL
        OR jsonb_typeof(new_data) <> 'object'
        OR new_data = '{}'::jsonb
        OR public.pending_new_data_valid(doctor_id IS NOT NULL, new_data)
    );
