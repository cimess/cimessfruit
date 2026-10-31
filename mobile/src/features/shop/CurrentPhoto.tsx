import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { apiRequest } from "@/lib/api";
export default function CurrentPhoto({ id, name }: { id: string; name: string }) {
  const [visible, setVisible] = useState(false), [revision, setRevision] = useState(0);
  const [photo, setPhoto] = useState<{ imageUrl: string | null; imageUploadedAt: string | null } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void apiRequest<{ product: { imageUrl: string | null; imageUploadedAt: string | null } }>(`/api/products/${id}`, { signal: controller.signal }, false).then(result => { if (!controller.signal.aborted) setPhoto(result.product); }).catch(() => { if (!controller.signal.aborted) setError("Unable to load the current photo. Please retry."); });
    return () => controller.abort();
  }, [visible, id, revision]);
  return <><Pressable accessibilityLabel={`View current photo of ${name}`} onPress={() => { setPhoto(null); setError(""); setVisible(true); }}><Text className="py-2 text-xs font-bold text-green-800">View current photo ↗</Text></Pressable><Modal visible={visible} transparent onRequestClose={() => setVisible(false)}><View className="flex-1 justify-center bg-black/60 p-6"><View className="rounded-2xl bg-white p-5"><Text className="text-xl font-bold">{name} · current stock</Text>{error ? <Text accessibilityRole="alert">{error}</Text> : !photo ? <Text>Loading current photo…</Text> : photo.imageUrl ? <><Image source={{ uri: photo.imageUrl }} style={{ width: "100%", height: 280 }} contentFit="contain" onError={() => setError("Photo unavailable. Please retry.")} /><Text>{photo.imageUploadedAt ? `Uploaded: ${new Date(photo.imageUploadedAt).toLocaleString()}` : "Upload time unavailable"}</Text></> : <Text>No live photo has been uploaded yet.</Text>}<Pressable onPress={() => { setError(""); setPhoto(null); setRevision(value => value + 1); }}><Text className="py-3 font-bold">Refresh photo</Text></Pressable><Pressable onPress={() => setVisible(false)}><Text className="py-3 font-bold text-green-800">Close</Text></Pressable></View></View></Modal></>;
}
