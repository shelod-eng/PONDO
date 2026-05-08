export type SouthAfricanIdGender = "male" | "female";

export type SouthAfricanIdDetails = {
  idNumber: string;
  birthDate: string;
  age: number;
  gender: SouthAfricanIdGender;
  genderSequence: number;
};

export type SouthAfricanIdRisk = SouthAfricanIdDetails & {
  ageScore: number;
  genderScore: number;
  totalScore: number;
  rejected: boolean;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function calculateAge(date: Date, today: Date) {
  let age = today.getFullYear() - date.getFullYear();
  const hasHadBirthday =
    today.getMonth() > date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() >= date.getDate());
  if (!hasHadBirthday) age -= 1;
  return age;
}

function inferFullYear(twoDigitYear: number, today: Date) {
  const currentYear = today.getFullYear();
  const currentTwoDigitYear = currentYear % 100;
  return twoDigitYear <= currentTwoDigitYear ? 2000 + twoDigitYear : 1900 + twoDigitYear;
}

function resolveBirthDate(idNumber: string, today: Date) {
  const yy = Number(idNumber.slice(0, 2));
  const mm = Number(idNumber.slice(2, 4));
  const dd = Number(idNumber.slice(4, 6));
  const fullYear = inferFullYear(yy, today);
  const candidate = new Date(Date.UTC(fullYear, mm - 1, dd));

  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getUTCFullYear() !== fullYear ||
    candidate.getUTCMonth() !== mm - 1 ||
    candidate.getUTCDate() !== dd
  ) {
    return null;
  }

  return {
    date: candidate,
    birthDate: `${fullYear}-${pad(mm)}-${pad(dd)}`,
  };
}

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

export function parseSouthAfricanId(idNumber: string, today = new Date()): SouthAfricanIdDetails | null {
  const normalized = String(idNumber || "").replace(/\D/g, "");
  if (!validateSAID(normalized)) return null;

  const birth = resolveBirthDate(normalized, today);
  if (!birth) return null;

  const genderSequence = Number(normalized.slice(6, 10));
  const gender: SouthAfricanIdGender = genderSequence >= 5000 ? "male" : "female";
  const age = calculateAge(new Date(`${birth.birthDate}T00:00:00`), today);

  if (age < 0) return null;

  return {
    idNumber: normalized,
    birthDate: birth.birthDate,
    age,
    gender,
    genderSequence,
  };
}

export function deriveSouthAfricanIdRisk(idNumber: string, today = new Date()): SouthAfricanIdRisk | null {
  const parsed = parseSouthAfricanId(idNumber, today);
  if (!parsed) return null;

  const ageScore =
    parsed.age < 18 ? 999 :
    parsed.age <= 25 ? 80 :
    parsed.age <= 40 ? 50 :
    parsed.age <= 60 ? 20 :
    10;
  const genderScore = parsed.gender === "male" ? 10 : 0;
  const rejected = parsed.age < 18;

  return {
    ...parsed,
    ageScore,
    genderScore,
    totalScore: rejected ? ageScore : ageScore + genderScore,
    rejected,
  };
}
