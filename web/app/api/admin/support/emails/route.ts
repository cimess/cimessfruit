import { listSupportEmails } from "@/controllers/support-email";
export const GET = (request: Request) => listSupportEmails(request);
