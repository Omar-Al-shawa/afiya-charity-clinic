-- المرحلة 1B-2e: صلاحيات دور الاتصال afiyah_app (afiyah_test فقط).
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -1 -v expect_db=afiyah_test -d afiyah_test -f 006_privileges.sql
--
-- afiyah_app دور اتصال قاعدة البيانات لا دور تطبيقي: التفويض (مريض/طبيب/مدير) مسؤولية الخلفي Express؛ والقاعدة تضمن ألا يُتجاوز مسار قواعد العمل.
-- الجداول: SELECT للجميع (يحتاجها الدخول والعرض والمشغّلات التي تعمل بصلاحيات المستدعي). الكتابة بأعمدة محددة فقط:
--  users: إدراج (email, password_hash, role) وتعديل password_hash فقط (البريد وis_active لا يتغيّران إلا بالمنفِّذ المؤجَّل)؛ لا حذف.
--  patients: إدراج وتعديل حقول الملف الشخصي (لا patient_id ولا user_id)؛ لا حذف.
--  doctors و specialties: إدراج فقط (الإضافة فورية)؛ كل تعديل أو حذف مؤجَّل عبر pending_changes ثم المنفِّذ.
--  appointments: إدراج (status يأخذ الافتراضي booked) وتعديل status فقط (الإلغاء)؛ لا حذف.
--  pending_changes: إدراج (doctor_id, specialty_id, change_type, new_data) فقط؛ status وcreated_at الافتراضيان وexecute_at يملؤه المشغّل؛ لا تعديل مباشر.
-- لا صلاحيات على التسلسلات (أعمدة الهوية لا تتطلب USAGE على تسلسلها؛ يؤكد الاختبار ذلك). لا TRUNCATE ولا REFERENCES ولا TRIGGER ولا CREATE.
-- الدوال: تُسحب EXECUTE من PUBLIC عن الكل. تُمنح الدوال المساعدة السبع لأن مشغّلات الحجز والطلبات (تعمل بصلاحيات المستدعي) وقيد CHECK وappointment_rule_violation تستدعيها وقت التنفيذ.
--  لا تُمنح دوال المشغّلات الأربع، ولا execute_next_pending_change(timestamptz) كي لا يُنفَّذ طلب قبل موعده بتمرير p_now اعتباطي.
--  نقطتا دخول SECURITY DEFINER مالكهما omarsh بالـ search_path الثابت نفسه: cancel_pending_change(integer) (يأخذ أقفاله بترتيب اختصاص ثم طبيب)
--  و execute_due_pending_change() الجديدة بلا وسائط (تستدعي المنفِّذ بالوقت الحقيقي clock_timestamp()).
-- لا يتغير أي ملف مرحلة سابقة.
\ir _guard.sql

CREATE FUNCTION public.execute_due_pending_change()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
    RETURN public.execute_next_pending_change(clock_timestamp());
END
$fn$;

ALTER FUNCTION public.cancel_pending_change(integer) SECURITY DEFINER;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    public.clinic_local(timestamptz),
    public.pending_execute_at(timestamptz),
    public.pending_new_data_valid(boolean, jsonb),
    public.lock_specialty(integer, boolean),
    public.lock_doctor(integer),
    public.lock_patient(integer),
    public.appointment_rule_violation(integer, integer, date, time, timestamptz),
    public.cancel_pending_change(integer),
    public.execute_due_pending_change()
  TO afiyah_app;

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO afiyah_app;

GRANT SELECT ON public.users, public.patients, public.doctors, public.specialties, public.appointments, public.pending_changes TO afiyah_app;

GRANT INSERT (email, password_hash, role) ON public.users TO afiyah_app;
GRANT UPDATE (password_hash) ON public.users TO afiyah_app;

GRANT INSERT (user_id, first_name, last_name, phone, birth_date, address, gender, blood_type) ON public.patients TO afiyah_app;
GRANT UPDATE (first_name, last_name, phone, birth_date, address, gender, blood_type) ON public.patients TO afiyah_app;

GRANT INSERT (user_id, specialty_id, first_name, last_name, birth_date, phone, image_url, biography, years_of_experience) ON public.doctors TO afiyah_app;
GRANT INSERT (specialty_name, appointment_duration) ON public.specialties TO afiyah_app;

GRANT INSERT (patient_id, doctor_id, appointment_date, appointment_time) ON public.appointments TO afiyah_app;
GRANT UPDATE (status) ON public.appointments TO afiyah_app;

GRANT INSERT (doctor_id, specialty_id, change_type, new_data) ON public.pending_changes TO afiyah_app;
