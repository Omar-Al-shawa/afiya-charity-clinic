import nodemailer from 'nodemailer';

export const CONTACT_SUBJECT = 'رسالة جديدة من نموذج تواصل معنا';
const TIMEOUT_MS = 10000;

// رسالة نصية بسيطة فقط (بلا HTML). المُرسِل هو حساب SMTP المُعدّ دائماً، وبريد الزائر في Reply-To فقط،
// والاسم والبريد والرسالة في متن النص لا في أي رأس. موضوع البريد: العبارة الثابتة ثم موضوع الزائر (تحقق منه validation/contact.js: بلا محارف تحكم).
export function buildContactMail(smtp, { name, email, subject, message }) {
  return {
    from: smtp.from,
    to: smtp.recipient,
    replyTo: email,
    subject: `${CONTACT_SUBJECT}: ${subject}`,
    text: [
      'وصلت رسالة جديدة عبر نموذج «تواصل معنا» في موقع مجمع عافية الطبي الخيري.',
      '',
      `الاسم: ${name}`,
      `البريد الإلكتروني: ${email}`,
      `الموضوع: ${subject}`,
      '',
      'الرسالة:',
      message,
      '',
    ].join('\n'),
  };
}

// النقل الآمن إلزامي: TLS ضمني على المنفذ 465، وإلا STARTTLS إلزامي (لا رجوع إلى اتصال غير مشفّر)
function createSmtpTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port !== 465,
    auth: { user: smtp.user, pass: smtp.password },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
}

// يعيد null عند غياب إعداد SMTP (المسار يردّ 503). transport اختياري ليُحقن في الاختبارات.
export function createMailer(smtp, { transport } = {}) {
  if (!smtp) return null;
  const mailTransport = transport ?? createSmtpTransport(smtp);
  return {
    async sendContact(values) {
      await mailTransport.sendMail(buildContactMail(smtp, values));
    },
  };
}
