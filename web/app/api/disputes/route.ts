import { createDisputeHandler } from "@/features/chat/handlers";
export function POST(request: Request) {
  return createDisputeHandler(request);
}
