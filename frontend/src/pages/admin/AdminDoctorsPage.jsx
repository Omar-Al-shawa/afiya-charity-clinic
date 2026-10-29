import { useMemo, useRef, useState } from 'react';
import {
  createDoctor,
  fetchAdminDoctors,
  fetchAdminSpecialties,
  requestDoctorDelete,
  requestDoctorUpdate,
} from '../../api/admin';
import PendingBadge, { AdminNotice, ConfirmBar, ListSkeleton } from '../../components/admin/PendingBadge';
import AuthField from '../../components/auth/AuthField';
import PasswordField from '../../components/auth/PasswordField';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import useAsyncData from '../../hooks/useAsyncData';
import {
  BIOGRAPHY_MAX,
  DOCTOR_CREATE_FIELDS,
  DOCTOR_EDIT_FIELDS,
  EMPTY_DOCTOR_FORM,
  adminErrorMessage,
  doctorChanges,
  doctorCreatePayload,
  doctorToForm,
  emptyErrors,
  firstInvalid,
  normalizeValue,
  serverFieldErrors,
  validateAdminField,
  validateAdminForm,
} from '../../utils/adminValidation';
import { normalizeArabic } from '../../utils/arabicText';
import { formatMinutes, formatYears } from '../../utils/format';
import { PENDING_EXISTS_HINT, deferredMessage } from '../../utils/pendingChanges';
import { MIN_BIRTHDATE, getMaxBirthdate } from '../../utils/registrationValidation';
import { getDateLabels } from '../../utils/schedule';

// الأطباء: الإضافة فورية (201) بحساب الدخول وكلمة المرور الأولية. تعديل الموجود أو حذفه طلب مؤجَّل (202).
// اختصاص الطبيب ثابت بعد الإنشاء: يُختار عند الإضافة فقط ويُعرض نصاً عند التعديل ولا يُرسل أبداً.
const CONFLICT_CODES = ['PENDING_CHANGE_EXISTS', 'DOCTOR_NOT_FOUND', 'DOCTOR_INACTIVE'];

const doctorName = (doctor) => `د. ${doctor.firstName} ${doctor.lastName}`;

// بحث الاسم: مفتاح مطبَّع (normalizeArabic) بلا لقب «د.» في بدايته لأنه يُعرض مع الاسم ولا يدخل فيه
const toNameQuery = (raw) => normalizeArabic(raw).replace(/^د\.\s*(?=\S)/, '').replace(/^د\s+(?=\S)/, '');

// الاسم الأول أو اسم العائلة أو الاسم الكامل يحتوي نص البحث، مع تصفية الاختصاص (AND). الفارغ لا يصفّي.
function matchesFilters(doctor, nameQuery, specialtyFilter) {
  if (specialtyFilter && String(doctor.specialtyId) !== specialtyFilter) return false;
  if (!nameQuery) return true;
  return [doctor.firstName, doctor.lastName, `${doctor.firstName} ${doctor.lastName}`].some((name) =>
    normalizeArabic(name).includes(nameQuery),
  );
}

// معرّف الاختصاص يبقى نصاً في الحقل؛ يُحوَّل إلى عدد عند الإرسال فقط
function DoctorForm({ doctor, specialties, onDone, onCancel, onConflict }) {
  const editing = Boolean(doctor);
  const fields = editing ? DOCTOR_EDIT_FIELDS : DOCTOR_CREATE_FIELDS;
  const [values, setValues] = useState(() => (editing ? doctorToForm(doctor) : EMPTY_DOCTOR_FORM));
  const [errors, setErrors] = useState(() => emptyErrors(DOCTOR_CREATE_FIELDS));
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const sending = useRef(false);
  const controls = useRef({});
  const setControl = (field) => (element) => {
    controls.current[field] = element;
  };
  const dirty = useRef({});
  const attempted = useRef(false);

  const unchanged = editing && Object.keys(doctorChanges(doctor, values)).length === 0;
  const idPrefix = editing ? `doctor-${doctor.id}` : 'doctor-new';

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    dirty.current[field] = true;
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field] && !validateAdminField(field, value)) setErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleBlur = (field) => () => {
    const value = normalizeValue(field, values[field]);
    if (value !== values[field]) setValues((current) => ({ ...current, [field]: value }));
    if (!dirty.current[field] && !attempted.current) return;
    setErrors((current) => ({ ...current, [field]: validateAdminField(field, value) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending.current || unchanged) return;
    attempted.current = true;
    setFormError('');

    const next = { ...emptyErrors(DOCTOR_CREATE_FIELDS), ...validateAdminForm(fields, values) };
    setErrors(next);
    const invalid = firstInvalid(fields, next);
    if (invalid) {
      controls.current[invalid]?.focus();
      return;
    }

    sending.current = true;
    setSubmitting(true);
    try {
      const result = editing
        ? await requestDoctorUpdate(doctor.id, doctorChanges(doctor, values))
        : await createDoctor(doctorCreatePayload(values));
      onDone(result);
    } catch (error) {
      const fromServer = serverFieldErrors(error, fields);
      if (fromServer) {
        setErrors({ ...emptyErrors(DOCTOR_CREATE_FIELDS), ...fromServer });
        controls.current[firstInvalid(fields, fromServer)]?.focus();
      } else {
        setFormError(adminErrorMessage(error, { write: true }));
        if (CONFLICT_CODES.includes(error?.code)) onConflict();
      }
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  const textField = (field, label, extra = {}) => (
    <AuthField
      id={`${idPrefix}-${field}`}
      label={label}
      name={field}
      type={extra.as ? undefined : 'text'}
      inputRef={setControl(field)}
      value={values[field]}
      onChange={handleChange(field)}
      onBlur={handleBlur(field)}
      error={errors[field]}
      {...extra}
    />
  );

  return (
    <form onSubmit={handleSubmit} method="post" noValidate className="af-admin-form" aria-label={editing ? 'تعديل بيانات الطبيب' : 'إضافة طبيب'}>
      <p className="af-note">
        <i className="bi bi-info-circle" aria-hidden="true" />
        <span>
          {editing
            ? 'لا يُطبَّق التعديل فوراً: يُسجَّل طلب يُنفَّذ بعد 14 يوماً، وتبقى البيانات الحالية سارية حتى ذلك الحين. يُرسل ما تغيّر فقط.'
            : 'يُضاف الطبيب وحسابه فوراً، ويستطيع الدخول بالبريد وكلمة المرور الأولية.'}
        </span>
      </p>

      <div className="af-auth-row">
        {textField('firstName', 'الاسم الأول', { autoComplete: 'off' })}
        {textField('lastName', 'اسم العائلة', { autoComplete: 'off' })}
      </div>
      {textField('email', 'البريد الإلكتروني (حساب الدخول)', { type: 'email', dir: 'ltr', autoComplete: 'off' })}
      {!editing && (
        <PasswordField
          id={`${idPrefix}-password`}
          label="كلمة المرور الأولية"
          autoComplete="new-password"
          hint="8 أحرف على الأقل. تُسلَّم للطبيب ولا تُعرض بعد الإضافة."
          inputRef={setControl('password')}
          value={values.password}
          onChange={handleChange('password')}
          onBlur={handleBlur('password')}
          error={errors.password}
          visible={showPassword}
          onToggle={() => setShowPassword((current) => !current)}
        />
      )}
      <div className="af-auth-row">
        {textField('phone', 'رقم الهاتف', { type: 'tel', inputMode: 'numeric', dir: 'ltr', placeholder: '09xxxxxxxx', autoComplete: 'off' })}
        {textField('birthdate', 'تاريخ الميلاد', { type: 'date', min: MIN_BIRTHDATE, max: getMaxBirthdate() })}
      </div>

      {editing ? (
        <div className="af-auth-field">
          <p className="af-auth-label">الاختصاص</p>
          <p className="af-admin-static">{doctor.specialtyName}</p>
          <p className="af-auth-hint">لا يمكن تغيير اختصاص الطبيب بعد إضافته.</p>
        </div>
      ) : (
        <AuthField
          id={`${idPrefix}-specialtyId`}
          label="الاختصاص"
          as="select"
          name="specialtyId"
          inputRef={setControl('specialtyId')}
          value={values.specialtyId}
          onChange={handleChange('specialtyId')}
          onBlur={handleBlur('specialtyId')}
          error={errors.specialtyId}
          hint="يُحدَّد عند الإضافة ولا يمكن تغييره لاحقاً."
        >
          <option value="" disabled>
            اختر الاختصاص
          </option>
          {specialties.map((specialty) => {
            const blocked = specialty.pendingChange?.changeType === 'delete';
            return (
              <option key={specialty.id} value={specialty.id} disabled={blocked}>
                {specialty.name}
                {blocked ? ' (عليه طلب حذف معلّق)' : ''}
              </option>
            );
          })}
        </AuthField>
      )}

      {textField('imageUrl', 'رابط الصورة (اختياري)', {
        dir: 'ltr',
        required: false,
        placeholder: '/images/doctors/doctor-62.png',
        hint: 'مسار يبدأ بـ / أو رابط https. لا يوجد رفع للملفات.',
        autoComplete: 'off',
      })}
      {textField('biography', 'السيرة (اختياري)', { as: 'textarea', rows: 3, required: false, hint: `حتى ${BIOGRAPHY_MAX} حرف` })}
      {textField('yearsOfExperience', 'سنوات الخبرة (اختياري)', {
        inputMode: 'numeric',
        dir: 'ltr',
        required: false,
        hint: 'عدد صحيح من 0 إلى 60',
        autoComplete: 'off',
      })}

      <div className="af-admin-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting || unchanged}>
          {submitting ? 'جارٍ الإرسال…' : editing ? 'تسجيل طلب التعديل' : 'إضافة الطبيب'}
        </button>
        <button type="button" className="btn btn-outline-primary" disabled={submitting} onClick={onCancel}>
          إلغاء
        </button>
      </div>
      <div role="alert" className="af-admin-alert">
        {formError && (
          <p className="af-auth-error mt-3 mb-0">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}
      </div>
    </form>
  );
}

function DoctorCard({ doctor, specialties, onRequested, onConflict }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'delete'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const deleteRef = useRef(null);

  const { id, isActive, pendingChange } = doctor;
  const locked = Boolean(pendingChange);
  const rows = [
    { label: 'الاختصاص', value: `${doctor.specialtyName} (${formatMinutes(doctor.appointmentDuration)})` },
    { label: 'البريد الإلكتروني', value: <bdi dir="ltr">{doctor.email}</bdi> },
    { label: 'رقم الهاتف', value: <bdi dir="ltr">{doctor.phone}</bdi> },
    { label: 'تاريخ الميلاد', value: getDateLabels(doctor.birthdate).long },
    {
      label: 'سنوات الخبرة',
      value: doctor.yearsOfExperience === null ? '—' : doctor.yearsOfExperience === 0 ? 'أقل من سنة' : formatYears(doctor.yearsOfExperience),
    },
    { label: 'رابط الصورة', value: doctor.imageUrl ? <bdi dir="ltr">{doctor.imageUrl}</bdi> : '—' },
  ];

  const handleEdited = (change) => {
    setMode(null);
    onRequested(id, change);
  };

  const confirmDelete = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const change = await requestDoctorDelete(id);
      setMode(null);
      onRequested(id, change);
    } catch (err) {
      setError(adminErrorMessage(err, { write: true }));
      if (CONFLICT_CODES.includes(err?.code)) onConflict();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <article className="af-card af-admin-card" aria-labelledby={`doctor-${id}-name`}>
      <div className="af-admin-head">
        <h3 id={`doctor-${id}-name`} className="af-admin-name">
          {doctorName(doctor)}
        </h3>
        {!isActive && <span className="af-badge af-admin-badge--muted">غير مفعّل</span>}
      </div>
      <dl className="af-admin-details">
        {rows.map((row) => (
          <div key={row.label} className="af-admin-details-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {doctor.biography && (
        <details className="af-admin-bio">
          <summary>السيرة</summary>
          <p>{doctor.biography}</p>
        </details>
      )}

      {pendingChange && <PendingBadge change={pendingChange} />}

      {mode === 'edit' && (
        <DoctorForm doctor={doctor} specialties={specialties} onDone={handleEdited} onCancel={() => setMode(null)} onConflict={onConflict} />
      )}
      {mode === 'delete' && (
        <ConfirmBar
          label={`تأكيد طلب حذف الطبيب ${doctorName(doctor)}`}
          text="حذف الطبيب طلب مؤجَّل: يُسجَّل الآن ولا يُطبَّق فوراً، ويُنفَّذ بعد 14 يوماً. عند التنفيذ يُعطَّل حسابه فلا يستطيع الدخول، ويختفي من القوائم العامة، ولا تُقبل حجوزات جديدة له، وتبقى سجلاته ومواعيده السابقة محفوظة."
          confirmLabel="تسجيل طلب الحذف"
          busyLabel="جارٍ الإرسال…"
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setMode(null)}
          returnFocusRef={deleteRef}
        />
      )}
      <div role="alert" className="af-admin-alert">
        {error && (
          <p className="af-auth-error mt-3 mb-0">
            <i className="bi bi-exclamation-circle" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {mode === null && (
        <div className="af-admin-card-actions">
          {isActive ? (
            <>
              <div className="af-admin-actions">
                <button type="button" className="btn btn-outline-primary" disabled={locked} onClick={() => { setError(''); setMode('edit'); }}>
                  <i className="bi bi-pencil" aria-hidden="true" /> تعديل
                </button>
                <button
                  type="button"
                  ref={deleteRef}
                  className="btn btn-outline-danger"
                  disabled={locked}
                  aria-describedby={locked ? `doctor-${id}-hint` : undefined}
                  onClick={() => { setError(''); setMode('delete'); }}
                >
                  <i className="bi bi-trash" aria-hidden="true" /> حذف الطبيب
                </button>
              </div>
              {locked && (
                <p id={`doctor-${id}-hint`} className="af-admin-hint">
                  {PENDING_EXISTS_HINT}
                </p>
              )}
            </>
          ) : (
            <p className="af-admin-hint">حساب الطبيب معطّل؛ لا يمكن تسجيل طلبات تعديل أو حذف له.</p>
          )}
        </div>
      )}
    </article>
  );
}

function DoctorsContent({ initial }) {
  const [doctors, setDoctors] = useState(initial.doctors);
  const [specialties, setSpecialties] = useState(initial.specialties);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState(''); // '' = جميع الاختصاصات
  const noticeRef = useRef(null);
  const addRef = useRef(null);

  const nameQuery = toNameQuery(query);
  const filtering = Boolean(nameQuery || specialtyFilter);
  const visible = useMemo(
    () => doctors.filter((doctor) => matchesFilters(doctor, nameQuery, specialtyFilter)),
    [doctors, nameQuery, specialtyFilter],
  );

  const announce = (next) => {
    setMessage(next);
    setTimeout(() => noticeRef.current?.focus(), 0);
  };

  // بعد تعارض مع حالة الخادم (طلب معلّق، طبيب معطّل…) تُجلب القائمتان من جديد؛ إن فشل الجلب تبقى الحاليتان
  const reload = async () => {
    try {
      const [nextDoctors, nextSpecialties] = await Promise.all([fetchAdminDoctors(), fetchAdminSpecialties()]);
      setDoctors(nextDoctors);
      setSpecialties(nextSpecialties);
      // اختصاص محدد في التصفية لم يعد موجوداً: يعود الاختيار إلى «جميع الاختصاصات»
      setSpecialtyFilter((current) => (nextSpecialties.some((item) => String(item.id) === current) ? current : ''));
    } catch {
      /* تبقى القوائم الحالية */
    }
  };

  const handleCreated = (created) => {
    setDoctors((current) => [...current, created]);
    setCreating(false);
    // المرشّحان يبقيان كما هما؛ إن لم يطابقهما الطبيب الجديد يُذكر سبب غيابه عن القائمة
    const hidden = !matchesFilters(created, nameQuery, specialtyFilter);
    announce({
      kind: 'success',
      text: `أُضيف ${doctorName(created)} وحسابه فوراً.${hidden ? ' لا يظهر في القائمة الآن بسبب البحث أو الاختصاص المحدد؛ امسح التصفية لعرضه.' : ''}`,
    });
  };

  const handleRequested = (id, change) => {
    setDoctors((current) => current.map((item) => (item.id === id ? { ...item, pendingChange: change } : item)));
    announce({ kind: 'info', text: deferredMessage(change) });
  };

  return (
    <>
      <AdminNotice message={message} noticeRef={noticeRef} />

      <section className="af-card af-admin-card" aria-labelledby="doctor-add-title">
        <div className="af-admin-head">
          <h2 id="doctor-add-title" className="af-admin-card-title">
            إضافة طبيب
          </h2>
          {!creating && (
            <button type="button" ref={addRef} className="btn btn-primary" onClick={() => { setMessage(null); setCreating(true); }}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> طبيب جديد
            </button>
          )}
        </div>
        {creating && (
          <DoctorForm
            specialties={specialties}
            onDone={handleCreated}
            onCancel={() => {
              setCreating(false);
              setTimeout(() => addRef.current?.focus(), 0);
            }}
            onConflict={reload}
          />
        )}
      </section>

      <section aria-labelledby="doctor-list-title">
        <h2 id="doctor-list-title" className="af-admin-section-title">
          الأطباء{' '}
          <span className="af-admin-count">({filtering ? `${visible.length} من ${doctors.length}` : doctors.length})</span>
        </h2>
        {doctors.length > 0 && (
          <form
            className="af-card af-admin-card af-admin-filters mb-3"
            onSubmit={(event) => event.preventDefault()}
            aria-label="بحث وتصفية الأطباء"
            noValidate
          >
            <AuthField
              id="doctors-filter-query"
              label="بحث بالاسم"
              type="search"
              name="query"
              required={false}
              autoComplete="off"
              placeholder="الاسم الأول أو اسم العائلة"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <AuthField
              id="doctors-filter-specialty"
              label="الاختصاص"
              as="select"
              name="specialtyFilter"
              required={false}
              value={specialtyFilter}
              onChange={(event) => setSpecialtyFilter(event.target.value)}
            >
              <option value="">جميع الاختصاصات</option>
              {specialties.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>
                  {specialty.name}
                </option>
              ))}
            </AuthField>
            {filtering && (
              <button
                type="button"
                className="btn btn-outline-primary af-admin-filter-clear"
                onClick={() => {
                  setQuery('');
                  setSpecialtyFilter('');
                }}
              >
                مسح التصفية
              </button>
            )}
          </form>
        )}
        {doctors.length === 0 ? (
          <EmptyState icon="bi-person-badge" title="لا يوجد أطباء" text="أضف أول طبيب من الأعلى." />
        ) : visible.length === 0 ? (
          <EmptyState icon="bi-search" title="لا يوجد أطباء مطابقون" text="غيّر كلمات البحث أو الاختصاص، أو امسح التصفية." />
        ) : (
          <ul className="af-admin-stack list-unstyled mb-0">
            {visible.map((doctor) => (
              <li key={doctor.id}>
                <DoctorCard doctor={doctor} specialties={specialties} onRequested={handleRequested} onConflict={reload} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// الأطباء والاختصاصات معاً: قائمة الاختصاصات لحقل الاختصاص في نموذج الإضافة
async function loadDoctorsData() {
  const [doctors, specialties] = await Promise.all([fetchAdminDoctors(), fetchAdminSpecialties()]);
  return { doctors, specialties };
}

export default function AdminDoctorsPage() {
  const { status, data, retry } = useAsyncData(loadDoctorsData);

  if (status === 'loading') return <ListSkeleton label="جارٍ تحميل الأطباء…" />;
  if (status === 'error') return <ErrorState message="تعذّر تحميل الأطباء." onRetry={retry} />;
  return <DoctorsContent initial={data} />;
}
