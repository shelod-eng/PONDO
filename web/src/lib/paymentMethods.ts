export const PAYMENT_METHODS = [
  "card",
  "card_3ds",
  "debit_card",
  "eft",
  "payfast",
  "bnpl",
  "speedpoint",
  "ussd",
  "evoucher_wallet",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_OPTIONS: Array<{
  id: PaymentMethod;
  label: string;
  helper: string;
}> = [
  { id: "card", label: "Card", helper: "Standard card authorization through Peach Payments." },
  { id: "card_3ds", label: "3DS Card", helper: "Card flow with 3D Secure challenge support." },
  { id: "debit_card", label: "Debit Card", helper: "Debit card authorization with immediate capture." },
  { id: "eft", label: "Instant EFT", helper: "Bank transfer checkout using Ozow-style instant EFT." },
  { id: "payfast", label: "PayFast", helper: "Redirect-style online payment through PayFast." },
  { id: "bnpl", label: "BNPL", helper: "Payflex-style buy now, pay later with affordability checks." },
  { id: "speedpoint", label: "Speedpoint SoftPOS", helper: "Tap or insert card on PED / SoftPOS." },
  { id: "ussd", label: "USSD", helper: "Feature-phone friendly payment confirmation over USSD." },
  { id: "evoucher_wallet", label: "eVoucher Wallet", helper: "Pay directly from the customer wallet balance." },
];

export function paymentMethodLabel(method: PaymentMethod) {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.id === method)?.label || method;
}
