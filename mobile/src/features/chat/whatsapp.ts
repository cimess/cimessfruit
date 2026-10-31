import { Alert, Linking } from "react-native";
import { apiRequest } from "@/lib/api";

export const DEFAULT_SUPPORT_PHONE = "+2349065440424";

let cachedSupportPhone: string | null = null;

export function sanitizePhoneNumberForWhatsApp(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return "2349065440424";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

export async function fetchSupportPhone(): Promise<string> {
  if (cachedSupportPhone) return cachedSupportPhone;
  try {
    const res = await apiRequest<{ phone?: string }>("/api/support/contact");
    if (res?.phone && res.phone.trim().length > 0) {
      cachedSupportPhone = res.phone.trim();
      return cachedSupportPhone;
    }
  } catch {
    // Graceful fallback to default
  }
  return DEFAULT_SUPPORT_PHONE;
}

export type WhatsAppChatOptions = {
  phone?: string;
  message?: string;
  productName?: string;
  orderId?: string;
};

export async function openWhatsAppSupport(options: WhatsAppChatOptions = {}): Promise<void> {
  try {
    const rawPhone = options.phone || (await fetchSupportPhone());
    const waNumber = sanitizePhoneNumberForWhatsApp(rawPhone);

    let message = options.message;
    if (!message) {
      if (options.productName) {
        message = `Hello CimessFruit! I would like to negotiate price and check live pictures for "${options.productName}".`;
      } else if (options.orderId) {
        message = `Hello CimessFruit! I have a question regarding my order #${options.orderId.slice(0, 8)}.`;
      } else {
        message = "Hello CimessFruit! I would like to make an enquiry and check live pictures of your fruits.";
      }
    }

    const encodedMessage = encodeURIComponent(message);
    const nativeUrl = `whatsapp://send?phone=${waNumber}&text=${encodedMessage}`;
    const webUrl = `https://wa.me/${waNumber}?text=${encodedMessage}`;

    const canOpenNative = await Linking.canOpenURL(nativeUrl);
    if (canOpenNative) {
      await Linking.openURL(nativeUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch {
    Alert.alert(
      "Unable to open WhatsApp",
      "Please make sure WhatsApp is installed, or contact us directly at +234 906 544 0424."
    );
  }
}
