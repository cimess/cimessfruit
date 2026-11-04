import { ReturnError } from "../returns/validation";
export function refundPolicy(reason: string, responsibility: string, wholeOrder: boolean, override?: boolean, overrideReason?: string) {
  const businessFault = responsibility === "STORE" || responsibility === "RIDER";
  const requiresException = ["FAILED_DELIVERY", "WRONG_ADDRESS"].includes(reason) && !businessFault || responsibility === "UNDETERMINED";
  if (requiresException && !overrideReason) throw new ReturnError("Explain the reviewed exception before approving this case.");
  const delivery = businessFault && wholeOrder;
  if (override !== undefined && override !== delivery && !overrideReason) throw new ReturnError("Explain why delivery reimbursement differs from the policy.");
  return { refundDelivery: override ?? delivery };
}
