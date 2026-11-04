import { requestAccountDeletion } from "@/controllers/account-deletion";
export function POST(request: Request) {
  return requestAccountDeletion(request);
}
