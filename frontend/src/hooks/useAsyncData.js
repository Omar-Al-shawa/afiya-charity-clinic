import { useCallback, useEffect, useState } from 'react';

// يشغّل دالة غير متزامنة ويعيد حالتها: loading | success | error مع إمكانية إعادة المحاولة.
// يجب أن تكون الدالة ثابتة المرجع (معرَّفة خارج المكوّن) أو تُمرَّر deps مناسبة.
export default function useAsyncData(loader, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    loader()
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, retry };
}
