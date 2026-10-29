import { useEffect } from 'react';
import { CLINIC_NAME, CLINIC_SHORT_NAME } from '../utils/constants';

// بدون عنوان: اسم المجمع كاملاً (الرئيسية). مع عنوان: "العنوان | عافية"
export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${CLINIC_SHORT_NAME}` : CLINIC_NAME;
  }, [title]);
}
