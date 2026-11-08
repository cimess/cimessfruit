import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore } from "@/features/auth/store";

const displayFont = Platform.select({
  ios: "AvenirNext-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const googleLogin = useAuthStore((state) => state.googleLogin);
  const login = useAuthStore((state) => state.login);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const emailOrPhoneError =
    hasSubmitted && emailOrPhone.trim().length <= 2
      ? "Enter your email or phone number."
      : "";
  const passwordError =
    hasSubmitted && password.trim().length < 6
      ? "Password must be at least 6 characters."
      : "";
  const canSubmit =
    emailOrPhone.trim().length > 2 && password.trim().length >= 6;

  const handleLogin = async () => {
    setHasSubmitted(true);

    if (!canSubmit || isSubmitting) {
      return;
    }

    try {
      await login({
        emailOrPhone: emailOrPhone.trim(),
        password,
      });
      router.replace("/");
    } catch (error) {
      Alert.alert("Login failed", error instanceof Error ? error.message : "Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-[#FAFBF7]"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable onPress={() => router.push("/recover")} className="flex-row items-center justify-center"><Text className="p-4 font-bold">Forgot Password? </Text><Ionicons name="arrow-up-right-box-outline" size={18} color="black" /></Pressable>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View
          className="rounded-b-[34px] bg-[#128A3A] px-5 pb-8"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Pressable
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>

          <Text
            className="mt-8 text-[40px] font-extrabold leading-[44px] text-white"
            style={{ fontFamily: displayFont }}
          >
            Welcome back
          </Text>
          <Text className="mt-3 max-w-[320px] text-[15px] font-semibold leading-6 text-white/65">
            Log in to use your saved address, track orders, and checkout faster.
          </Text>
        </View>

        <View className="flex-1 px-[18px] pt-6">
          <View className="rounded-[28px] bg-white p-4">
            <AuthField
              autoCapitalize="none"
              keyboardType="email-address"
              label="Email or phone"
              onChangeText={setEmailOrPhone}
              placeholder="you@email.com or 080..."
              value={emailOrPhone}
              error={emailOrPhoneError}
            />

            <View className="mt-4">
              <AuthField
                label="Password"
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secureTextEntry={!showPassword}
                value={password}
                error={passwordError}
                rightAction={
                  <Pressable
                    onPress={() => setShowPassword((current) => !current)}
                    className="h-10 w-10 items-center justify-center"
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#6B7280"
                    />
                  </Pressable>
                }
              />
            </View>

          </View>

          <Pressable
            disabled={isSubmitting}
            onPress={handleLogin}
            className={`mt-5 flex-row items-center justify-center rounded-[24px] px-5 py-4 ${
              canSubmit && !isSubmitting ? "bg-[#128A3A]" : "bg-[#128A3A]/30"
            }`}
          >
            <Text className="mr-2 text-base font-extrabold text-white">
              {isSubmitting ? "Logging in..." : "Log in"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#FACC15" />
          </Pressable>

          {Platform.OS !== "ios" && (
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={async () => {
              try { await googleLogin(); router.replace("/"); }
              catch (error) {router.replace("/login"); Alert.alert("Google sign-in", error instanceof Error ? error.message : "Unable to sign in."); }
            }}
            className="mt-4 flex-row items-center justify-center rounded-[24px] border border-gray-200 bg-white px-5 py-4"
          >
            <Ionicons name="logo-google" size={20} color="#128A3A" />
            <Text className="ml-3 text-base font-extrabold text-[#033035]">Continue with Google</Text>
          </Pressable>
          )}

          <Pressable
            onPress={() => router.push("/signup")}
            className="mt-5 items-center"
          >
            <Text className="text-sm font-bold text-gray-500">
              New to CimessFruit?{" "}
              <Text className="font-extrabold text-[#033035]">
                Create account
              </Text>
            </Text>
          </Pressable>
        </View>
      <Pressable onPress={() => router.push("/recover")}><Text className="p-4 font-bold text-green-700">Reactivate a disabled account</Text></Pressable></ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthField({
  autoCapitalize,
  keyboardType,
  label,
  onChangeText,
  placeholder,
  rightAction,
  secureTextEntry,
  value,
  error,
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "phone-pad";
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  rightAction?: React.ReactNode;
  secureTextEntry?: boolean;
  value: string;
  error?: string;
}) {
  return (
    <View>
      <Text className="mb-2 text-xs font-extrabold uppercase text-gray-400">
        {label}
      </Text>
      <View className="h-[54px] flex-row items-center rounded-[22px] bg-[#FAFBF7] px-4">
        <TextInput
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          secureTextEntry={secureTextEntry}
          value={value}
          className="flex-1 text-[15px] font-semibold text-gray-950"
        />
        {rightAction}
      </View>
      {!!error && (
        <Text className="mt-1.5 text-xs font-bold text-red-600">{error}</Text>
      )}
    </View>
  );
}
