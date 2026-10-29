import { useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import SpecialtyCard, { SpecialtyCardSkeleton } from '../../components/cards/SpecialtyCard';
import useAsyncData from '../../hooks/useAsyncData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { fetchSpecialties } from '../../api/specialties';
import { compareArabic, normalizeArabic } from '../../utils/arabicText';
import { formatSpecialtiesCount } from '../../utils/format';

const SKELETON_COUNT = 8;
const GRID_COLUMNS = 'col-12 col-md-4 col-lg-3';

// A3: دليل التخصصات (عام: بلا تسجيل دخول).
// المصدر الوحيد للبيانات هو fetchSpecialties()، والترتيب والبحث يجريان في الواجهة دون تغيير الأسماء المعروضة.
export default function SpecialtiesPage() {
  useDocumentTitle('التخصصات');

  const { status, data, retry } = useAsyncData(fetchSpecialties);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  // ترتيب أبجدي عربي مع تجاهل "ال" التعريف في أول الاسم (للترتيب فقط)
  const sorted = useMemo(
    () => (data ? [...data].sort((a, b) => compareArabic(a.name, b.name)) : []),
    [data],
  );

  const normalizedQuery = normalizeArabic(query);
  const visible = useMemo(
    () =>
      normalizedQuery
        ? sorted.filter((specialty) => normalizeArabic(specialty.name).includes(normalizedQuery))
        : sorted,
    [sorted, normalizedQuery],
  );

  const clearSearch = () => {
    setQuery('');
    searchRef.current?.focus();
  };

  const hasData = status === 'success' && sorted.length > 0;

  return (
    <>
      <PageHeader
        title="التخصصات الطبية"
        subtitle="اختر التخصص للوصول إلى أطبائه ومواعيدهم."
        breadcrumb={[{ label: 'التخصصات' }]}
      />

      <section className="container af-directory" aria-labelledby="specialties-list-title">
        {/* H2 مخفي بصرياً حتى لا يقفز تسلسل العناوين من H1 إلى H3 (عناوين البطاقات) */}
        <h2 id="specialties-list-title" className="visually-hidden">
          قائمة التخصصات
        </h2>

        <div className="af-directory-toolbar">
          <form className="af-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="specialty-search" className="visually-hidden">
              ابحث عن تخصص
            </label>
            <i className="bi bi-search" aria-hidden="true" />
            <input
              id="specialty-search"
              ref={searchRef}
              type="search"
              className="af-search-input"
              placeholder="ابحث عن تخصص"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={!hasData}
            />
          </form>
          {/* عدد النتائج: يُعلَن لقارئ الشاشة أثناء الكتابة */}
          <p className="af-result-count" aria-live="polite">
            {hasData ? formatSpecialtiesCount(visible.length) : ''}
          </p>
        </div>

        {status === 'loading' && (
          <div className="row g-3" role="status" aria-busy="true">
            <span className="visually-hidden">جارٍ تحميل التخصصات…</span>
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <div className={GRID_COLUMNS} key={index}>
                <SpecialtyCardSkeleton />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && <ErrorState message="تعذّر تحميل التخصصات." onRetry={retry} />}

        {status === 'success' && sorted.length === 0 && (
          <EmptyState icon="bi-inbox" title="لا توجد تخصصات متاحة حالياً" />
        )}

        {hasData && visible.length === 0 && (
          <EmptyState icon="bi-search" title="لا يوجد تخصص بهذا الاسم">
            <button type="button" className="btn btn-outline-primary" onClick={clearSearch}>
              مسح البحث
            </button>
          </EmptyState>
        )}

        {visible.length > 0 && (
          <div className="row g-3">
            {visible.map((specialty) => (
              <div className={GRID_COLUMNS} key={specialty.id}>
                <SpecialtyCard specialty={specialty} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
