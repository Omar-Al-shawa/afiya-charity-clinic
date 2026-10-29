import { useId } from 'react';

// رمز الشعار: قلب بداخله علامة "+" طبية مفرَّغة (قناع mask) فتأخذ لون الخلفية في الوضعين.
// badge = نسخة الأيقونة المختصرة: قلب داخل مربع بزوايا مستديرة.
export function LogoMark({ size = 40, badge = false, className = '' }) {
  // معرّف فريد لكل نسخة من الشعار في الصفحة (بدون النقطتين لأنهما لا تصلحان داخل url(#...))
  const maskId = `af-plus-${useId().replace(/:/g, '')}`;

  const heart = (
    <path
      className="af-logo-heart"
      d="M16 2.628C24.876-6.496 47.068 9.47 16 30-15.068 9.472 7.124-6.496 16 2.628z"
      mask={`url(#${maskId})`}
    />
  );

  return (
    <svg
      className={`af-logo-mark ${badge ? 'af-logo-mark--badge' : ''} ${className}`}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask id={maskId}>
          <rect x="-4" y="-4" width="40" height="40" fill="#fff" />
          <path d="M16 9.8v8.4M11.8 14h8.4" stroke="#000" strokeWidth="3" strokeLinecap="round" />
        </mask>
      </defs>
      {badge ? (
        <>
          <rect className="af-logo-badge-bg" width="32" height="32" rx="7" />
          <g transform="translate(6.4 6.2) scale(.6)">{heart}</g>
        </>
      ) : (
        heart
      )}
    </svg>
  );
}

// variant: full = الرمز + "مجمع عافية الطبي الخيري" ، compact = الرمز + "عافية"
export default function Logo({ variant = 'full', className = '' }) {
  return (
    <span className={`af-logo ${className}`}>
      <LogoMark />
      {variant === 'full' ? (
        <span className="af-logo-text">
          مجمع <span className="af-logo-name">عافية</span> الطبي الخيري
        </span>
      ) : (
        <span className="af-logo-text af-logo-name">عافية</span>
      )}
    </span>
  );
}
