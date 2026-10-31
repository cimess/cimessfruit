import ChatScreen from "@/features/chat/ChatScreen";
import { useAuthStore } from "@/features/auth/store";
export default function ChatPage() {
  const userId = useAuthStore(state => state.user?.id);
  return <ChatScreen key={userId ?? "guest"} />;
}
