import { notificationWorker } from "@/server/notifications/handlers";
export const maxDuration = 60;
export function POST(request: Request) {
  return notificationWorker(request);
}
