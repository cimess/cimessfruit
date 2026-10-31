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
import { useDeliveryZones } from "@/features/delivery/zones";
import ZonePicker from "@/features/delivery/ZonePicker";

const displayFont = Platform.select({
  ios: "AvenirNext-Heavy",
  android: "sans-serif-condensed",
  default: "system-ui",
});

export default function Signup() {
  const router = useRouter();
  const zoneState = useDeliveryZones();
  const [zoneId, setZoneId] = useState("");
  const insets = useSafeAreaInsets();
  const signup = useAuthStore((state) => state.signup);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [streetOrClose, setStreetOrClose] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [flatOrBlock, setFlatOrBlock] = useState("");
  const [landmark, setLandmark] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const canSubmit =
    name.trim().length >= 2 &&
    email.trim().includes("@") &&
    phoneNumber.trim().length >= 8 &&
    password.length >= 12;

  const hasAddress =
    streetOrClose.trim().length > 0 ||
    houseNumber.trim().length > 0 ||
    flatOrBlock.trim().length > 0 ||
    landmark.trim().length > 0;
  const nameError =
    hasSubmitted && name.trim().length < 2
      ? "Enter your full name."
      : "";
  const emailError =
    hasSubmitted && !email.trim().includes("@")
      ? "Enter a valid email address."
      : "";
  const phoneError =
    hasSubmitted && phoneNumber.trim().length < 8
      ? "Enter a valid phone number."
      : "";
  const passwordError =
    hasSubmitted && password.length < 12
      ? "Password must be at least 12 characters."
      : "";

  const handleSignup = async () => {
    setHasSubmitted(true);

    if (!canSubmit || isSubmitting) {
      return;
    }

    if (hasAddress && !zoneState.zones.some(zone => zone.id === zoneId)) { Alert.alert("Delivery zone", "Choose an active delivery zone for your address."); return; }
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        password,
        deliveryAddress: hasAddress
          ? {
              zoneId,
              streetOrClose: streetOrClose.trim(),
              houseNumber: houseNumber.trim(),
              flatOrBlock: flatOrBlock.trim(),
              landmark: landmark.trim(),
              note: "",
              phoneNumber: phoneNumber.trim(),
            }
          : undefined,
      });
      router.replace("/");
    } catch (error) {
      Alert.alert(
        "Signup failed",
        error instanceof Error ? error.message : "We could not create your account. Please try again."
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-[#FAFBF7]"
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
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
            Create account
          </Text>
          <Text className="mt-3 max-w-[320px] text-[15px] font-semibold leading-6 text-white/65">
            Save your details once, then checkout faster whenever you order.
          </Text>
        </View>

        <View className="px-[18px] pt-6">
          <View className="rounded-[28px] bg-white p-4">
            <SectionTitle title="Required details" />
            <View className="mt-4 gap-4">
              <AuthField
                label="Full name"
                onChangeText={setName}
                placeholder="Your name"
                value={name}
                error={nameError}
              />
              <AuthField
                autoCapitalize="none"
                keyboardType="email-address"
                label="Email"
                onChangeText={setEmail}
                placeholder="you@email.com"
                value={email}
                error={emailError}
              />
              <AuthField
                keyboardType="phone-pad"
                label="Phone number"
                onChangeText={setPhoneNumber}
                placeholder="080..."
                value={phoneNumber}
                error={phoneError}
              />
              <AuthField
                label="Password"
                onChangeText={setPassword}
                placeholder="At least 12 characters"
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

          <View className="mt-5 rounded-[28px] bg-white p-4">
            <SectionTitle
              title="Delivery address"
              subtitle="Optional now. You can add or change it during checkout."
            />
            <View className="mt-4 gap-4">
              <ZonePicker {...zoneState} value={zoneId} onChange={setZoneId} />
              <AuthField
                label="Street / Close"
                onChangeText={setStreetOrClose}
                placeholder="e.g. 32 Road"
                value={streetOrClose}
              />
              <AuthField
                label="House number"
                onChangeText={setHouseNumber}
                placeholder="e.g. House 15"
                value={houseNumber}
              />
              <AuthField
                label="Flat / Block"
                onChangeText={setFlatOrBlock}
                placeholder="e.g. Block B, Flat 2"
                value={flatOrBlock}
              />
              <AuthField
                label="Landmark"
                onChangeText={setLandmark}
                placeholder="e.g. Near the mini market"
                value={landmark}
              />
            </View>
          </View>

          <Pressable
            disabled={isSubmitting}
            onPress={handleSignup}
            className={`mt-5 flex-row items-center justify-center rounded-[24px] px-5 py-4 ${
              canSubmit && !isSubmitting ? "bg-[#128A3A]" : "bg-[#128A3A]/30"
            }`}
          >
            <Text className="mr-2 text-base font-extrabold text-white">
              {isSubmitting ? "Creating account..." : "Create account"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#FACC15" />
          </Pressable>

          <Pressable
            onPress={() => router.push("/login")}
            className="mt-5 items-center"
          >
            <Text className="text-sm font-bold text-gray-500">
              Already have an account?{" "}
              <Text className="font-extrabold text-[#033035]">Log in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionTitle({
  subtitle,
  title,
}: {
  subtitle?: string;
  title: string;
}) {
  return (
    <View>
      <Text className="text-base font-extrabold text-gray-950">{title}</Text>
      {subtitle && (
        <Text className="mt-1 text-xs font-semibold leading-5 text-gray-500">
          {subtitle}
        </Text>
      )}
    </View>
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
