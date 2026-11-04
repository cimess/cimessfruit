export type Choice = "BANK_REFUND" | "CREDIT" | "REPLACEMENT";
export type CreditChoice = {
  id: string;
  choice: Choice;
  refundDueAt: string;
  balance: number;
  reserved: number;
  locked: number;
  spent: number;
  refunded: number;
  bankDetails?: { bank: string; accountNumber: string; accountName: string } | null;
  transfers?: { id: string; key?: string; amount: number; state: string; reference?: string | null; createdAt: string; completedAt?: string | null }[];
};
export type DisputeView = { order?: { items: { id: string; name: string; optionLabel: string; unitPrice: number; quantity: number }[] }; id: string; status: string; reason: string; requestedChoice: Choice; approvedItems?: { orderItemId: string; quantity: number }[] | null; responsibility: string | null; decisionNote: string | null; items: { orderItemId: string; quantity: number }[]; credit: CreditChoice | null };
export type Conversation = { nextMessageCursor?: string | null; id: string; kind: "CHAT" | "DISPUTE"; subject: string; orderId: string | null; productId: string | null; dispute?: DisputeView | null; messages: { id: string; body: string; fromAdmin: boolean; createdAt: string; evidenceUrls?: string[] | null }[] };
export type OrderOption = { id: string; paymentStatus: string; items: { id: string; name: string; optionLabel: string; quantity: number }[] };
