import { notificationPreferences } from "@/server/notifications/handlers";
export function GET(request: Request) {
  return notificationPreferences(request);
}
export function PATCH(request: Request) {
  return notificationPreferences(request);
}
