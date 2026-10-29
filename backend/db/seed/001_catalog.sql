-- بذر الكتالوج المعتمد: 19 اختصاصاً و61 طبيباً مع حسابات دخولهم (afiyah_test فقط). يُشغَّل بعد 001-006 وعلى جداول فارغة وتسلسلات في حالة إعادة الضبط.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -v expect_db=afiyah_test -d afiyah_test -f backend/db/seed/001_catalog.sql
-- التجربة دون التزام (تُنفَّذ كل الفحوص وتنتهي بـ ROLLBACK): أضف -v dry_run=1 إلى الأمر نفسه.
--
-- المصدر: frontend/src/mock/specialties.js و frontend/src/mock/doctors.js (الأسماء والاختصاصات والمدد وتواريخ الميلاد وسنوات الخبرة ومسارات الصور كما هي).
--  * معرّفات الاختصاصات 1-19 والأطباء 1-61 صريحة (OVERRIDING SYSTEM VALUE) فلا تعتمد على حالة التسلسلات؛ وحساب الطبيب n له user_id = n.
--  * بعد الإدراج تُعاد التسلسلات بـ ALTER ... RESTART WITH (معاملاتية، فلا تُستهلك قيم عند الفشل): الاختصاصات 20، والمستخدمون والأطباء 62 (يأخذ المدير 62).
--  * البريد doctorNN@afiyah.example (نطاق .example محجوز)، والهاتف 09 + المعرّف في 8 خانات (قيم تجريبية)، والسيرة NULL.
--  * كلمات المرور عشوائية لكل طبيب وتُحفظ خارج المشروع؛ هنا قيم bcrypt (التكلفة 12) فقط ولا كلمة مرور صريحة.
--  * معاملة واحدة: أي فحص يفشل أو أي قيد أو مشغّل يرفض يتراجع كل شيء. المشغّلات والقيود الموجودة تعمل كما هي (لا تعطيل).
\ir ../_guard.sql

BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.users, public.patients, public.doctors, public.specialties, public.appointments, public.pending_changes IN ACCESS EXCLUSIVE MODE;

DO $g$
BEGIN
    IF current_database() <> 'afiyah_test' THEN RAISE EXCEPTION 'seed guard: wrong database %', current_database(); END IF;
    IF current_user <> 'omarsh' OR session_user <> 'omarsh' THEN RAISE EXCEPTION 'seed guard: must run as omarsh'; END IF;
    IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) <> 'omarsh' THEN RAISE EXCEPTION 'seed guard: database owner is not omarsh'; END IF;
    IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'seed guard: READ COMMITTED is required by the doctors trigger'; END IF;
    IF (SELECT count(*) FROM public.users) + (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.doctors)
       + (SELECT count(*) FROM public.specialties) + (SELECT count(*) FROM public.appointments) + (SELECT count(*) FROM public.pending_changes) <> 0 THEN
        RAISE EXCEPTION 'seed guard: tables are not all empty';
    END IF;
    IF EXISTS (SELECT 1 FROM (
            SELECT last_value, is_called FROM public.users_user_id_seq
            UNION ALL SELECT last_value, is_called FROM public.specialties_specialty_id_seq
            UNION ALL SELECT last_value, is_called FROM public.patients_patient_id_seq
            UNION ALL SELECT last_value, is_called FROM public.doctors_doctor_id_seq
            UNION ALL SELECT last_value, is_called FROM public.appointments_appointment_id_seq
            UNION ALL SELECT last_value, is_called FROM public.pending_changes_change_id_seq
        ) s WHERE s.is_called OR s.last_value <> 1) THEN
        RAISE EXCEPTION 'seed guard: identity sequences are not in the reset state (unused, at 1)';
    END IF;
    IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled = 'O'
           AND t.tgname IN ('appointments_booking_trg', 'doctors_specialty_guard_trg', 'pending_changes_guard_trg', 'doctors_insert_guard_trg')) <> 4 THEN
        RAISE EXCEPTION 'seed guard: the four application triggers must be present and enabled';
    END IF;
END $g$;

-- 19 اختصاصاً
INSERT INTO public.specialties (specialty_id, specialty_name, appointment_duration) OVERRIDING SYSTEM VALUE VALUES
    (1, 'الأمراض الباطنية', 20),
    (2, 'أمراض القلب', 30),
    (3, 'الأمراض الصدرية', 20),
    (4, 'أمراض الجهاز الهضمي', 20),
    (5, 'أمراض الغدد الصماء والسكري', 20),
    (6, 'أمراض الكلى', 20),
    (7, 'أمراض الدم', 20),
    (8, 'أمراض الروماتيزم والمفاصل', 20),
    (9, 'طب الأعصاب', 30),
    (10, 'الطب النفسي', 20),
    (11, 'الجراحة العامة', 20),
    (12, 'جراحة العظام والمفاصل', 30),
    (13, 'جراحة المسالك البولية', 20),
    (14, 'طب العيون', 30),
    (15, 'طب الأسنان', 30),
    (16, 'أمراض الأنف والأذن والحنجرة', 20),
    (17, 'الأمراض الجلدية', 20),
    (18, 'طب الأطفال', 20),
    (19, 'أمراض النساء والتوليد', 20);

-- 61 حساب طبيب (قيم bcrypt فقط)
INSERT INTO public.users (user_id, email, password_hash, role) OVERRIDING SYSTEM VALUE VALUES
    (1, 'doctor01@afiyah.example', '$2b$12$wh1szTbM0GoRAmUy6tEl5OjTTEbmIcqsRwW.PDIwr8eFRFhiWUfwm', 'doctor'),
    (2, 'doctor02@afiyah.example', '$2b$12$ITzPUYXoKTqzjxhcn3iwXeEKpqVvIf2kLUUqgBqFo3au75P5iNRae', 'doctor'),
    (3, 'doctor03@afiyah.example', '$2b$12$eo5hazg2b23m2Lhz3v8bXuPqPa/jwHxyCfC0nvdoBpGRBK5OBgidG', 'doctor'),
    (4, 'doctor04@afiyah.example', '$2b$12$4sfpQN.sj0LJHS1xm5wdx.6ZwEbiUoxXKg1xbLqu6HCrfIS0JvDBG', 'doctor'),
    (5, 'doctor05@afiyah.example', '$2b$12$uWo2vBHbE2nHZwguJxiI3uyTDzvPcXBRHrO4jVrdOGty9NoDw5Hky', 'doctor'),
    (6, 'doctor06@afiyah.example', '$2b$12$0Rc0t0q2QFUIp6gQG5Umre9wP4zGglX2aFUwmn9CQoZMFqRWxswhG', 'doctor'),
    (7, 'doctor07@afiyah.example', '$2b$12$OCOiUedwT7u1C.gimV8e1uA/YAk6MAGnmMYUCjgfk25021Xz9K7Qy', 'doctor'),
    (8, 'doctor08@afiyah.example', '$2b$12$WrQRMUKRni7m//4Mp5D15.s4PiOSt6G9FGcjZE73e7TVcGiOScdUa', 'doctor'),
    (9, 'doctor09@afiyah.example', '$2b$12$yv7hvwYSKYUXXmGOhdscT.jx8Mx8JTXle5kT6FE3iZytvht9X/oXq', 'doctor'),
    (10, 'doctor10@afiyah.example', '$2b$12$tBbK3OfCau0Lf/1EdMOpL.vbBkMI93YueuJ/mcFKBq6JSb4WN5vhi', 'doctor'),
    (11, 'doctor11@afiyah.example', '$2b$12$tFMmuvmyYK6HOj9u/pkbd.N3HZn1ySK491kf93SO/27ZzUl9O4d/6', 'doctor'),
    (12, 'doctor12@afiyah.example', '$2b$12$X7f6ZO6orcj7JUoIYnoyLu5QPd9u0ZL8ig6Jd58jVkHb1fFh2YoJq', 'doctor'),
    (13, 'doctor13@afiyah.example', '$2b$12$oEH/NO5xqZyPGf67ezheEOFVX84Iil/OZ4cUCKoRer6lPI7VNYcXu', 'doctor'),
    (14, 'doctor14@afiyah.example', '$2b$12$YabGZxA2vmg6MIoxok4k0.uFhW9HtO.tXwqzrumM81S5eYI8r2Jru', 'doctor'),
    (15, 'doctor15@afiyah.example', '$2b$12$ohN/W5tHB5/A7P6n5X3Uku.vkaXrt57FJpbhZZ.LKDcoM4wzZAqCe', 'doctor'),
    (16, 'doctor16@afiyah.example', '$2b$12$YDXScCkNrciR.lAGcdsqM.UDDGKUmYYZO8Lm9zQMEsjchcOgvj8QW', 'doctor'),
    (17, 'doctor17@afiyah.example', '$2b$12$mcQnH8uklO7HupnQZJYBteSuFbXoN9Y.BSFW5tClxsgQF/h5lbaX.', 'doctor'),
    (18, 'doctor18@afiyah.example', '$2b$12$z82JTD/FuEumLYhJgfdtT.0yehIPJcl.wttC5YTS1MRtDXtCQGusa', 'doctor'),
    (19, 'doctor19@afiyah.example', '$2b$12$CiQ83D4tfuYovpwCLkHkwOCiKTH72MWgASjNv6Wl95aZ4oa0jOZ26', 'doctor'),
    (20, 'doctor20@afiyah.example', '$2b$12$Z4N0nrO3h/M2f3se0S7vtu3iaG2UjGWClF8pLNoOFga9.8Casiw7u', 'doctor'),
    (21, 'doctor21@afiyah.example', '$2b$12$cb4R/m788kbDAA8l4O3WneVYvk46LsofycolijvSfCw4uzmbEu5ZK', 'doctor'),
    (22, 'doctor22@afiyah.example', '$2b$12$.rmGKTdLOTT/SyHFC6hOS.d1cOo2AepsYR8vzlo1iqqlz4y/a5TGi', 'doctor'),
    (23, 'doctor23@afiyah.example', '$2b$12$ltCFTbrH0ZChftXIDs6vtOkiXMET65u1FzFwHyN0xndrblpcdNX1S', 'doctor'),
    (24, 'doctor24@afiyah.example', '$2b$12$ut1QcoRsn3ik.5FaqjD8CudUW5huyK3Jklcg8Rcw0ehtCsqJADLVG', 'doctor'),
    (25, 'doctor25@afiyah.example', '$2b$12$y4mtB27W1pauqymi1WWqRuQ3lA92Vnlw5J7fVU1WaAVveqxHWeu0a', 'doctor'),
    (26, 'doctor26@afiyah.example', '$2b$12$Sb4YfBaV7iNywNZCRW0SPeJnrW7xJi.NJT9AebHX6HBMrR9DwtxL2', 'doctor'),
    (27, 'doctor27@afiyah.example', '$2b$12$WiytL1tWsj0XQ8awPnYbXuf/nCiU9qU0LErnKeEDnaDKfOc9uf9da', 'doctor'),
    (28, 'doctor28@afiyah.example', '$2b$12$KOPjwjLYA.w/0dmptxz5W.t6hpMvk5hsAa0397egTNXef1PbVQf3m', 'doctor'),
    (29, 'doctor29@afiyah.example', '$2b$12$2aEx7U6FDJWQF7xGgvUzvubRDonCLn6Dkrh8Owk.xA5sQkFiM7Yeu', 'doctor'),
    (30, 'doctor30@afiyah.example', '$2b$12$aWUcJ3iU7Wzw.lahd7tge.POAQk2elMKLIfEYO3YmhegNvxtOe7Ha', 'doctor'),
    (31, 'doctor31@afiyah.example', '$2b$12$TYwl43dZuwxFgc9xyGFJ8uipljKPuIKTYuWrmcuwO0uFheGCZMXda', 'doctor'),
    (32, 'doctor32@afiyah.example', '$2b$12$1Hg5OcI1CaTbEMn0L1sl3eR8nSygyF4lIbjEP2BtwQtgPRhb3.Hva', 'doctor'),
    (33, 'doctor33@afiyah.example', '$2b$12$nDaIz1dXGtoSx4H1eEu0zueMx5nzXajg9.SyfARPrYtM1w0jDK.Ze', 'doctor'),
    (34, 'doctor34@afiyah.example', '$2b$12$3QgUb1Yg7MfPeriowERyXeQtDGOhwOStdPgv4cETeMp9c5BvTRuZS', 'doctor'),
    (35, 'doctor35@afiyah.example', '$2b$12$O3.JVDS0P50j05dEsizCx.sfuiIb0GTY/DzBs38F1s0TdZAEK8T3G', 'doctor'),
    (36, 'doctor36@afiyah.example', '$2b$12$OB086PtztVy9m5VQbk47l.niJhVvJJO8FL9LfSF4cfJ1yhfF0xlQO', 'doctor'),
    (37, 'doctor37@afiyah.example', '$2b$12$8Lt8GTVRahblm8u9inWl1elmwGa5S2bb4DbgYZxdDwHAugN4UD7OK', 'doctor'),
    (38, 'doctor38@afiyah.example', '$2b$12$AjP6pDWeHQ5fopjS1yIeeeTRTOOTLO/t8I7S1ghvvjE6wuHKZTnj.', 'doctor'),
    (39, 'doctor39@afiyah.example', '$2b$12$TAd0FHnk6MWjrsc6U/0C6eB7LxNQyuUmGkZKyL2JqpBsU9fqevuEW', 'doctor'),
    (40, 'doctor40@afiyah.example', '$2b$12$kD6ACMENNPghRlUtftbpre9NaozcJa.jPr.pHWKvLMXj12TKagWS.', 'doctor'),
    (41, 'doctor41@afiyah.example', '$2b$12$t7MM.7ZmXYaIEoz1LSk7dudXTKerHG2FszdCXDw5Ez41HKkvuvvWS', 'doctor'),
    (42, 'doctor42@afiyah.example', '$2b$12$kO68cA8e7PbjtB1vRdJC..vl6nQLNyV4Mku9UKguZRziCXpBAjj2K', 'doctor'),
    (43, 'doctor43@afiyah.example', '$2b$12$YWAU//9qmHMxUR.sCK9dnePcV26xOdlF8595nGicdnbL6xSigR34K', 'doctor'),
    (44, 'doctor44@afiyah.example', '$2b$12$qBjsqcy9esEi8rfF9IaGPOVzc0uNRHDaUibWkUN9Ipa6Ti/2K99Ci', 'doctor'),
    (45, 'doctor45@afiyah.example', '$2b$12$v9n/LDSLL4ohydxxNvodLe0URYd0tpHrMAI1W2Mo0yyTwzSpTLrPi', 'doctor'),
    (46, 'doctor46@afiyah.example', '$2b$12$Bc/hb30hrEV/zudhSsXMF..1YWVCi2vrVlM27NNj3FdmvepvGjidy', 'doctor'),
    (47, 'doctor47@afiyah.example', '$2b$12$Vqj.I01XqnKMrakJ7SynsOw0mgn24IQjujtvQCAEl/kcmAoIaZ3FO', 'doctor'),
    (48, 'doctor48@afiyah.example', '$2b$12$mvLneolpRV2T3ZajM7zXL.QQCXLaM4OuvILvJVKItl8tRwf4O88.a', 'doctor'),
    (49, 'doctor49@afiyah.example', '$2b$12$bEFsT8mFp6.sfxaverXVIuHQsbk6wZIgj.zFVOhmX2B4Mz.GmuyEW', 'doctor'),
    (50, 'doctor50@afiyah.example', '$2b$12$aULsVd.deLx.auu7rXVLBO4pvHz3vxPxvnsDuyRVNrOri/uXF0ScC', 'doctor'),
    (51, 'doctor51@afiyah.example', '$2b$12$FVXmkyNxGI2nqq3mziwzZezA5zrpOYghpAwBDpzjfOZyP4w5sb.7K', 'doctor'),
    (52, 'doctor52@afiyah.example', '$2b$12$nvY5W.Yx2FC9WOrNxoYlNea7mnsHGHorlPpPj/W6P2.bTgeuYCagu', 'doctor'),
    (53, 'doctor53@afiyah.example', '$2b$12$mTyTMMP8c78QHj2maNhdM.YC73J1hXECHadJFW.sHw6UlBG4hjUYK', 'doctor'),
    (54, 'doctor54@afiyah.example', '$2b$12$XQOjMqXrhWTJFkJWL11NkOTRP.km5nu9ZSdzB08bXKt.as1KaDTQa', 'doctor'),
    (55, 'doctor55@afiyah.example', '$2b$12$3Dfn0Q1jx4p7RMtZLklgk.Pvc9qed1vDQgcb1TkqywjGsaaqfMcia', 'doctor'),
    (56, 'doctor56@afiyah.example', '$2b$12$IMJjWUdGx4HeUxakMNzXRutU.4HjAojXBy1no1JAsIaya56sJniw.', 'doctor'),
    (57, 'doctor57@afiyah.example', '$2b$12$ZJ1Oo6QK7sPr5SjnyWpcSeG4biRBdSa1.DHAPBHGnSAsOsXZp7QEu', 'doctor'),
    (58, 'doctor58@afiyah.example', '$2b$12$tI9H43cF1LJHl.CMjtmkH.btcZuofwTk4bk./Ss02/TI.qLkWTcXS', 'doctor'),
    (59, 'doctor59@afiyah.example', '$2b$12$DHK0zJ2PjX7/1jZy6WlP5..m4dZO7th9pGSQ7Rwn3SB5yJe3UiceO', 'doctor'),
    (60, 'doctor60@afiyah.example', '$2b$12$rFHbtOW7HNst6nv1eyA9le2g171EyRnRIq0ZD6hokPiuLfdviOxS6', 'doctor'),
    (61, 'doctor61@afiyah.example', '$2b$12$acIoiiwLPWdqlyJZZgQyQeBrR/fhlm93iFsaHpGQblH5zpBcgjXC.', 'doctor');

-- 61 طبيباً (المشغّل doctors_insert_guard_trg يعمل على كل صف)
INSERT INTO public.doctors (doctor_id, user_id, specialty_id, first_name, last_name, birth_date, phone, image_url, biography, years_of_experience) OVERRIDING SYSTEM VALUE VALUES
    (1, 1, 1, 'محمد', 'ميداني', '1994-02-08', '0900000001', '/images/doctors/doctor-01.png', NULL, 6),
    (2, 2, 1, 'ريما', 'العلي', '1996-03-15', '0900000002', '/images/doctors/doctor-02.png', NULL, 4),
    (3, 3, 1, 'خالد', 'منصور', '1991-04-22', '0900000003', '/images/doctors/doctor-03.png', NULL, 9),
    (4, 4, 2, 'سامر', 'الحلبي', '1995-05-01', '0900000004', '/images/doctors/doctor-04.png', NULL, 5),
    (5, 5, 2, 'لينا', 'الشامي', '1997-06-08', '0900000005', '/images/doctors/doctor-05.png', NULL, 3),
    (6, 6, 2, 'عمر', 'دباغ', '1992-07-15', '0900000006', '/images/doctors/doctor-06.png', NULL, 8),
    (7, 7, 3, 'هالة', 'القاسم', '1995-08-22', '0900000007', '/images/doctors/doctor-07.png', NULL, 5),
    (8, 8, 3, 'فادي', 'الأحمد', '1993-09-01', '0900000008', '/images/doctors/doctor-08.png', NULL, 7),
    (9, 9, 3, 'نور', 'سليمان', '1998-10-08', '0900000009', '/images/doctors/doctor-09.png', NULL, 3),
    (10, 10, 4, 'يوسف', 'الكردي', '1994-11-15', '0900000010', '/images/doctors/doctor-10.png', NULL, 6),
    (11, 11, 4, 'سلمى', 'المصري', '1997-12-22', '0900000011', '/images/doctors/doctor-11.png', NULL, 4),
    (12, 12, 4, 'بشار', 'حمصي', '1991-01-01', '0900000012', '/images/doctors/doctor-12.png', NULL, 9),
    (13, 13, 5, 'رنا', 'الحداد', '1996-02-08', '0900000013', '/images/doctors/doctor-13.png', NULL, 4),
    (14, 14, 5, 'ماهر', 'النجار', '1992-03-15', '0900000014', '/images/doctors/doctor-14.jpg', NULL, 8),
    (15, 15, 5, 'دانة', 'العبد الله', '1998-04-22', '0900000015', '/images/doctors/doctor-15.jpg', NULL, 3),
    (16, 16, 6, 'وسيم', 'العمر', '1994-05-01', '0900000016', '/images/doctors/doctor-16.jpg', NULL, 6),
    (17, 17, 6, 'مها', 'الشهابي', '1996-06-08', '0900000017', '/images/doctors/doctor-17.jpg', NULL, 4),
    (18, 18, 6, 'طارق', 'زيدان', '1992-07-15', '0900000018', '/images/doctors/doctor-18.jpg.jpg', NULL, 8),
    (19, 19, 7, 'ياسمين', 'القباني', '1997-08-22', '0900000019', '/images/doctors/doctor-19.jpg', NULL, 3),
    (20, 20, 7, 'رامي', 'سعد', '1995-09-01', '0900000020', '/images/doctors/doctor-20.png', NULL, 5),
    (21, 21, 7, 'رشا', 'الصباغ', '1994-10-08', '0900000021', '/images/doctors/doctor-21.jpg', NULL, 6),
    (22, 22, 8, 'هيثم', 'البيطار', '1992-11-15', '0900000022', '/images/doctors/doctor-22.png', NULL, 8),
    (23, 23, 8, 'هبة', 'الدالي', '1997-12-22', '0900000023', '/images/doctors/doctor-23.png', NULL, 3),
    (24, 24, 8, 'نزار', 'الشريف', '1991-01-01', '0900000024', '/images/doctors/doctor-24.png', NULL, 9),
    (25, 25, 9, 'مازن', 'العطار', '1993-02-08', '0900000025', '/images/doctors/doctor-25.png', NULL, 7),
    (26, 26, 9, 'سوسن', 'الخوري', '1995-03-15', '0900000026', '/images/doctors/doctor-26.png', NULL, 5),
    (27, 27, 9, 'زياد', 'المحمد', '1991-04-22', '0900000027', '/images/doctors/doctor-27.png', NULL, 9),
    (28, 28, 10, 'ميساء', 'الحكيم', '1994-05-01', '0900000028', '/images/doctors/doctor-28.png', NULL, 6),
    (29, 29, 10, 'كنان', 'الصالح', '1996-06-08', '0900000029', '/images/doctors/doctor-29.jpg', NULL, 4),
    (30, 30, 10, 'زينة', 'الراشد', '1998-07-15', '0900000030', '/images/doctors/doctor-30.png', NULL, 3),
    (31, 31, 11, 'لؤي', 'الدقاق', '1991-08-22', '0900000031', '/images/doctors/doctor-31.png', NULL, 9),
    (32, 32, 11, 'باسل', 'الأيوبي', '1993-09-01', '0900000032', '/images/doctors/doctor-32.png', NULL, 7),
    (33, 33, 11, 'لمى', 'المرعي', '1996-10-08', '0900000033', '/images/doctors/doctor-33.png', NULL, 4),
    (34, 34, 12, 'غسان', 'الزعبي', '1992-11-15', '0900000034', '/images/doctors/doctor-34.png', NULL, 8),
    (35, 35, 12, 'ثائر', 'الحسن', '1994-12-22', '0900000035', '/images/doctors/doctor-35.png', NULL, 6),
    (36, 36, 12, 'رغد', 'النعيمي', '1997-01-01', '0900000036', '/images/doctors/doctor-36.png', NULL, 3),
    (37, 37, 13, 'أنس', 'الفرا', '1993-02-08', '0900000037', '/images/doctors/doctor-37.png', NULL, 7),
    (38, 38, 13, 'مهند', 'القصير', '1995-03-15', '0900000038', '/images/doctors/doctor-38.png', NULL, 5),
    (39, 39, 13, 'حسام', 'الترك', '1990-04-22', '0900000039', '/images/doctors/doctor-39.png', NULL, 10),
    (40, 40, 14, 'عبير', 'الصيرفي', '1995-05-01', '0900000040', '/images/doctors/doctor-40.png', NULL, 5),
    (41, 41, 14, 'عدنان', 'الكيلاني', '1990-06-08', '0900000041', '/images/doctors/doctor-41.png', NULL, 10),
    (42, 42, 14, 'أسماء', 'الجزائري', '1996-07-15', '0900000042', '/images/doctors/doctor-42.png', NULL, 4),
    (43, 43, 14, 'جمال', 'زهرة', '1993-08-22', '0900000043', '/images/doctors/doctor-43.png', NULL, 7),
    (44, 44, 14, 'سارة', 'الأتاسي', '1998-09-01', '0900000044', '/images/doctors/doctor-44.png', NULL, 3),
    (45, 45, 15, 'هدى', 'الناصر', '1996-10-08', '0900000045', '/images/doctors/doctor-45.png', NULL, 4),
    (46, 46, 15, 'سليم', 'الرفاعي', '1992-11-15', '0900000046', '/images/doctors/doctor-46.png', NULL, 8),
    (47, 47, 15, 'ميادة', 'القدسي', '1997-12-22', '0900000047', '/images/doctors/doctor-47.png', NULL, 3),
    (48, 48, 15, 'أيمن', 'الزين', '1994-01-01', '0900000048', '/images/doctors/doctor-48.png', NULL, 6),
    (49, 49, 15, 'إياد', 'عيسى', '1997-02-08', '0900000049', '/images/doctors/doctor-49.png', NULL, 3),
    (50, 50, 16, 'محمد', 'الشيخ', '1993-03-15', '0900000050', '/images/doctors/doctor-50.png', NULL, 7),
    (51, 51, 16, 'رولا', 'ديب', '1996-04-22', '0900000051', '/images/doctors/doctor-51.png', NULL, 4),
    (52, 52, 16, 'عماد', 'الملا', '1992-05-01', '0900000052', '/images/doctors/doctor-52.png', NULL, 8),
    (53, 53, 17, 'دلال', 'الأسعد', '1997-06-08', '0900000053', '/images/doctors/doctor-53.png', NULL, 3),
    (54, 54, 17, 'يزن', 'الجندي', '1995-07-15', '0900000054', '/images/doctors/doctor-54.png', NULL, 5),
    (55, 55, 17, 'شهد', 'المدني', '1999-08-22', '0900000055', '/images/doctors/doctor-55.png', NULL, 3),
    (56, 56, 18, 'بتول', 'العباس', '1995-09-01', '0900000056', '/images/doctors/doctor-56.png', NULL, 5),
    (57, 57, 18, 'فراس', 'النحاس', '1993-10-08', '0900000057', '/images/doctors/doctor-57.png', NULL, 7),
    (58, 58, 18, 'آلاء', 'الحسيني', '1997-11-15', '0900000058', '/images/doctors/doctor-58.png', NULL, 3),
    (59, 59, 19, 'منى', 'الصواف', '1991-12-22', '0900000059', '/images/doctors/doctor-59.png', NULL, 9),
    (60, 60, 19, 'ريم', 'عبد الرحمن', '1994-01-01', '0900000060', '/images/doctors/doctor-60.png', NULL, 6),
    (61, 61, 19, 'هنادي', 'السقا', '1996-02-08', '0900000061', '/images/doctors/doctor-61.png', NULL, 4);

-- المعرّف التالي: 20 للاختصاصات و62 للمستخدمين والأطباء (معاملاتي)
ALTER TABLE public.specialties ALTER COLUMN specialty_id RESTART WITH 20;
ALTER TABLE public.users       ALTER COLUMN user_id      RESTART WITH 62;
ALTER TABLE public.doctors     ALTER COLUMN doctor_id    RESTART WITH 62;

DO $v$
DECLARE
    v_last bigint;
    v_called boolean;
BEGIN
    IF (SELECT count(*) FROM public.specialties) <> 19 OR (SELECT min(specialty_id) FROM public.specialties) <> 1 OR (SELECT max(specialty_id) FROM public.specialties) <> 19 THEN RAISE EXCEPTION 'verify: specialties must be exactly ids 1-19'; END IF;
    IF (SELECT count(*) FROM public.doctors) <> 61 OR (SELECT min(doctor_id) FROM public.doctors) <> 1 OR (SELECT max(doctor_id) FROM public.doctors) <> 61 THEN RAISE EXCEPTION 'verify: doctors must be exactly ids 1-61'; END IF;
    IF (SELECT count(*) FROM public.users) <> 61 OR (SELECT count(*) FROM public.users WHERE role = 'doctor' AND is_active) <> 61 THEN RAISE EXCEPTION 'verify: users must be exactly 61 active doctor accounts'; END IF;
    IF (SELECT count(*) FROM public.patients) + (SELECT count(*) FROM public.appointments) + (SELECT count(*) FROM public.pending_changes) <> 0 THEN RAISE EXCEPTION 'verify: patients, appointments and pending_changes must stay empty'; END IF;
    IF EXISTS (SELECT 1 FROM public.doctors d LEFT JOIN public.users u ON u.user_id = d.user_id WHERE u.user_id IS NULL OR u.role <> 'doctor' OR u.user_id <> d.doctor_id) THEN RAISE EXCEPTION 'verify: every doctor must have the doctor account with the same id'; END IF;
    IF (SELECT count(*) FROM (SELECT specialty_id, count(*) AS c FROM public.doctors GROUP BY specialty_id) x WHERE x.c = CASE WHEN x.specialty_id IN (14, 15) THEN 5 ELSE 3 END) <> 19 THEN RAISE EXCEPTION 'verify: doctors per specialty must be 3 (5 for ids 14 and 15)'; END IF;
    IF (SELECT count(*) FROM public.users WHERE password_hash ~ '^[$]2[aby][$]12[$][./A-Za-z0-9]{53}$') <> 61 THEN RAISE EXCEPTION 'verify: every password hash must be a bcrypt hash of cost 12'; END IF;
    IF (SELECT count(*) FROM public.users WHERE email ~ '^doctor(0[1-9]|[1-5][0-9]|6[01])@afiyah[.]example$') <> 61 OR (SELECT count(DISTINCT phone) FROM public.doctors WHERE phone ~ '^09[0-9]{8}$') <> 61 THEN RAISE EXCEPTION 'verify: emails and phones must be the approved unique formats'; END IF;
    IF (SELECT count(DISTINCT image_url) FROM public.doctors) <> 61 OR EXISTS (SELECT 1 FROM public.doctors WHERE biography IS NOT NULL) THEN RAISE EXCEPTION 'verify: unique image paths and NULL biographies expected'; END IF;

    SELECT last_value, is_called INTO v_last, v_called FROM public.specialties_specialty_id_seq;
    IF v_last <> 20 OR v_called THEN RAISE EXCEPTION 'verify: specialties sequence must restart at 20'; END IF;
    SELECT last_value, is_called INTO v_last, v_called FROM public.users_user_id_seq;
    IF v_last <> 62 OR v_called THEN RAISE EXCEPTION 'verify: users sequence must restart at 62'; END IF;
    SELECT last_value, is_called INTO v_last, v_called FROM public.doctors_doctor_id_seq;
    IF v_last <> 62 OR v_called THEN RAISE EXCEPTION 'verify: doctors sequence must restart at 62'; END IF;
    IF EXISTS (SELECT 1 FROM (
            SELECT last_value, is_called FROM public.patients_patient_id_seq
            UNION ALL SELECT last_value, is_called FROM public.appointments_appointment_id_seq
            UNION ALL SELECT last_value, is_called FROM public.pending_changes_change_id_seq
        ) s WHERE s.is_called OR s.last_value <> 1) THEN RAISE EXCEPTION 'verify: the other three sequences must remain unused'; END IF;
END $v$;

\if :{?dry_run}
    ROLLBACK;
    \echo 'seed dry run: all checks passed, transaction rolled back (nothing was saved)'
\else
    COMMIT;
    \echo 'seed committed: 19 specialties, 61 doctors, 61 doctor accounts'
\endif
