-- اختبارات المرحلة 1B-2a: القيود والمفاتيح الأساسية للجداول الستة (afiyah_test فقط).
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f t2a_constraints.sql
--
-- النطاق: قيود الجداول فقط (أنواع، NOT NULL، UNIQUE، FK، CHECK، الهوية). لا قواعد حجز (النافذة الزمنية، التعارض،
-- التكرار، مدة الاختصاص، الطبيب النشط، التغييرات المعلّقة)، ولا فهارس جزئية (المدير الواحد، حجز واحد لكل موعد، طلب معلّق واحد
-- لكل هدف)، ولا مشغّلات؛ هذه كلها في المراحل 1B-2b إلى 1B-2d ولها اختباراتها هناك.
-- الاختبارات صالحة لحالة المخطط في نهاية 1B-2a فقط (قبل أي مشغّل)؛ بعد 1B-2c تُنفَّذ المشغّلات قبل قيود CHECK
-- (وتُرفض بيانات 2030 التجريبية لخروجها عن نافذة الحجز)، فتحتاج المراحل اللاحقة إلى اختباراتها الخاصة.
--
-- رموز الأخطاء: 23001 = حذف أب مُشار إليه محظور بسبب ON DELETE RESTRICT؛ 23503 = أب مرجعي غير موجود عند الإدراج؛
-- 22001 = قيمة أطول من طول العمود المعلن (VARCHAR) فتُرفض قبل تقييم قيود CHECK. أثبت التشغيل أن RESTRICT يُبلَّغ بالرمز 23001،
-- فتؤكد حالات الحذف هذه إجراء RESTRICT نفسه؛ وتُتحقق الإجراءات أيضاً من pg_constraint (confdeltype) في verify_2a.sql.
--
-- كل حالة تُنفَّذ داخل معاملة فرعية تُتراجع دائماً، وكل الملف داخل معاملة تنتهي بـ ROLLBACK (لا يبقى أي صف).
-- لا كائنات مؤقتة ولا تعديل على التسلسلات: كل إدراج (حتى الفاشل) يحمل معرّفاً صريحاً (OVERRIDING SYSTEM VALUE)
-- حتى لا تُستهلك قيم الهوية؛ وفي النهاية يتحقق الاختبار أن التسلسلات الستة لم تُستعمل.
-- صيغة النتيجة المتوقعة: OK = نجاح (والتحقق chk إن وُجد يرجع true)، أو SQLSTATE، أو SQLSTATE:اسم القيد (اسم العمود لـ 23502).
\ir ../_guard.sql

BEGIN;

DO $pre$
BEGIN
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r') <> 6 THEN
        RAISE EXCEPTION 'precondition failed: the six tables do not exist';
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
    g        record;
    v_state  text;
    v_con    text;
    v_col    text;
    v_bool   boolean;
    v_obj    text;
    v_ok     boolean;
    v_grp    text;
    v_n      jsonb := '{}';
    v_p      jsonb := '{}';
    v_total  int := 0;
    v_fail   int := 0;
BEGIN
    -- بيانات تجريبية بمعرّفات صريحة (لا يوجد مدير بين البيانات التجريبية؛ حالة U28 تدرج المدير الوحيد)
    INSERT INTO public.users (user_id, email, password_hash, role) OVERRIDING SYSTEM VALUE VALUES
        (9001, 'patient1@test.local',     'h', 'patient'),
        (9002, 'doctor1@test.local',      'h', 'doctor'),
        (9003, 'spare@test.local',        'h', 'patient'),
        (9004, 'patient2@test.local',     'h', 'patient'),
        (9005, 'doctor2@test.local',      'h', 'doctor'),
        (9006, 'free-patient@test.local', 'h', 'patient'),
        (9007, 'free-doctor@test.local',  'h', 'doctor'),
        (9010, 'doctor3@test.local',      'h', 'doctor');
    INSERT INTO public.users (user_id, email, password_hash, role) OVERRIDING SYSTEM VALUE
        SELECT 9100 + gs, 'bt' || gs || '@test.local', 'h', 'patient' FROM generate_series(1, 8) gs;
    INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES
        (9001, 'spec-one', 20), (9002, 'spec-two', 30), (9003, 'spec-three', 40), (9004, 'spec-four', 15);
    INSERT INTO public.patients (patient_id, user_id, first_name, last_name, phone, birth_date, address, gender, blood_type) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9001, 'Ali', 'Omar', '0911111111', '1990-01-01', 'Damascus', 'male', NULL);
    INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone, image_url, biography, years_of_experience) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9002, 9001, 'Sara', 'Khalil', '1980-05-05', '0922222222', NULL, NULL, 10),
        (9002, 9005, 9001, 'Huda', 'Nasser', '1982-03-03', '0933333333', NULL, NULL, 8),
        (9003, 9010, 9001, 'Omar', 'Said',   '1979-07-07', '0944444444', NULL, NULL, 12);
    INSERT INTO public.appointments (appointment_id, patient_id, doctor_id, appointment_date, appointment_time, status) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9001, 9001, '2030-01-05', '10:00', 'booked'),
        (9002, 9001, 9003, '2030-01-06', '10:00', 'booked');
    INSERT INTO public.pending_changes (change_id, doctor_id, specialty_id, change_type, new_data, status, created_at, execute_at, failure_reason) OVERRIDING SYSTEM VALUE VALUES
        (9001, 9001, NULL, 'update', '{"phone":"0911111111"}', 'pending',  '2026-10-01 10:30+03', '2026-10-15 00:00+03', NULL),
        (9002, 9002, NULL, 'update', '{"phone":"0922222222"}', 'pending',  '2026-10-01 10:30+03', '2026-10-15 00:00+03', NULL),
        (9003, NULL, 9003, 'update', '{"specialty_name":"renamed"}', 'executed', '2026-10-01 10:30+03', '2026-10-15 00:00+03', NULL),
        (9004, NULL, 9003, 'delete', NULL, 'pending',  '2026-10-01 10:30+03', '2026-10-15 00:00+03', NULL),
        (9005, NULL, 9002, 'delete', NULL, 'pending',  '2026-10-01 10:30+03', '2026-10-15 00:00+03', NULL);

    FOR r IN
        SELECT * FROM (VALUES
        -- ===== I: الهوية (GENERATED ALWAYS) — رفض المعرّف الصريح؛ التوليد وإعدادات التسلسل تُتحقق منها من الكتالوج في verify_2a.sql =====
        ('I01 users: explicit id rejected', $q$INSERT INTO public.users (user_id,email,password_hash,role) VALUES (1,'g@test.local','h','patient')$q$, NULL, '428C9'),
        ('I02 specialties: explicit id rejected', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) VALUES (1,'g',10)$q$, NULL, '428C9'),
        ('I03 patients: explicit id rejected', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) VALUES (1,9006,'A','B','0911111111','1990-01-01','male')$q$, NULL, '428C9'),
        ('I04 doctors: explicit id rejected', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) VALUES (1,9007,9001,'A','B','1980-01-01','0911111111')$q$, NULL, '428C9'),
        ('I05 appointments: explicit id rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) VALUES (1,9001,9001,'2030-01-07','09:00')$q$, NULL, '428C9'),
        ('I06 pending_changes: explicit id rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) VALUES (1,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '428C9'),

        -- ===== U: users =====
        ('U01 valid user and is_active defaults to true', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u1@test.local','h','patient')$q$, $c$SELECT is_active FROM public.users WHERE user_id=9900$c$, 'OK'),
        ('U02 role invalid', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u2@test.local','h','boss')$q$, NULL, '23514:users_role_ck'),
        ('U03 role uppercase', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u3@test.local','h','Patient')$q$, NULL, '23514:users_role_ck'),
        ('U04 role NULL', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u4@test.local','h',NULL)$q$, NULL, '23502:role'),
        ('U05 email NULL', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,'h','patient')$q$, NULL, '23502:email'),
        ('U06 email empty', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U07 email spaces only', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'   ','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U08 email leading space', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,' a@t.local','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U09 email trailing space', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'a@t.local ','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U10 email trailing newline', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,E'a@t.local\n','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U11 email leading tab', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,E'\ta@t.local','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U12 email uppercase', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'UPPER@TEST.LOCAL','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U13 email mixed case', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'Mixed@test.local','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U14 email duplicate', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'patient1@test.local','h','patient')$q$, NULL, '23505:users_email_key'),
        ('U15 email duplicate differing by case is rejected by the lowercase check', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'PATIENT1@test.local','h','patient')$q$, NULL, '23514:users_email_ck'),
        ('U16 email without @ is accepted (no strict format rule)', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'no-at-sign','h','patient')$q$, NULL, 'OK'),
        ('U17 email with inner space is accepted (no strict format rule)', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'a b@c.d','h','patient')$q$, NULL, 'OK'),
        ('U18 password_hash NULL', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u18@test.local',NULL,'patient')$q$, NULL, '23502:password_hash'),
        ('U19 password_hash empty', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u19@test.local','','patient')$q$, NULL, '23514:users_password_hash_ck'),
        ('U20 password_hash spaces only', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u20@test.local','   ','patient')$q$, NULL, '23514:users_password_hash_ck'),
        ('U21 password_hash tabs and newlines only', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u21@test.local',E'\t\n ','patient')$q$, NULL, '23514:users_password_hash_ck'),
        ('U22 is_active NULL', $q$INSERT INTO public.users (user_id,email,password_hash,role,is_active) OVERRIDING SYSTEM VALUE VALUES (9900,'u22@test.local','h','patient',NULL)$q$, NULL, '23502:is_active'),
        ('U23 is_active false accepted', $q$INSERT INTO public.users (user_id,email,password_hash,role,is_active) OVERRIDING SYSTEM VALUE VALUES (9900,'u23@test.local','h','doctor',false)$q$, NULL, 'OK'),
        ('U24 email 255 chars accepted', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,repeat('a',249)||'@b.cde','h','patient')$q$, NULL, 'OK'),
        ('U25 email 256 chars rejected', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,repeat('a',250)||'@b.cde','h','patient')$q$, NULL, '22001'),
        ('U26 password_hash 256 chars rejected', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u26@test.local',repeat('x',256),'patient')$q$, NULL, '22001'),
        ('U27 role longer than 20 chars rejected', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u27@test.local','h',repeat('x',21))$q$, NULL, '22001'),
        ('U28 role admin satisfies the role check (the only admin row in this test)', $q$INSERT INTO public.users (user_id,email,password_hash,role) OVERRIDING SYSTEM VALUE VALUES (9900,'u28@test.local','h','admin')$q$, NULL, 'OK'),

        -- ===== S: specialties =====
        ('S01 valid specialty', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s01',20)$q$, NULL, 'OK'),
        ('S02 name NULL', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,20)$q$, NULL, '23502:specialty_name'),
        ('S03 name empty', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'',20)$q$, NULL, '23514:specialties_name_ck'),
        ('S04 name spaces only', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'   ',20)$q$, NULL, '23514:specialties_name_ck'),
        ('S05 name duplicate', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'spec-one',20)$q$, NULL, '23505:specialties_specialty_name_key'),
        ('S06 name 100 chars accepted', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,repeat('x',100),20)$q$, NULL, 'OK'),
        ('S07 name 101 chars rejected', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,repeat('x',101),20)$q$, NULL, '22001'),
        ('S08 duration NULL', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s08',NULL)$q$, NULL, '23502:appointment_duration'),
        ('S09 duration 0', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s09',0)$q$, NULL, '23514:specialties_duration_ck'),
        ('S10 duration -5', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s10',-5)$q$, NULL, '23514:specialties_duration_ck'),
        ('S11 duration 481', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s11',481)$q$, NULL, '23514:specialties_duration_ck'),
        ('S12 duration 1 accepted', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s12',1)$q$, NULL, 'OK'),
        ('S13 duration 480 accepted', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s13',480)$q$, NULL, 'OK'),
        ('S14 duration max integer rejected', $q$INSERT INTO public.specialties (specialty_id,specialty_name,appointment_duration) OVERRIDING SYSTEM VALUE VALUES (9900,'s14',2147483647)$q$, NULL, '23514:specialties_duration_ck'),
        ('S15 delete specialty referenced by doctors is blocked (RESTRICT)', $q$DELETE FROM public.specialties WHERE specialty_id = 9001$q$, NULL, '23001:doctors_specialty_id_fkey'),
        ('S16 delete unreferenced specialty accepted', $q$DELETE FROM public.specialties WHERE specialty_id = 9004$q$, NULL, 'OK'),

        -- ===== P: patients =====
        ('P01 valid patient (blood type NULL)', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,address,gender,blood_type) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'Ali','Omar','0911111111','1990-01-01','Damascus St','male',NULL)$q$, NULL, 'OK'),
        ('P02 valid patient (address NULL)', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,address,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'Ali','Omar','0911111111','1990-01-01',NULL,'female')$q$, NULL, 'OK'),
        ('P03 all eight blood types accepted', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender,blood_type) OVERRIDING SYSTEM VALUE SELECT 9200+n,9100+n,'A','B','0911111111','1990-01-01','male',bt FROM unnest(ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-']) WITH ORDINALITY AS u(bt,n)$q$, $c$SELECT count(*) = 8 FROM public.patients WHERE patient_id BETWEEN 9201 AND 9208$c$, 'OK'),
        ('P04 blood type unknown rejected (7 chars exceed VARCHAR(5); must be NULL)', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender,blood_type) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','male','unknown')$q$, NULL, '22001'),
        ('P05 blood type lowercase', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender,blood_type) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','male','a+')$q$, NULL, '23514:patients_blood_type_ck'),
        ('P06 blood type without Rh sign', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender,blood_type) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','male','AB')$q$, NULL, '23514:patients_blood_type_ck'),
        ('P07 blood type empty string', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender,blood_type) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','male','')$q$, NULL, '23514:patients_blood_type_ck'),
        ('P08 blood type Arabic label rejected', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender,blood_type) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','male','لا أعلم')$q$, NULL, '22001'),
        ('P09 blood type 6 chars rejected', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender,blood_type) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','male','AB++++')$q$, NULL, '22001'),
        ('P10 gender other', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','other')$q$, NULL, '23514:patients_gender_ck'),
        ('P11 gender capitalised', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','Male')$q$, NULL, '23514:patients_gender_ck'),
        ('P12 gender empty', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','')$q$, NULL, '23514:patients_gender_ck'),
        ('P13 gender NULL', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01',NULL)$q$, NULL, '23502:gender'),
        ('P14 first_name empty', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'','B','0911111111','1990-01-01','male')$q$, NULL, '23514:patients_first_name_ck'),
        ('P15 first_name tab only', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,E'\t','B','0911111111','1990-01-01','male')$q$, NULL, '23514:patients_first_name_ck'),
        ('P16 first_name NULL', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,NULL,'B','0911111111','1990-01-01','male')$q$, NULL, '23502:first_name'),
        ('P17 last_name spaces only', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','   ','0911111111','1990-01-01','male')$q$, NULL, '23514:patients_last_name_ck'),
        ('P18 last_name NULL', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A',NULL,'0911111111','1990-01-01','male')$q$, NULL, '23502:last_name'),
        ('P19 phone empty', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','','1990-01-01','male')$q$, NULL, '23514:patients_phone_ck'),
        ('P20 phone NULL', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B',NULL,'1990-01-01','male')$q$, NULL, '23502:phone'),
        ('P21 birth_date NULL', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111',NULL,'male')$q$, NULL, '23502:birth_date'),
        ('P22 user_id NULL', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,'A','B','0911111111','1990-01-01','male')$q$, NULL, '23502:user_id'),
        ('P23 address empty', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,address,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','','male')$q$, NULL, '23514:patients_address_ck'),
        ('P24 address spaces only', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,address,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01','   ','male')$q$, NULL, '23514:patients_address_ck'),
        ('P25 duplicate user_id', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'A','B','0911111111','1990-01-01','male')$q$, NULL, '23505:patients_user_id_key'),
        ('P26 missing user', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,99999,'A','B','0911111111','1990-01-01','male')$q$, NULL, '23503:patients_user_id_fkey'),
        ('P27 first_name 101 chars rejected', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,repeat('x',101),'B','0911111111','1990-01-01','male')$q$, NULL, '22001'),
        ('P28 last_name 100 chars accepted', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A',repeat('x',100),'0911111111','1990-01-01','male')$q$, NULL, 'OK'),
        ('P29 phone 21 chars rejected', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B',repeat('1',21),'1990-01-01','male')$q$, NULL, '22001'),
        ('P30 address 256 chars rejected', $q$INSERT INTO public.patients (patient_id,user_id,first_name,last_name,phone,birth_date,address,gender) OVERRIDING SYSTEM VALUE VALUES (9900,9006,'A','B','0911111111','1990-01-01',repeat('x',256),'male')$q$, NULL, '22001'),
        ('P31 delete user referenced by a patient is blocked (RESTRICT)', $q$DELETE FROM public.users WHERE user_id = 9001$q$, NULL, '23001:patients_user_id_fkey'),
        ('P32 delete patient referenced by an appointment is blocked (RESTRICT)', $q$DELETE FROM public.patients WHERE patient_id = 9001$q$, NULL, '23001:appointments_patient_id_fkey'),

        -- ===== D: doctors =====
        ('D01 valid doctor (all fields)', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone,image_url,biography,years_of_experience) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'Sara','Khalil','1980-05-05','0922222222','/img/d.png','bio',10)$q$, NULL, 'OK'),
        ('D02 valid doctor (optional fields NULL)', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'Sara','Khalil','1980-05-05','0922222222')$q$, NULL, 'OK'),
        ('D03 years_of_experience -1', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone,years_of_experience) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05','0922222222',-1)$q$, NULL, '23514:doctors_years_of_experience_ck'),
        ('D04 years_of_experience 0 accepted', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone,years_of_experience) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05','0922222222',0)$q$, NULL, 'OK'),
        ('D05 image_url empty', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone,image_url) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05','0922222222','')$q$, NULL, '23514:doctors_image_url_ck'),
        ('D06 image_url spaces only', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone,image_url) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05','0922222222','  ')$q$, NULL, '23514:doctors_image_url_ck'),
        ('D07 image_url 500 chars accepted', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone,image_url) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05','0922222222',repeat('x',500))$q$, NULL, 'OK'),
        ('D08 image_url 501 chars rejected', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone,image_url) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05','0922222222',repeat('x',501))$q$, NULL, '22001'),
        ('D09 first_name blank', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,' ','K','1980-05-05','0922222222')$q$, NULL, '23514:doctors_first_name_ck'),
        ('D10 last_name blank', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','','1980-05-05','0922222222')$q$, NULL, '23514:doctors_last_name_ck'),
        ('D11 phone blank', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05',E'\n')$q$, NULL, '23514:doctors_phone_ck'),
        ('D12 first_name NULL', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,NULL,'K','1980-05-05','0922222222')$q$, NULL, '23502:first_name'),
        ('D13 last_name NULL', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S',NULL,'1980-05-05','0922222222')$q$, NULL, '23502:last_name'),
        ('D14 birth_date NULL', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K',NULL,'0922222222')$q$, NULL, '23502:birth_date'),
        ('D15 phone NULL', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,9001,'S','K','1980-05-05',NULL)$q$, NULL, '23502:phone'),
        ('D16 user_id NULL', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,9001,'S','K','1980-05-05','0922222222')$q$, NULL, '23502:user_id'),
        ('D17 specialty_id NULL', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,NULL,'S','K','1980-05-05','0922222222')$q$, NULL, '23502:specialty_id'),
        ('D18 duplicate user_id', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9002,9001,'S','K','1980-05-05','0922222222')$q$, NULL, '23505:doctors_user_id_key'),
        ('D19 missing specialty', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,9007,99999,'S','K','1980-05-05','0922222222')$q$, NULL, '23503:doctors_specialty_id_fkey'),
        ('D20 missing user', $q$INSERT INTO public.doctors (doctor_id,user_id,specialty_id,first_name,last_name,birth_date,phone) OVERRIDING SYSTEM VALUE VALUES (9900,99999,9001,'S','K','1980-05-05','0922222222')$q$, NULL, '23503:doctors_user_id_fkey'),
        ('D21 delete user referenced by a doctor is blocked (RESTRICT)', $q$DELETE FROM public.users WHERE user_id = 9002$q$, NULL, '23001:doctors_user_id_fkey'),
        ('D22 delete doctor referenced by a pending change is blocked (RESTRICT)', $q$DELETE FROM public.doctors WHERE doctor_id = 9002$q$, NULL, '23001:pending_changes_doctor_id_fkey'),
        ('D23 delete doctor referenced by an appointment is blocked (RESTRICT)', $q$DELETE FROM public.doctors WHERE doctor_id = 9003$q$, NULL, '23001:appointments_doctor_id_fkey'),

        -- ===== A: appointments (قيود الجدول الساكنة فقط: القيم المسموحة، يوم الجمعة، نطاق وقت البداية، دقائق كاملة) =====
        ('A01 valid appointment, status defaults to booked', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','12:30')$q$, $c$SELECT status = 'booked' FROM public.appointments WHERE appointment_id = 9900$c$, 'OK'),
        ('A02 status cancelled satisfies the status check', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time,status) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','12:30','cancelled')$q$, NULL, 'OK'),
        ('A03 status pending rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time,status) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','12:30','pending')$q$, NULL, '23514:appointments_status_ck'),
        ('A04 status capitalised rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time,status) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','12:30','Booked')$q$, NULL, '23514:appointments_status_ck'),
        ('A05 status NULL', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time,status) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','12:30',NULL)$q$, NULL, '23502:status'),
        ('A06 patient_id NULL', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,NULL,9001,'2030-01-07','12:30')$q$, NULL, '23502:patient_id'),
        ('A07 doctor_id NULL', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,NULL,'2030-01-07','12:30')$q$, NULL, '23502:doctor_id'),
        ('A08 date NULL', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,NULL,'12:30')$q$, NULL, '23502:appointment_date'),
        ('A09 time NULL', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07',NULL)$q$, NULL, '23502:appointment_time'),
        ('A10 missing patient', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,99999,9001,'2030-01-07','12:30')$q$, NULL, '23503:appointments_patient_id_fkey'),
        ('A11 missing doctor', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,99999,'2030-01-07','12:30')$q$, NULL, '23503:appointments_doctor_id_fkey'),
        ('A12 Saturday to Thursday satisfy the weekday check', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE SELECT 9900+g,9001,9001,date '2030-01-05' + g,'09:00' FROM generate_series(0,5) g$q$, $c$SELECT count(*) = 6 FROM public.appointments WHERE appointment_id BETWEEN 9900 AND 9905$c$, 'OK'),
        ('A13 Friday 2030-01-04 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-04','09:00')$q$, NULL, '23514:appointments_date_not_friday_ck'),
        ('A14 Friday 2030-01-11 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-11','09:00')$q$, NULL, '23514:appointments_date_not_friday_ck'),
        ('A15 Friday 2026-10-30 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2026-10-30','09:00')$q$, NULL, '23514:appointments_date_not_friday_ck'),
        ('A16 start time 08:59 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','08:59')$q$, NULL, '23514:appointments_time_ck'),
        ('A17 start time 00:00 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','00:00')$q$, NULL, '23514:appointments_time_ck'),
        ('A18 start time 17:00 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','17:00')$q$, NULL, '23514:appointments_time_ck'),
        ('A19 start time 17:01 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','17:01')$q$, NULL, '23514:appointments_time_ck'),
        ('A20 start time 23:59 rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','23:59')$q$, NULL, '23514:appointments_time_ck'),
        ('A21 start time 09:00 satisfies the range check', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','09:00')$q$, NULL, 'OK'),
        ('A22 start time 16:59 satisfies the static range check (end vs duration is a 1B-2c rule)', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','16:59')$q$, NULL, 'OK'),
        ('A23 start time with seconds rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','09:00:30')$q$, NULL, '23514:appointments_time_ck'),
        ('A24 start time with fractional second rejected', $q$INSERT INTO public.appointments (appointment_id,patient_id,doctor_id,appointment_date,appointment_time) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'2030-01-07','09:00:00.5')$q$, NULL, '23514:appointments_time_ck'),

        -- ===== C: pending_changes (قيود الجدول فقط: لا قائمة مفاتيح new_data ولا فهارس "طلب معلّق واحد" ولا انتقالات الحالة) =====
        ('C01 doctor update accepted, defaults to pending', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"0933333333"}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, $c$SELECT status = 'pending' AND failure_reason IS NULL FROM public.pending_changes WHERE change_id = 9900$c$, 'OK'),
        ('C02 specialty update accepted', $q$INSERT INTO public.pending_changes (change_id,specialty_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"appointment_duration":30}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('C03 doctor delete accepted', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'delete','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('C04 specialty delete accepted', $q$INSERT INTO public.pending_changes (change_id,specialty_id,change_type,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'delete','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('C05 both targets rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,specialty_id,change_type,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,9001,'delete','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_target_ck'),
        ('C06 no target rejected', $q$INSERT INTO public.pending_changes (change_id,change_type,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,'delete','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_target_ck'),
        ('C07 change_type archive rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'archive','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_change_type_ck'),
        ('C08 change_type capitalised rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'Update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_change_type_ck'),
        ('C09 change_type NULL', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,NULL,'2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23502:change_type'),
        ('C10 status done rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','done','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_status_ck'),
        ('C11 status NULL', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}',NULL,'2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23502:status'),
        ('C12 status executed satisfies the status check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','executed','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('C13 status cancelled satisfies the status check', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','cancelled','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('C14 status failed with reason satisfies the checks', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,failure_reason,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','failed','23505: duplicate','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('C15 delete with new_data rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'delete','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('C16 update without new_data rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('C17 update with empty object rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('C18 update with array rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','[{"phone":"x"}]','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('C19 update with scalar string rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','"x"','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('C20 update with scalar number rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','123','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('C21 update with JSON null rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','null'::jsonb,'2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_new_data_shape_ck'),
        ('C22 failed without reason rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','failed','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_failure_reason_ck'),
        ('C23 failed with empty reason rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,failure_reason,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','failed','','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_failure_reason_ck'),
        ('C24 failed with blank reason rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,failure_reason,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','failed',E'  \n','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_failure_reason_ck'),
        ('C25 pending with a reason rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,failure_reason,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','pending','x','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_failure_reason_ck'),
        ('C26 executed with a reason rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,failure_reason,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','executed','x','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_failure_reason_ck'),
        ('C27 cancelled with a reason rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,failure_reason,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','cancelled','x','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_failure_reason_ck'),
        ('C28 pending with an empty reason rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,status,failure_reason,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','pending','','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_failure_reason_ck'),
        ('C29 created_at NULL', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}',NULL,'2026-10-15 00:00+03')$q$, NULL, '23502:created_at'),
        ('C30 execute_at NULL', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03',NULL)$q$, NULL, '23502:execute_at'),
        ('C31 missing doctor', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,99999,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23503:pending_changes_doctor_id_fkey'),
        ('C32 missing specialty', $q$INSERT INTO public.pending_changes (change_id,specialty_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,99999,'update','{"appointment_duration":30}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, '23503:pending_changes_specialty_id_fkey'),
        ('C33 default created_at with a correct execute_at', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}',((date_trunc('day', now() AT TIME ZONE 'Asia/Damascus') + interval '14 days') AT TIME ZONE 'Asia/Damascus'))$q$, NULL, 'OK'),
        ('C34 default created_at with created_at + 336 hours rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}',now() + interval '336 hours')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('C35 delete specialty cascades only its own pending changes (ON DELETE CASCADE)', $q$DELETE FROM public.specialties WHERE specialty_id = 9003$q$, $c$SELECT (SELECT count(*) FROM public.pending_changes WHERE specialty_id = 9003) = 0 AND (SELECT count(*) FROM public.pending_changes) = 3 AND (SELECT count(*) FROM public.pending_changes WHERE change_id IN (9001, 9002, 9005)) = 3$c$, 'OK'),
        ('C36 delete specialty with only a pending delete cascades it (ON DELETE CASCADE)', $q$DELETE FROM public.specialties WHERE specialty_id = 9002$q$, $c$SELECT NOT EXISTS (SELECT 1 FROM public.pending_changes WHERE change_id = 9005) AND (SELECT count(*) FROM public.pending_changes) = 4$c$, 'OK'),

        -- ===== E: صيغة execute_at (منتصف ليل دمشق + 14 يوماً تقويمياً) =====
        ('E01 10:30 Damascus on 1 Oct', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('E02 exactly 00:00:00 Damascus on 1 Oct', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 00:00:00+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('E03 23:59:59.999999 Damascus on 1 Oct', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 23:59:59.999999+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('E04 exactly 00:00:00 Damascus on 2 Oct', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-02 00:00:00+03','2026-10-16 00:00+03')$q$, NULL, 'OK'),
        ('E05 20:59:59 UTC is 23:59:59 Damascus on 1 Oct', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 20:59:59+00','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('E06 21:00:00 UTC is already 2 Oct in Damascus', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 21:00:00+00','2026-10-16 00:00+03')$q$, NULL, 'OK'),
        ('E07 year crossing 25 Dec to 8 Jan', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-12-25 12:00+03','2027-01-08 00:00+03')$q$, NULL, 'OK'),
        ('E08 month crossing 20 Feb to 6 Mar (2026)', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-02-20 01:00+03','2026-03-06 00:00+03')$q$, NULL, 'OK'),
        ('E09 leap year 20 Feb to 5 Mar (2028)', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2028-02-20 12:00+03','2028-03-05 00:00+03')$q$, NULL, 'OK'),
        ('E10 summer date 30 Jun to 14 Jul (no DST shift)', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-06-30 12:00+03','2026-07-14 00:00+03')$q$, NULL, 'OK'),
        ('E11 created_at given in UTC (07:30Z = 10:30 Damascus)', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 07:30:00+00','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('E12 created + 336 hours rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 10:30+03')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E13 23:59 on the previous day rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-14 23:59+03')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E14 midnight of the following day (15 days) rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-16 00:00+03')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E15 midnight of 13 days rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-14 00:00+03')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E16 execute_at equal to created_at rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-01 10:30+03')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E17 execute_at before created_at rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-09-30 00:00+03')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E18 UTC midnight instead of Damascus midnight rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 00:00+00')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E19 UTC calendar day used by mistake (21:00Z creation, 15 Oct) rejected', $q$INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 21:00:00+00','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_execute_at_ck'),
        ('E20 result unchanged under session TimeZone America/Los_Angeles', $q$SET LOCAL timezone = 'America/Los_Angeles'; INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 10:30+03','2026-10-15 00:00+03')$q$, NULL, 'OK'),
        ('E21 result unchanged under session TimeZone Asia/Tokyo (21:00Z case)', $q$SET LOCAL timezone = 'Asia/Tokyo'; INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 21:00:00+00','2026-10-16 00:00+03')$q$, NULL, 'OK'),
        ('E22 wrong value still rejected under session TimeZone UTC', $q$SET LOCAL timezone = 'UTC'; INSERT INTO public.pending_changes (change_id,doctor_id,change_type,new_data,created_at,execute_at) OVERRIDING SYSTEM VALUE VALUES (9900,9001,'update','{"phone":"x"}','2026-10-01 21:00:00+00','2026-10-15 00:00+03')$q$, NULL, '23514:pending_changes_execute_at_ck')
        ) AS t(id, setup, chk, expect)
    LOOP
        v_state := NULL; v_con := NULL; v_col := NULL;
        BEGIN
            EXECUTE r.setup;
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
            v_ok := (v_state = split_part(r.expect, ':', 1) AND v_obj IS NOT DISTINCT FROM split_part(r.expect, ':', 2));
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

    -- X01: لم تُستهلك أي قيمة هوية في الاختبارات
    v_ok := NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL);
    v_total := v_total + 1;
    v_n := jsonb_set(v_n, '{X}', to_jsonb(1));
    IF v_ok THEN
        v_p := jsonb_set(v_p, '{X}', to_jsonb(1));
    ELSE
        v_fail := v_fail + 1;
        RAISE NOTICE 'FAIL  X01 identity sequences were consumed by the tests';
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
