import { Modal, Pressable, Text, View } from "react-native";
export default function DeliveryMap({ onClose }: { onClose: () => void; [key: string]: unknown }) {
  return <Modal visible onRequestClose={onClose}><View className="p-8"><Text>Use the Android or iOS app to choose a delivery pin.</Text><Pressable onPress={onClose}><Text>Close</Text></Pressable></View></Modal>;
}
