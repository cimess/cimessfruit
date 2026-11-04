import { requestRecovery } from "@/controllers/recovery-handlers";
export function POST(request: Request) {
  return requestRecovery(request);
}
