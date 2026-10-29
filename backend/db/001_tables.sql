-- المرحلة 1B-2a: الجداول الستة والقيود الأساسية (afiyah_test فقط).
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -1 -v expect_db=afiyah_test -d afiyah_test -f 001_tables.sql
-- لا دوال ولا مشغّلات ولا فهارس إضافية ولا صلاحيات هنا؛ تأتي في المراحل 1B-2b إلى 1B-2e.
-- التعبير "!~ '^\s*$'" يرفض القيمة الفارغة أو المؤلفة من مسافات فقط.
\ir _guard.sql

-- المستخدمون: البريد بأحرف صغيرة بلا مسافات طرفية؛ كلمة المرور المشفّرة غير فارغة.
CREATE TABLE public.users (
    user_id       INTEGER GENERATED ALWAYS AS IDENTITY,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT users_pkey PRIMARY KEY (user_id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_email_ck CHECK (email <> '' AND email = lower(email) AND email !~ '^\s' AND email !~ '\s$'),
    CONSTRAINT users_password_hash_ck CHECK (password_hash !~ '^\s*$'),
    CONSTRAINT users_role_ck CHECK (role IN ('patient', 'doctor', 'admin'))
);

-- الاختصاصات: مدة الموعد بالدقائق من 1 إلى 480.
CREATE TABLE public.specialties (
    specialty_id         INTEGER GENERATED ALWAYS AS IDENTITY,
    specialty_name       VARCHAR(100) NOT NULL,
    appointment_duration INTEGER      NOT NULL,
    CONSTRAINT specialties_pkey PRIMARY KEY (specialty_id),
    CONSTRAINT specialties_specialty_name_key UNIQUE (specialty_name),
    CONSTRAINT specialties_name_ck CHECK (specialty_name !~ '^\s*$'),
    CONSTRAINT specialties_duration_ck CHECK (appointment_duration BETWEEN 1 AND 480)
);

-- المرضى: العنوان وزمرة الدم اختياريان؛ زمرة الدم المجهولة تُخزَّن NULL.
CREATE TABLE public.patients (
    patient_id INTEGER GENERATED ALWAYS AS IDENTITY,
    user_id    INTEGER      NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name  VARCHAR(100) NOT NULL,
    phone      VARCHAR(20)  NOT NULL,
    birth_date DATE         NOT NULL,
    address    VARCHAR(255),
    gender     VARCHAR(10)  NOT NULL,
    blood_type VARCHAR(5),
    CONSTRAINT patients_pkey PRIMARY KEY (patient_id),
    CONSTRAINT patients_user_id_key UNIQUE (user_id),
    CONSTRAINT patients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE RESTRICT,
    CONSTRAINT patients_first_name_ck CHECK (first_name !~ '^\s*$'),
    CONSTRAINT patients_last_name_ck CHECK (last_name !~ '^\s*$'),
    CONSTRAINT patients_phone_ck CHECK (phone !~ '^\s*$'),
    CONSTRAINT patients_address_ck CHECK (address IS NULL OR address !~ '^\s*$'),
    CONSTRAINT patients_gender_ck CHECK (gender IN ('male', 'female')),
    CONSTRAINT patients_blood_type_ck CHECK (blood_type IS NULL OR blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'))
);

-- الأطباء: تثبيت specialty_id عبر مشغّل يأتي في المرحلة 1B-2c.
CREATE TABLE public.doctors (
    doctor_id           INTEGER GENERATED ALWAYS AS IDENTITY,
    user_id             INTEGER      NOT NULL,
    specialty_id        INTEGER      NOT NULL,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    birth_date          DATE         NOT NULL,
    phone               VARCHAR(20)  NOT NULL,
    image_url           VARCHAR(500),
    biography           TEXT,
    years_of_experience INTEGER,
    CONSTRAINT doctors_pkey PRIMARY KEY (doctor_id),
    CONSTRAINT doctors_user_id_key UNIQUE (user_id),
    CONSTRAINT doctors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users (user_id) ON DELETE RESTRICT,
    CONSTRAINT doctors_specialty_id_fkey FOREIGN KEY (specialty_id) REFERENCES public.specialties (specialty_id) ON DELETE RESTRICT,
    CONSTRAINT doctors_first_name_ck CHECK (first_name !~ '^\s*$'),
    CONSTRAINT doctors_last_name_ck CHECK (last_name !~ '^\s*$'),
    CONSTRAINT doctors_phone_ck CHECK (phone !~ '^\s*$'),
    CONSTRAINT doctors_image_url_ck CHECK (image_url IS NULL OR image_url !~ '^\s*$'),
    CONSTRAINT doctors_years_of_experience_ck CHECK (years_of_experience IS NULL OR years_of_experience >= 0)
);

-- الحجوزات: وقت البداية فقط، ضمن 09:00 إلى قبل 17:00 وبدقائق كاملة، وليس يوم الجمعة (DOW = 5).
-- منع التعارض والحجز المكرر والنافذة الزمنية تأتي في المراحل 1B-2b و1B-2c.
CREATE TABLE public.appointments (
    appointment_id   INTEGER GENERATED ALWAYS AS IDENTITY,
    patient_id       INTEGER     NOT NULL,
    doctor_id        INTEGER     NOT NULL,
    appointment_date DATE        NOT NULL,
    appointment_time TIME        NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'booked',
    CONSTRAINT appointments_pkey PRIMARY KEY (appointment_id),
    CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients (patient_id) ON DELETE RESTRICT,
    CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors (doctor_id) ON DELETE RESTRICT,
    CONSTRAINT appointments_date_not_friday_ck CHECK (EXTRACT(DOW FROM appointment_date) <> 5),
    CONSTRAINT appointments_time_ck CHECK (appointment_time >= TIME '09:00' AND appointment_time < TIME '17:00' AND EXTRACT(SECOND FROM appointment_time) = 0),
    CONSTRAINT appointments_status_ck CHECK (status IN ('booked', 'cancelled'))
);

-- التغييرات المعلّقة: هدف واحد بالضبط؛ حذف الاختصاص يحذف طلباته (CASCADE).
-- execute_at = منتصف ليل Asia/Damascus لتاريخ الإنشاء الدمشقي + 14 يوماً تقويمياً (وليس 336 ساعة).
-- قائمة مفاتيح new_data المسموحة وأنواع قيمها تُضاف في المرحلة 1B-2b؛ هنا الشكل العام فقط.
CREATE TABLE public.pending_changes (
    change_id      INTEGER GENERATED ALWAYS AS IDENTITY,
    doctor_id      INTEGER,
    specialty_id   INTEGER,
    change_type    VARCHAR(20) NOT NULL,
    new_data       JSONB,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    execute_at     TIMESTAMPTZ NOT NULL,
    failure_reason TEXT,
    CONSTRAINT pending_changes_pkey PRIMARY KEY (change_id),
    CONSTRAINT pending_changes_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors (doctor_id) ON DELETE RESTRICT,
    CONSTRAINT pending_changes_specialty_id_fkey FOREIGN KEY (specialty_id) REFERENCES public.specialties (specialty_id) ON DELETE CASCADE,
    CONSTRAINT pending_changes_target_ck CHECK (num_nonnulls(doctor_id, specialty_id) = 1),
    CONSTRAINT pending_changes_change_type_ck CHECK (change_type IN ('update', 'delete')),
    CONSTRAINT pending_changes_status_ck CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
    CONSTRAINT pending_changes_new_data_shape_ck CHECK (
        (change_type = 'delete' AND new_data IS NULL)
        OR (change_type = 'update' AND new_data IS NOT NULL AND jsonb_typeof(new_data) = 'object' AND new_data <> '{}'::jsonb)
    ),
    CONSTRAINT pending_changes_failure_reason_ck CHECK (
        (status = 'failed' AND failure_reason IS NOT NULL AND failure_reason !~ '^\s*$')
        OR (status <> 'failed' AND failure_reason IS NULL)
    ),
    CONSTRAINT pending_changes_execute_at_ck CHECK (
        execute_at = ((date_trunc('day', created_at AT TIME ZONE 'Asia/Damascus') + interval '14 days') AT TIME ZONE 'Asia/Damascus')
    )
);
