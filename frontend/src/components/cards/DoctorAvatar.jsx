import { useEffect, useState } from 'react';

// صورة الطبيب مع صورة بديلة عند غياب الرابط أو فشل التحميل
export default function DoctorAvatar({ src }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="af-avatar af-avatar--fallback" aria-hidden="true">
        <i className="bi bi-person" />
      </div>
    );
  }

  // alt فارغ: الصورة تزيينية، واسم الطبيب مكتوب بجانبها
  return <img className="af-avatar" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
