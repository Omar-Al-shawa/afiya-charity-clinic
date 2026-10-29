// معرّف صحيح موجب ضمن نطاق INTEGER في PostgreSQL، وإلا null
export function parsePositiveInt(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const number = Number(value);
  return number <= 2147483647 ? number : null;
}
