import { Suspense } from "react";
import { getCurrentUser } from "@/server/auth/current-user";
import StoreShell from "../store/store-shell";
import ChatClient from "@/features/chat/ChatClient";
async function Chat() { const user = await getCurrentUser(); return user ? <ChatClient key={user.id} owner={user.id} /> : <p>Please sign in to chat.</p>; }
export default function ChatPage() { return <StoreShell><Suspense fallback={<p>Loading chat…</p>}><Chat /></Suspense></StoreShell>; }
