import { useRef, useState } from 'react';
import {
  createSpecialty,
  fetchAdminSpecialties,
  requestSpecialtyDelete,
  requestSpecialtyUpdate,
} from '../../api/admin';
import PendingBadge, { AdminNotice, ConfirmBar, ListSkeleton } from '../../components/admin/PendingBadge';
import AuthField from '../../components/auth/AuthField';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import useAsyncData from '../../hooks/useAsyncData';
import {
  EMPTY_SPECIALTY_FORM,
  SPECIALTY_FIELDS,
  adminErrorMessage,
  emptyErrors,
  firstInvalid,
  normalizeValue,
  serverFieldErrors,
  specialtyChanges,
  specialtyCreatePayload,
  specialtyToForm,
  validateAdminField,
  validateAdminForm,
} from '../../utils/adminValidation';
import { formatDoctorsCount, formatMinutes } from '../../utils/format';
import { PENDING_EXISTS_HINT, deferredMessage } from '../../utils/pendingChanges';

// الاختصاصات: الإضافة فورية (201). تعديل الموجود أو حذفه يسجّل طلباً مؤجَّلاً (202) ولا يغيّر الاختصاص الظاهر.
// الخادم هو المرجع في القواعد (وجود أطباء، طلب معلّق سابق، تكرار الاسم)؛ ما في الواجهة تلميحات فقط.
const CONFLICT_CODES = ['PENDING_CHANGE_EXISTS', 'SPECIALTY_NOT_FOUND', 'AF120'];

// نموذج واحد للإضافة (specialty = null) وللتعديل
function SpecialtyForm({ specialty, onDone, onCancel, onConflict }) {
  const editing = Boolean(specialty);
  const [values, setValues] = useState(() => (editing ? specialtyToForm(specialty) : EMPTY_SPECIALTY_FORM));
  const [errors, setErrors] = useState(() => emptyErrors(SPECIALTY_FIELDS));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const sending = useRef(false);
  const controls = useRef({});
  const setControl = (field) => (element) => {
    controls.current[field] = element;
  };
  const dirty = useRef({});
  const attempted = useRef(false);

  const unchanged = editing && Object.keys(specialtyChanges(specialty, values)).length === 0;
  const idPrefix = editing ? `specialty-${specialty.id}` : 'specialty-new';

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

    const next = validateAdminForm(SPECIALTY_FIELDS, values);
    setErrors(next);
    const invalid = firstInvalid(SPECIALTY_FIELDS, next);
    if (invalid) {
      controls.current[invalid]?.focus();
      return;
    }

    sending.current = true;
    setSubmitting(true);
    try {
      const result = editing
        ? await requestSpecialtyUpdate(specialty.id, specialtyChanges(specialty, values))
        : await createSpecialty(specialtyCreatePayload(values));
      onDone(result);
    } catch (error) {
      const fromServer = serverFieldErrors(error, SPECIALTY_FIELDS);
      if (fromServer) {
        setErrors(fromServer);
        controls.current[firstInvalid(SPECIALTY_FIELDS, fromServer)]?.focus();
      } else {
        setFormError(adminErrorMessage(error, { write: true }));
        if (CONFLICT_CODES.includes(error?.code)) onConflict();
      }
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} method="post" noValidate className="af-admin-form" aria-label={editing ? 'تعديل الاختصاص' : 'إضافة اختصاص'}>
      {editing ? (
        <p className="af-note">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span>لا يُطبَّق التعديل فوراً: يُسجَّل طلب يُنفَّذ بعد 14 يوماً، وتبقى البيانات الحالية سارية حتى ذلك الحين.</span>
        </p>
      ) : (
        <p className="af-note">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span>يُضاف الاختصاص الجديد فوراً.</span>
        </p>
      )}
      <div className="af-auth-row">
        <AuthField
          id={`${idPrefix}-name`}
          label="اسم الاختصاص"
          name="name"
          type="text"
          inputRef={setControl('name')}
          value={values.name}
          onChange={handleChange('name')}
          onBlur={handleBlur('name')}
          error={errors.name}
        />
        <AuthField
          id={`${idPrefix}-duration`}
          label="مدة الموعد بالدقائق"
          name="appointmentDuration"
          type="text"
          inputMode="numeric"
          dir="ltr"
          hint="عدد صحيح من 1 إلى 480"
          inputRef={setControl('appointmentDuration')}
          value={values.appointmentDuration}
          onChange={handleChange('appointmentDuration')}
          onBlur={handleBlur('appointmentDuration')}
          error={errors.appointmentDuration}
        />
      </div>
      <div className="af-admin-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting || unchanged}>
          {submitting ? 'جارٍ الإرسال…' : editing ? 'تسجيل طلب التعديل' : 'إضافة الاختصاص'}
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

function SpecialtyCard({ specialty, onRequested, onConflict }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'delete'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const editRef = useRef(null);
  const deleteRef = useRef(null);

  const { id, name, appointmentDuration, doctorsCount, pendingChange } = specialty;
  const hasDoctors = doctorsCount > 0;
  const locked = Boolean(pendingChange);

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
      const change = await requestSpecialtyDelete(id);
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
    <article className="af-card af-admin-card" aria-labelledby={`specialty-${id}-name`}>
      <div className="af-admin-head">
        <h3 id={`specialty-${id}-name`} className="af-admin-name">
          {name}
        </h3>
        <span className="af-badge">{formatMinutes(appointmentDuration)}</span>
      </div>
      <ul className="af-meta list-unstyled mb-0">
        <li>
          <i className="bi bi-person-badge" aria-hidden="true" />
          <span>{formatDoctorsCount(doctorsCount)}</span>
        </li>
      </ul>

      {pendingChange && <PendingBadge change={pendingChange} />}

      {mode === 'edit' && (
        <SpecialtyForm specialty={specialty} onDone={handleEdited} onCancel={() => setMode(null)} onConflict={onConflict} />
      )}
      {mode === 'delete' && (
        <ConfirmBar
          label={`تأكيد طلب حذف الاختصاص ${name}`}
          text="حذف الاختصاص طلب مؤجَّل: يُسجَّل الآن ويُنفَّذ بعد 14 يوماً، وعند التنفيذ يُحذف الاختصاص نهائياً. يُرفض الطلب إن كان في الاختصاص أي طبيب."
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
          <div className="af-admin-actions">
            <button type="button" ref={editRef} className="btn btn-outline-primary" disabled={locked} onClick={() => { setError(''); setMode('edit'); }}>
              <i className="bi bi-pencil" aria-hidden="true" /> تعديل
            </button>
            <button
              type="button"
              ref={deleteRef}
              className="btn btn-outline-danger"
              disabled={locked || hasDoctors}
              aria-describedby={locked || hasDoctors ? `specialty-${id}-hint` : undefined}
              onClick={() => { setError(''); setMode('delete'); }}
            >
              <i className="bi bi-trash" aria-hidden="true" /> حذف
            </button>
          </div>
          {(locked || hasDoctors) && (
            <p id={`specialty-${id}-hint`} className="af-admin-hint">
              {locked ? PENDING_EXISTS_HINT : 'لا يمكن حذف اختصاص يضم أطباء.'}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function SpecialtiesContent({ initial }) {
  const [specialties, setSpecialties] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(null);
  const noticeRef = useRef(null);
  const addRef = useRef(null);

  const announce = (next) => {
    setMessage(next);
    setTimeout(() => noticeRef.current?.focus(), 0);
  };

  // بعد تعارض مع حالة الخادم تُجلب القائمة من جديد؛ إن فشل الجلب تبقى الحالية
  const reload = async () => {
    try {
      setSpecialties(await fetchAdminSpecialties());
    } catch {
      /* تبقى القائمة الحالية */
    }
  };

  const handleCreated = (created) => {
    setSpecialties((current) => [...current, created]);
    setCreating(false);
    announce({ kind: 'success', text: `أُضيف الاختصاص «${created.name}» فوراً.` });
  };

  const handleRequested = (id, change) => {
    setSpecialties((current) => current.map((item) => (item.id === id ? { ...item, pendingChange: change } : item)));
    announce({ kind: 'info', text: deferredMessage(change) });
  };

  return (
    <>
      <AdminNotice message={message} noticeRef={noticeRef} />

      <section className="af-card af-admin-card" aria-labelledby="specialty-add-title">
        <div className="af-admin-head">
          <h2 id="specialty-add-title" className="af-admin-card-title">
            إضافة اختصاص
          </h2>
          {!creating && (
            <button type="button" ref={addRef} className="btn btn-primary" onClick={() => { setMessage(null); setCreating(true); }}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> اختصاص جديد
            </button>
          )}
        </div>
        {creating && (
          <SpecialtyForm
            onDone={handleCreated}
            onCancel={() => {
              setCreating(false);
              setTimeout(() => addRef.current?.focus(), 0);
            }}
            onConflict={reload}
          />
        )}
      </section>

      <section aria-labelledby="specialty-list-title">
        <h2 id="specialty-list-title" className="af-admin-section-title">
          الاختصاصات <span className="af-admin-count">({specialties.length})</span>
        </h2>
        {specialties.length === 0 ? (
          <EmptyState icon="bi-heart-pulse" title="لا توجد اختصاصات" text="أضف أول اختصاص من الأعلى." />
        ) : (
          <ul className="af-admin-stack list-unstyled mb-0">
            {specialties.map((specialty) => (
              <li key={specialty.id}>
                <SpecialtyCard specialty={specialty} onRequested={handleRequested} onConflict={reload} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function AdminSpecialtiesPage() {
  const { status, data, retry } = useAsyncData(fetchAdminSpecialties);

  if (status === 'loading') return <ListSkeleton label="جارٍ تحميل الاختصاصات…" />;
  if (status === 'error') return <ErrorState message="تعذّر تحميل الاختصاصات." onRetry={retry} />;
  return <SpecialtiesContent initial={data} />;
}
