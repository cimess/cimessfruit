import { Link } from "expo-router";
import { Text, View } from "react-native";
// openAuthSessionAsync consumes the code in memory and validates its state.
export default function AuthCallback() {
  return <View className="flex-1 items-center justify-center bg-white">
    <Text>Returning to sign-in…</Text>
    <Link href="/login" className="mt-5 text-green-700">Return to sign-in</Link>
  </View>;
}
