import { Link } from 'react-router-dom';
// نسخة بايتية من الملف المرجعي، وتُستورد نصاً خاماً بخاصية ?raw المدمجة في Vite.
// لا تُكتب الآية في أي ملف كود، ولا يُطبَّق عليها أي تطبيع.
import verseText from '../../content/quran-verse-261.txt?raw';
import DonationMethodCard from '../../components/cards/DonationMethodCard';
import useDocumentTitle from '../../hooks/useDocumentTitle';

const VERSE_REFERENCE = 'سورة البقرة الآية 261';

// "كلمة + مسافة + علامة الوقف ۗ" تبقى متصلة في سطر واحد.
// split مع مجموعة التقاط يُبقي كل أجزاء النص، فاتصالها يعيد النص الأصلي حرفاً بحرف.
const PAUSE_MARK_GROUP = /(\S+ ۗ)/;

const DEMO_HOLDER = 'مجمع عافية الطبي الخيري — حساب تجريبي';

// بيانات تجريبية صريحة للعرض فقط، ولا تمثّل أي حساب حقيقي.
const DONATION_METHODS = [
  {
    id: 'bemo',
    icon: 'bi-bank',
    name: 'بنك بيمو السعودي الفرنسي',
    description: 'تحويل مصرفي — عرض توضيحي',
    holder: DEMO_HOLDER,
    identifierLabel: 'معرّف الحساب',
    identifier: 'DEMO-BEMO-001',
    iban: 'غير متوفر — بيانات تجريبية',
  },
  {
    id: 'cbs',
    icon: 'bi-bank',
    name: 'المصرف التجاري السوري',
    description: 'تحويل مصرفي — عرض توضيحي',
    holder: DEMO_HOLDER,
    identifierLabel: 'معرّف الحساب',
    identifier: 'DEMO-CBS-002',
    iban: 'غير متوفر — بيانات تجريبية',
  },
  {
    id: 'shamcash',
    icon: 'bi-wallet2',
    name: 'شام كاش',
    nameLatin: 'Sham Cash',
    description: 'محفظة إلكترونية — عرض توضيحي',
    holder: DEMO_HOLDER,
    identifierLabel: 'معرّف المحفظة',
    identifier: 'DEMO-SHAMCASH-003',
    qr: {
      src: '/images/donations/sham-cash-demo-qr.png',
      width: 1278,
      height: 1230,
      alt: 'رمز QR تجريبي لشام كاش، للعرض التوضيحي فقط ولا يمكن استخدامه للدفع',
      caption: 'رمز QR تجريبي — لا يمكن استخدامه للدفع',
    },
  },
];

// الآية ومرجعها: كتلة نصية مستقلة وليست عنواناً
function QuranVerse() {
  const parts = verseText.split(PAUSE_MARK_GROUP);

  return (
    <figure className="af-verse">
      <blockquote className="af-verse-text" lang="ar">
        {parts.map((part, index) =>
          index % 2 === 1 ? (
            <span key={index} className="af-nowrap">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </blockquote>
      <figcaption className="af-verse-ref">{VERSE_REFERENCE}</figcaption>
    </figure>
  );
}

// A9: التبرع. صفحة معلوماتية وتوضيحية فقط، ولا تعالج أي مدفوعات.
export default function DonationsPage() {
  useDocumentTitle('التبرع');

  return (
    <>
      <header className="af-page-header af-donate-header">
        <div className="container">
          <QuranVerse />
          <h1>ساهم في استمرار العطاء</h1>
          <p className="af-donate-intro">
            تبرعك يساهم في دعم الخدمات الطبية المجانية التي يقدمها مجمع عافية الطبي الخيري للمحتاجين.
            تعرّف على وسائل التبرع المتاحة.
          </p>
        </div>
      </header>

      <div className="container">
        <div className="af-demo-notice" role="note">
          <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
          <p>
            <strong>تنويه:</strong> جميع بيانات الحسابات ورمز QR المعروضة في هذه الصفحة تجريبية ومخصصة
            لأغراض مشروع التخرج الجامعي فقط. لا يمكن استخدامها لتحويل الأموال، ولا يستقبل الموقع أي
            مدفوعات إلكترونية.
          </p>
        </div>
      </div>

      <section className="af-donations-section" aria-labelledby="methods-title">
        <div className="container">
          <h2 id="methods-title" className="mb-4">
            طرق التبرع
          </h2>
          <div className="row g-4">
            {DONATION_METHODS.map((method) => (
              <div className="col-12 col-lg-4" key={method.id}>
                <DonationMethodCard method={method} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container pb-5" aria-label="التواصل بخصوص دعم المجمع">
        <div className="af-card af-donate-cta">
          <p>تواصل معنا لمعرفة طرق دعم المجمع</p>
          <Link to="/contact" className="btn btn-primary">
            <i className="bi bi-envelope" aria-hidden="true" />
            تواصل معنا
          </Link>
        </div>
      </section>
    </>
  );
}
