// Convert decimal naira input without floating-point rounding of money.
export function nairaToKobo(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a price with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const kobo = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(kobo) || kobo <= 0 || kobo > 2147483647) throw new Error("Price must be between ₦0.01 and ₦21,474,836.47.");
  return kobo;
}
