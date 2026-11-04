import { completeAccountDeletion } from "@/controllers/account-deletion";
export function POST(request: Request) {
  return completeAccountDeletion(request);
}
