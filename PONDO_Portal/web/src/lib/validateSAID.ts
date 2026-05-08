export function validateSAID(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;

  const digits = id.split("").map(Number);

  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) {
    oddSum += digits[i];
  }

  let evenDigits = "";
  for (let i = 1; i < 12; i += 2) {
    evenDigits += digits[i];
  }

  const evenNumber = Number.parseInt(evenDigits, 10) * 2;
  const evenSum = evenNumber
    .toString()
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);

  const total = oddSum + evenSum;
  const checkDigit = (10 - (total % 10)) % 10;

  return checkDigit === digits[12];
}
