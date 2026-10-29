// تأخير بسيط لمحاكاة زمن الاتصال حتى تظهر حالات التحميل. بيانات تجريبية مؤقتة فقط.
export const simulateLatency = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
