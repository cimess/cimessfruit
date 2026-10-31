export function formatNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}
