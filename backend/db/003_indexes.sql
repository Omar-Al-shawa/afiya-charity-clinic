-- المرحلة 1B-2b (الجزء 2): الفهارس الستة المعتمدة (afiyah_test فقط). لا تعتمد على 002_functions.sql.
-- التشغيل: psql -X -v ON_ERROR_STOP=1 -1 -v expect_db=afiyah_test -d afiyah_test -f 003_indexes.sql
--
-- حدود هذه الفهارس: الفهرسان الفريدان للحجوزات يمنعان فقط تطابق وقت البداية تماماً. لا يمنعان تعارض مواعيد ببدايات مختلفة
-- (مثل 09:00 و 09:10 لطبيب مدة موعده 20 دقيقة)، ولا تعارض مواعيد مريض عند أطباء بمدد مختلفة، ولا تأخذ المدة ولا النافذة الزمنية
-- ولا نشاط الطبيب ولا التغييرات المعلّقة بالحسبان؛ هذه كلها من مهام مشغّلات 1B-2c.
-- ملاحظة للخلفي: الفهرس الجزئي لا يُسمّى في ON CONFLICT ON CONSTRAINT؛ يُستعمل ON CONFLICT (الأعمدة) WHERE الشرط.
\ir _guard.sql

-- مدير واحد على الأكثر (لا يشترط وجوده؛ حساب المدير يُنشأ بالبذر، والمدير غير النشط يُحتسب أيضاً).
CREATE UNIQUE INDEX users_one_admin
    ON public.users (role)
    WHERE role = 'admin';

-- حجز قائم واحد لكل طبيب ويوم ووقت بداية، ويُفرَج عن الموعد عند الإلغاء.
CREATE UNIQUE INDEX appointments_doctor_slot_uq
    ON public.appointments (doctor_id, appointment_date, appointment_time)
    WHERE status = 'booked';

-- لا يحمل المريض حجزين قائمين بوقت بداية واحد عند أي طبيب (ويخدم أيضاً استعلام "حجوزاتي").
CREATE UNIQUE INDEX appointments_patient_slot_uq
    ON public.appointments (patient_id, appointment_date, appointment_time)
    WHERE status = 'booked';

-- طلب معلّق واحد لكل طبيب، وطلب معلّق واحد لكل اختصاص.
CREATE UNIQUE INDEX pending_changes_one_per_doctor
    ON public.pending_changes (doctor_id)
    WHERE status = 'pending' AND doctor_id IS NOT NULL;

CREATE UNIQUE INDEX pending_changes_one_per_specialty
    ON public.pending_changes (specialty_id)
    WHERE status = 'pending' AND specialty_id IS NOT NULL;

-- يسرّع فحص RESTRICT عند حذف اختصاص واستعلام أطباء اختصاص معيّن.
CREATE INDEX doctors_specialty_id_idx
    ON public.doctors (specialty_id);
