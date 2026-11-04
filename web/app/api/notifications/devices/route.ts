import { registerDevice, unregisterDevice } from "@/server/notifications/handlers";
export function POST(request: Request) {
  return registerDevice(request);
}
export function DELETE(request: Request) {
  return unregisterDevice(request);
}
