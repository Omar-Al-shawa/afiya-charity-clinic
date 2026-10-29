export class AppError extends Error {
  // options.fields: رسائل أخطاء الحقول (للتحقق)؛ options.cause: الخطأ الأصلي
  constructor(status, code, message, options) {
    super(message, options);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = options?.fields;
  }
}
