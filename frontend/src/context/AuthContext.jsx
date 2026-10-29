import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSession, loginRequest, logoutRequest } from '../api/auth';
import { setUnauthenticatedHandler } from '../api/http';

// حالة الدخول المشتركة. status: loading | authenticated | guest | error
// error = تعذّر التحقق من الجلسة بسبب الشبكة أو الخادم (ليس زائراً)؛ retry يعيد المحاولة.
// الجلسة في كوكي httpOnly فقط: لا يُخزَّن أي رمز في localStorage أو sessionStorage.
const AuthContext = createContext(null);

const GUEST = { status: 'guest', user: null };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();

  // استعادة الجلسة عند فتح التطبيق وعند إعادة المحاولة
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', user: null });
    fetchSession()
      .then((user) => {
        if (!cancelled) setState(user ? { status: 'authenticated', user } : GUEST);
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', user: null });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // انتهاء الجلسة أثناء الاستخدام (401 UNAUTHENTICATED من أي طلب) يعيد المستخدم زائراً
  useEffect(() => {
    setUnauthenticatedHandler(() =>
      setState((current) => (current.status === 'authenticated' ? GUEST : current)),
    );
    return () => setUnauthenticatedHandler(null);
  }, []);

  const login = useCallback(async (credentials) => {
    const user = await loginRequest(credentials);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  // تُمسح الحالة بعد تأكيد الخادم فقط؛ عند الفشل يُرمى الخطأ وتبقى الحالة كما هي.
  // التنقل إلى الرئيسية وتغيير الحالة في انتقال واحد حتى لا يعيد حارس المسار توجيه المستخدم إلى الدخول.
  const logout = useCallback(async () => {
    await logoutRequest();
    startTransition(() => {
      navigate('/', { replace: true });
      setState(GUEST);
    });
  }, [navigate]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // يحدّث الاسم المعروض (مثل شريط التنقل) بعد نجاح تعديل الملف الشخصي دون إعادة التحقق من الجلسة.
  // يقبل استجابة الملف الشخصي كاملة ويأخذ منها firstName وlastName فقط؛ بقية خصائص المستخدم (الدور، البريد، المعرّف) تبقى.
  const updateUser = useCallback((profile) => {
    const { firstName, lastName } = profile ?? {};
    if (typeof firstName !== 'string' || typeof lastName !== 'string') return;
    setState((current) =>
      current.status === 'authenticated' ? { ...current, user: { ...current.user, firstName, lastName } } : current,
    );
  }, []);

  const value = useMemo(
    () => ({ ...state, login, logout, retry, updateUser }),
    [state, login, logout, retry, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
