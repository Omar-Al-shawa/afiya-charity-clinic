// يحوّل قيمة معامل رابط إلى عدد صحيح موجب بصرامة، أو يعيد null إن لم تكن كذلك.
// يُقبل فقط: أرقام لاتينية 0-9، بلا أصفار بادئة ولا إشارة ولا فاصلة عشرية ولا مسافات.
// أمثلة: "15" ← 15 ، أما "003" و"0" و"-1" و"3.5" و"1e1" و" 15 " و"abc" و"" و null فتعيد null.
export function parsePositiveIntParam(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
