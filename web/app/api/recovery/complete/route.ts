import { completeRecovery } from "@/controllers/recovery-handlers";
export function POST(request: Request) {
  return completeRecovery(request);
}
