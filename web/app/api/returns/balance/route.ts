import { getReturnBalance } from "@/features/returns/handlers";
export function GET() {
  return getReturnBalance();
}
