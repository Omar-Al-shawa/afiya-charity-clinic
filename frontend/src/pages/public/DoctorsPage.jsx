import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import DoctorCard, { DoctorCardSkeleton } from '../../components/cards/DoctorCard';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { fetchDoctors } from '../../api/doctors';
import { fetchSpecialties } from '../../api/specialties';
import { compareArabic, normalizeArabic } from '../../utils/arabicText';
import { formatDoctorsCount } from '../../utils/format';
import { parsePositiveIntParam } from '../../utils/queryParams';

const SKELETON_COUNT = 8;
const GRID_COLUMNS = 'col-12 col-sm-6 col-md-4 col-lg-3';
const SPECIALTY_PARAM = 'specialty';

// الأطباء والتخصصات يُحمَّلان معاً، وتعيد "إعادة المحاولة" استدعاء الدالتين معاً.
// دالة ثابتة المرجع (معرَّفة خارج المكوّن) كما يتطلب useAsyncData.
const loadDirectory = () =>
  Promise.all([fetchDoctors(), fetchSpecialties()]).then(([doctors, specialties]) => ({
    doctors,
    specialties,
  }));

// "د. " في بداية الاسم المعروض لقب وليست جزءاً من الاسم، فلا تدخل في البحث ولا في الترتيب
const stripTitle = (fullName) => fullName.replace(/^د\.\s*/, '');

// يحوّل ما يكتبه المستخدم إلى نص بحث عن الاسم:
// "د. بتول" و"د.بتول" و"د بتول" ← "بتول". أما "د" أو "د." وحدها فتُبحث كحرف "د" داخل الأسماء،
// فلا تطابق كل الأطباء لمجرد أن اللقب المعروض يبدأ بـ "د.".
function toNameQuery(rawQuery) {
  return normalizeArabic(rawQuery)
    .replace(/^د\.\s*(?=\S)/, '')
    .replace(/^د\s+(?=\S)/, '')
    .replace(/^د\.$/, 'د');
}

// A4: دليل الأطباء (عام: بلا تسجيل دخول).
// التخصص المحدد مصدره معامل الرابط ?specialty=ID، والبحث بالاسم حالة محلية (كما في A3).
// الأطباء والتخصصات من fetchDoctors() وfetchSpecialties()، والتصفية والترتيب في الواجهة.
export default function DoctorsPage() {
  useDocumentTitle('الأطباء');

  const { status, data, retry } = useAsyncData(loadDirectory);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [invalidNotice, setInvalidNotice] = useState(false);
  const searchRef = useRef(null);
  const selectRef = useRef(null);

  // التخصصات بترتيب A3 (أبجدي عربي مع تجاهل "ال")
  const specialties = useMemo(
    () => (data ? [...data.specialties].sort((a, b) => compareArabic(a.name, b.name)) : []),
    [data],
  );

  // الأطباء: حسب ترتيب التخصص (كما في A3) ثم أبجدياً باسم الطبيب
  const doctors = useMemo(() => {
    if (!data) return [];
    const rank = new Map(specialties.map((specialty, index) => [specialty.id, index]));
    const rankOf = (doctor) => rank.get(doctor.specialtyId) ?? specialties.length;
    return [...data.doctors].sort(
      (a, b) =>
        rankOf(a) - rankOf(b) || compareArabic(stripTitle(a.fullName), stripTitle(b.fullName)),
    );
  }, [data, specialties]);

  // ---- التخصص المحدد: معامل الرابط هو المصدر الوحيد ----
  const rawSpecialty = searchParams.get(SPECIALTY_PARAM); // أول قيمة إن تكرر المعامل
  const parsedId = parsePositiveIntParam(rawSpecialty);
  const selected =
    status === 'success' && parsedId !== null
      ? specialties.find((specialty) => specialty.id === parsedId) ?? null
      : null;
  const hasInvalidParam = status === 'success' && rawSpecialty !== null && selected === null;

  // معامل غير صالح أو فارغ أو لتخصص غير موجود: يُنظَّف الرابط بـ replace (دون خطوة جديدة في السجل)،
  // ويظهر تنبيه إلا إذا كان المعامل فارغاً. تبقى المعاملات الأخرى كما هي.
  useEffect(() => {
    if (!hasInvalidParam) return;
    if (rawSpecialty !== '') setInvalidNotice(true);
    const next = new URLSearchParams(searchParams);
    next.delete(SPECIALTY_PARAM);
    setSearchParams(next, { replace: true });
  }, [hasInvalidParam, rawSpecialty, searchParams, setSearchParams]);

  const changeSpecialty = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(SPECIALTY_PARAM, value);
    else next.delete(SPECIALTY_PARAM);
    setSearchParams(next); // خطوة جديدة في السجل: يعمل الرجوع والأمام
    setInvalidNotice(false);
  };

  const showAllDoctors = () => {
    changeSpecialty('');
    selectRef.current?.focus();
  };

  const clearSearch = () => {
    setQuery('');
    searchRef.current?.focus();
  };

  // ---- التصفية: تخصص AND اسم ----
  const nameQuery = toNameQuery(query);
  const visible = useMemo(() => {
    const bySpecialty = selected ? doctors.filter((d) => d.specialtyId === selected.id) : doctors;
    return nameQuery
      ? bySpecialty.filter((d) => normalizeArabic(stripTitle(d.fullName)).includes(nameQuery))
      : bySpecialty;
  }, [doctors, selected, nameQuery]);

  const hasData = status === 'success' && doctors.length > 0;

  return (
    <>
      <PageHeader
        title="أطباؤنا"
        subtitle="تعرّف على أطباء المجمع وتخصصاتهم."
        breadcrumb={[{ label: 'الأطباء' }]}
      />

      <section className="container af-directory" aria-labelledby="doctors-list-title">
        {/* H2 مخفي بصرياً حتى لا يقفز تسلسل العناوين من H1 إلى H3 (عناوين البطاقات) */}
        <h2 id="doctors-list-title" className="visually-hidden">
          قائمة الأطباء
        </h2>

        <div className="af-directory-toolbar">
          <form className="af-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="doctor-search" className="visually-hidden">
              ابحث عن طبيب بالاسم
            </label>
            <i className="bi bi-search" aria-hidden="true" />
            <input
              id="doctor-search"
              ref={searchRef}
              type="search"
              className="af-search-input"
              placeholder="ابحث عن طبيب بالاسم"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={!hasData}
            />
          </form>

          <div className="af-select">
            <label htmlFor="doctor-specialty" className="visually-hidden">
              التصفية حسب التخصص
            </label>
            <select
              id="doctor-specialty"
              ref={selectRef}
              className="af-select-input"
              value={selected ? String(selected.id) : ''}
              onChange={(event) => changeSpecialty(event.target.value)}
              disabled={!hasData}
            >
              <option value="">كل التخصصات</option>
              {specialties.map((specialty) => (
                <option key={specialty.id} value={String(specialty.id)}>
                  {specialty.name}
                </option>
              ))}
            </select>
            <i className="bi bi-chevron-down" aria-hidden="true" />
          </div>

          <div className="af-toolbar-end">
            {/* عدد النتائج: يُعلَن لقارئ الشاشة أثناء الكتابة والتصفية */}
            <p className="af-result-count" aria-live="polite">
              {hasData ? formatDoctorsCount(visible.length) : ''}
            </p>
            {selected && (
              <button type="button" className="btn btn-link" onClick={showAllDoctors}>
                عرض كل الأطباء
              </button>
            )}
          </div>
        </div>

        {invalidNotice && (
          <div className="af-inline-note mb-3" role="status">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <span>التخصص المطلوب غير موجود، نعرض كل الأطباء.</span>
          </div>
        )}

        {status === 'loading' && (
          <div className="row g-3" role="status" aria-busy="true">
            <span className="visually-hidden">جارٍ تحميل الأطباء…</span>
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <div className={GRID_COLUMNS} key={index}>
                <DoctorCardSkeleton />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && <ErrorState message="تعذّر تحميل الأطباء." onRetry={retry} />}

        {status === 'success' && doctors.length === 0 && (
          <EmptyState icon="bi-inbox" title="لا يوجد أطباء متاحون حالياً" />
        )}

        {hasData && visible.length === 0 && nameQuery && (
          <EmptyState
            icon="bi-search"
            title={selected ? 'لا يوجد طبيب بهذا الاسم في هذا التخصص' : 'لا يوجد طبيب بهذا الاسم'}
          >
            <button type="button" className="btn btn-outline-primary" onClick={clearSearch}>
              مسح البحث
            </button>
          </EmptyState>
        )}

        {hasData && visible.length === 0 && !nameQuery && (
          <EmptyState icon="bi-person-x" title="لا يوجد أطباء في هذا التخصص حالياً">
            <button type="button" className="btn btn-outline-primary" onClick={showAllDoctors}>
              عرض كل الأطباء
            </button>
          </EmptyState>
        )}

        {visible.length > 0 && (
          <div className="row g-3">
            {visible.map((doctor) => (
              <div className={GRID_COLUMNS} key={doctor.id}>
                <DoctorCard doctor={doctor} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
