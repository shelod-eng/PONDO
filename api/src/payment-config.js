export const paymentMethods = [
  "card",
  "card_3ds",
  "debit_card",
  "eft",
  "payfast",
  "bnpl",
  "speedpoint",
  "ussd",
  "evoucher_wallet",
];

export const gateways = [
  "peach",
  "payfast",
  "ozow",
  "payflex",
  "speedpoint",
  "ussd",
  "wallet",
];

export const paymentMethodMeta = {
  card: { label: "Card", gateway: "peach", requiresCreditVet: false },
  card_3ds: { label: "3DS Card", gateway: "peach", requiresCreditVet: false },
  debit_card: { label: "Debit Card", gateway: "peach", requiresCreditVet: false },
  eft: { label: "Instant EFT", gateway: "ozow", requiresCreditVet: false },
  payfast: { label: "PayFast", gateway: "payfast", requiresCreditVet: false },
  bnpl: { label: "BNPL", gateway: "payflex", requiresCreditVet: true },
  speedpoint: { label: "Speedpoint SoftPOS", gateway: "speedpoint", requiresCreditVet: false },
  ussd: { label: "USSD", gateway: "ussd", requiresCreditVet: false },
  evoucher_wallet: { label: "eVoucher Wallet", gateway: "wallet", requiresCreditVet: false },
};

export function pickGatewayForPaymentMethod(paymentMethod, gateway) {
  if (gateway) return gateway;
  return paymentMethodMeta[paymentMethod]?.gateway || "peach";
}

export function paymentMethodRequiresCreditVet(paymentMethod) {
  return Boolean(paymentMethodMeta[paymentMethod]?.requiresCreditVet);
}
