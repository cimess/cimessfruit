// The spending window starts at approval. Unspent funds always become a bank refund at expiry.
export function choiceAt<T extends { choice: string; refundDueAt: Date | string }>(credit: T, now = new Date()): T {
  return new Date(credit.refundDueAt).getTime() <= now.getTime() ? { ...credit, choice: "BANK_REFUND" } : credit;
}
