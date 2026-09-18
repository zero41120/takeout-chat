export const DISPLAY_CURRENCIES = ["USD", "TWD"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export const TWD_PER_USD = 32;

export function normalizeCurrency(currency: string) {
  const code = currency.trim().toUpperCase();
  if (code === "NTD" || code === "NT$") return "TWD";
  if (code === "US$") return "USD";
  return code;
}

export function convertAmount(amount: number, source: string, target: DisplayCurrency): number | null {
  const code = normalizeCurrency(source);
  if (code !== "USD" && code !== "TWD") return null;
  if (code === target) return amount;
  return target === "TWD" ? amount * TWD_PER_USD : amount / TWD_PER_USD;
}

export function formatAmount(currency: string, amount: number, locale: string) {
  return `${currency || "—"} ${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
