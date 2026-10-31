export type Choice = "BANK_REFUND" | "CREDIT" | "REPLACEMENT";
export type CreditChoice = { id: string; choice: Choice; refundDueAt: string; balance: number; reserved: number; locked: number; spent: number; refunded: number };
export type Conversation = { nextMessageCursor?: string | null; id: string; kind: "CHAT" | "DISPUTE"; subject: string; orderId?: string | null; dispute?: { id: string; status: string; reason: string; decisionNote?: string | null; credit?: CreditChoice | null } | null; messages: { id: string; body: string; fromAdmin: boolean; createdAt: string; evidenceUrls?: string[] | null }[] };
export type OrderOption = { id: string; paymentStatus: string; items: { id: string; name: string; optionLabel: string; quantity: number }[] };
