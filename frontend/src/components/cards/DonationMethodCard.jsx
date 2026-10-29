import { useEffect, useRef, useState } from 'react';

const COPIED_MS = 2000;
const FAILED_MS = 5000;

// بطاقة وسيلة تبرع: بيانات تجريبية للعرض فقط، ولا يوجد أي دفع أو اتصال بجهة خارجية.
export default function DonationMethodCard({ method }) {
  const { icon, name, nameLatin, description, holder, identifierLabel, identifier, iban, qr } = method;
  const [copyState, setCopyState] = useState('idle'); // idle | copied | failed
  const timerRef = useRef(null);
  const fullName = nameLatin ? `${name} (${nameLatin})` : name;

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = async () => {
    clearTimeout(timerRef.current);
    try {
      // في سياق غير آمن يكون navigator.clipboard غير معرّف، فيقع الخطأ داخل try ويظهر نص الفشل
      await navigator.clipboard.writeText(identifier);
      setCopyState('copied');
      timerRef.current = setTimeout(() => setCopyState('idle'), COPIED_MS);
    } catch {
      setCopyState('failed');
      timerRef.current = setTimeout(() => setCopyState('idle'), FAILED_MS);
    }
  };

  return (
    <article className="af-card af-donation-card h-100">
      <div className="af-donation-head">
        <span className="af-donation-icon" aria-hidden="true">
          <i className={`bi ${icon}`} />
        </span>
        <div>
          <h3 className="h5 mb-1">
            {name}
            {nameLatin && (
              <>
                {' '}
                (<bdi>{nameLatin}</bdi>)
              </>
            )}
          </h3>
          <span className="af-badge af-badge--demo">حساب تجريبي</span>
        </div>
      </div>

      <p className="af-donation-desc">{description}</p>

      <dl className="af-fields">
        <div className="af-field">
          <dt>صاحب الحساب</dt>
          <dd>{holder}</dd>
        </div>

        <div className="af-field">
          <dt>{identifierLabel}</dt>
          <dd>
            <div className="af-identifier-row">
              <bdi dir="ltr" className="af-identifier">
                {identifier}
              </bdi>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm af-copy-btn"
                onClick={handleCopy}
                aria-label={copyState === 'copied' ? undefined : `نسخ المعرّف التجريبي لـ ${fullName}`}
              >
                {copyState === 'copied' ? (
                  <>
                    <i className="bi bi-check2" aria-hidden="true" />
                    تم النسخ
                  </>
                ) : (
                  <>
                    <i className="bi bi-clipboard" aria-hidden="true" />
                    نسخ
                  </>
                )}
              </button>
            </div>
            {/* منطقة إعلان نتيجة النسخ لقارئ الشاشة، ويظهر نص الفشل للجميع */}
            <div className="af-copy-status" role="status">
              {copyState === 'copied' && <span className="visually-hidden">تم نسخ المعرّف التجريبي</span>}
              {copyState === 'failed' && (
                <span className="af-copy-error">تعذّر النسخ. يمكنك تحديد النص ونسخه يدوياً.</span>
              )}
            </div>
          </dd>
        </div>

        {iban && (
          <div className="af-field">
            <dt>IBAN</dt>
            <dd>{iban}</dd>
          </div>
        )}
      </dl>

      {qr && (
        <figure className="af-qr">
          <div className="af-qr-frame">
            <img src={qr.src} width={qr.width} height={qr.height} alt={qr.alt} loading="lazy" decoding="async" />
          </div>
          <figcaption>{qr.caption}</figcaption>
        </figure>
      )}
    </article>
  );
}
