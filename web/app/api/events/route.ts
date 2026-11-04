import { connection } from "next/server";
import { streamEvents } from "@/features/realtime/stream";
export const maxDuration = 300;
export async function GET(request: Request) { await connection(); return streamEvents(request); }
