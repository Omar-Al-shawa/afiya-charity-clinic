import { useRef, useState } from 'react';
import { fetchProfile, updateProfile } from '../../api/patient';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../../api/http';
import AuthField from '../../components/auth/AuthField';
import PasswordChangeForm from '../../components/auth/PasswordChangeForm';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Skeleton from '../../components/common/Skeleton';
import { useAuth } from '../../context/AuthContext';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { GENDERS, normalizeField, validateField } from '../../utils/registrationValidation';
import { getDateLabels } from '../../utils/schedule';

// D3: الملف الشخصي للمريض. القابل للتعديل أربعة حقول فقط (الاسم الأول، اسم العائلة، الهاتف، العنوان) عبر PUT /api/patient/profile؛
// البريد وتاريخ الميلاد والجنس وزمرة الدم للعرض فقط. تغيير كلمة المرور عبر POST /api/auth/change-password (تبقى الجلسة صالحة).
// الخادم هو المرجع؛ أخطاء الحقول منه تُربط بالحقول. التفاعل كما في A8: noValidate، تحقق عند الإرسال وعند الخروج من حقل لُمس.

const PROFILE_FIELDS = ['firstName', 'lastName', 'phone', 'address'];
const NO_PROFILE_ERRORS = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, '']));

const toFormValues = (profile) => Object.fromEntries(PROFILE_FIELDS.map((field) => [field, profile[field] ?? '']));

// أخطاء الحقول من الخادم (فقط ما كان ضمن الحقول المعروفة)
function serverFieldErrors(error, fields) {
  if (!(error instanceof ApiError) || !error.fields) return null;
  const mapped = Object.fromEntries(
    fields.map((field) => [field, typeof error.fields[field] === 'string' ? error.fields[field] : '']),
  );
  return fields.some((field) => mapped[field]) ? mapped : null;
}

function ReadOnlyCard({ profile }) {
  const gender = GENDERS.find((item) => item.value === profile.gender)?.label ?? '—';
  const birth = profile.birthdate ? getDateLabels(profile.birthdate) : null;
  const rows = [
    { label: 'البريد الإلكتروني', value: <bdi dir="ltr">{profile.email}</bdi> },
    { label: 'تاريخ الميلاد', value: birth ? `${birth.day} ${birth.month} ${birth.year}` : '—' },
    { label: 'الجنس', value: gender },
    { label: 'زمرة الدم', value: profile.bloodType ? <bdi dir="ltr">{profile.bloodType}</bdi> : 'لا أعلم' },
  ];

  return (
    <section className="af-card af-patient-card" aria-labelledby="profile-account-title">
      <h2 id="profile-account-title" className="af-patient-card-title">
        بيانات الحساب
      </h2>
      <p className="af-patient-card-lead">هذه البيانات للعرض فقط ولا يمكن تعديلها من هنا.</p>
      <dl className="af-patient-readonly">
        {rows.map((row) => (
          <div key={row.label} className="af-patient-readonly-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProfileForm({ profile, onSaved }) {
  const [values, setValues] = useState(() => toFormValues(profile));
  const [errors, setErrors] = useState(NO_PROFILE_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState('');
  const sending = useRef(false); // يمنع الإرسال المزدوج قبل أن يُعاد الرسم
  const controls = useRef({});
  const setControl = (field) => (element) => {
    controls.current[field] = element;
  };
  const dirty = useRef({});
  const attempted = useRef(false);

  // لا تغيير عن المحفوظ (بعد التطبيع) فلا حاجة للإرسال
  const unchanged = PROFILE_FIELDS.every((field) => normalizeField(field, values[field]) === (profile[field] ?? ''));

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    dirty.current[field] = true;
    setSaved(false);
    setValues((current) => ({ ...current, [field]: value }));
    // يُمسح الخطأ فور أن تصبح القيمة صحيحة؛ لا يظهر خطأ جديد أثناء الكتابة
    if (errors[field] && !validateField(field, value)) {
      setErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  const handleBlur = (field) => () => {
    const value = normalizeField(field, values[field]);
    if (value !== values[field]) setValues((current) => ({ ...current, [field]: value }));
    if (!dirty.current[field] && !attempted.current) return;
    setErrors((current) => ({ ...current, [field]: validateField(field, value) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending.current || unchanged) return;
    attempted.current = true;
    setFormError('');
    setSaved(false);

    const normalized = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, normalizeField(field, values[field])]));
    const next = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, validateField(field, normalized[field])]));
    setErrors(next);
    const firstInvalid = PROFILE_FIELDS.find((field) => next[field]);
    if (firstInvalid) {
      controls.current[firstInvalid]?.focus();
      return;
    }

    setValues(normalized);
    sending.current = true;
    setSubmitting(true);
    try {
      const updated = await updateProfile(normalized);
      // الاسم في الشريط يُحدَّث بعد نجاح الحفظ فقط
      onSaved(updated);
      setValues(toFormValues(updated));
      setErrors(NO_PROFILE_ERRORS);
      setSaved(true);
    } catch (error) {
      const fromServer = serverFieldErrors(error, PROFILE_FIELDS);
      if (fromServer) {
        setErrors(fromServer);
        controls.current[PROFILE_FIELDS.find((field) => fromServer[field])]?.focus();
      } else {
        setFormError(error instanceof ApiError ? error.message : NETWORK_ERROR_MESSAGE);
      }
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="af-card af-patient-card" aria-labelledby="profile-edit-title">
      <h2 id="profile-edit-title" className="af-patient-card-title">
        تعديل بياناتي
      </h2>
      <p className="af-patient-card-lead">يمكنك تعديل الاسم ورقم الهاتف والعنوان.</p>

      <form onSubmit={handleSubmit} method="post" noValidate>
        <div className="af-auth-row">
          <AuthField
            id="profile-first-name"
            label="الاسم الأول"
            name="firstName"
            type="text"
            autoComplete="given-name"
            inputRef={setControl('firstName')}
            value={values.firstName}
            onChange={handleChange('firstName')}
            onBlur={handleBlur('firstName')}
            error={errors.firstName}
          />
          <AuthField
            id="profile-last-name"
            label="اسم العائلة"
            name="lastName"
            type="text"
            autoComplete="family-name"
            inputRef={setControl('lastName')}
            value={values.lastName}
            onChange={handleChange('lastName')}
            onBlur={handleBlur('lastName')}
            error={errors.lastName}
          />
        </div>
        <AuthField
          id="profile-phone"
          label="رقم الهاتف"
          name="phone"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          placeholder="09xxxxxxxx"
          autoComplete="tel-national"
          inputRef={setControl('phone')}
          value={values.phone}
          onChange={handleChange('phone')}
          onBlur={handleBlur('phone')}
          error={errors.phone}
        />
        <AuthField
          id="profile-address"
          label="عنوان السكن"
          as="textarea"
          name="address"
          rows={2}
          autoComplete="street-address"
          inputRef={setControl('address')}
          value={values.address}
          onChange={handleChange('address')}
          onBlur={handleBlur('address')}
          error={errors.address}
        />

        <button type="submit" className="btn btn-primary af-auth-submit" disabled={submitting || unchanged}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
        </button>
      </form>

      <div role="status">
        {saved && (
          <p className="af-note af-auth-notice">
            <i className="bi bi-check-circle" aria-hidden="true" />
            <span>تم حفظ بياناتك.</span>
          </p>
        )}
      </div>
      <div role="alert">
        {formError && (
          <p className="af-auth-error mt-3 mb-0">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}
      </div>
    </section>
  );
}

function ProfileContent({ initial }) {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(initial);

  const handleSaved = (updated) => {
    setProfile(updated);
    updateUser(updated);
  };

  return (
    <>
      <ReadOnlyCard profile={profile} />
      <ProfileForm profile={profile} onSaved={handleSaved} />
      <PasswordChangeForm />
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">جارٍ تحميل ملفك الشخصي…</span>
      <div className="af-patient-stack" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="af-card af-patient-card">
            <Skeleton className="d-block mb-3" style={{ width: '30%', height: 20 }} />
            <Skeleton className="d-block mb-2" style={{ width: '60%', height: 14 }} />
            <Skeleton className="d-block mb-2" style={{ width: '50%', height: 14 }} />
            <Skeleton className="d-block" style={{ width: '40%', height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PatientProfilePage() {
  useDocumentTitle('ملفي الشخصي');
  const { status, data, retry } = useAsyncData(fetchProfile);

  return (
    <>
      <PageHeader
        title="ملفي الشخصي"
        subtitle="اطّلع على بياناتك وعدّل ما يمكن تعديله."
        breadcrumb={[{ label: 'ملفي الشخصي' }]}
      />
      <div className="container">
        <div className="af-patient">
          {status === 'loading' && <ProfileSkeleton />}
          {status === 'error' && <ErrorState message="تعذّر تحميل ملفك الشخصي." onRetry={retry} />}
          {status === 'success' && <ProfileContent initial={data} />}
        </div>
      </div>
    </>
  );
}
