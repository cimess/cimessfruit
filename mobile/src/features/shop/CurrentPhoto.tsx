import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/api";

export default function CurrentPhoto({ id, name }: { id: string; name: string }) {
  const [visible, setVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [photo, setPhoto] = useState<{ imageUrl: string | null; imageUploadedAt: string | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void apiRequest<{ product: { imageUrl: string | null; imageUploadedAt: string | null } }>(
      `/api/products/${id}`,
      { signal: controller.signal },
      false,
    )
      .then((result) => {
        if (!controller.signal.aborted) setPhoto(result.product);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Unable to load the current photo. Please retry.");
      });
    return () => controller.abort();
  }, [visible, id, revision]);

  return (
    <>
      <Pressable
        accessibilityLabel={`View current photo of ${name}`}
        onPress={() => {
          setPhoto(null);
          setError("");
          setVisible(true);
        }}
      >
        <Text className="py-2 text-xs font-bold text-green-800">View current photo ↗</Text>
      </Pressable>

      {/* Main Preview Modal */}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View className="flex-1 justify-center bg-black/60 p-5">
          <View className="rounded-3xl bg-white p-5 shadow-2xl">
            <View className="flex-row items-center justify-between pb-3">
              <View className="flex-1 pr-2">
                <Text className="text-lg font-extrabold text-gray-900">{name}</Text>
                <Text className="text-xs font-semibold text-emerald-700">Live batch photo</Text>
              </View>
              <Pressable
                onPress={() => setVisible(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-gray-100"
              >
                <Ionicons name="close" size={20} color="#374151" />
              </Pressable>
            </View>

            {error ? (
              <Text accessibilityRole="alert" className="my-4 text-center text-sm font-semibold text-red-600">
                {error}
              </Text>
            ) : !photo ? (
              <View className="h-64 items-center justify-center">
                <Text className="text-sm font-semibold text-gray-500">Loading current photo…</Text>
              </View>
            ) : photo.imageUrl ? (
              <View className="my-2">
                <Pressable
                  onPress={() => setFullscreen(true)}
                  className="relative overflow-hidden rounded-2xl bg-gray-50 border border-gray-100"
                >
                  <Image
                    source={{ uri: photo.imageUrl }}
                    style={{ width: "100%", height: 260 }}
                    contentFit="contain"
                    onError={() => setError("Photo unavailable. Please retry.")}
                  />
                  <View className="absolute bottom-2.5 right-2.5 flex-row items-center rounded-full bg-black/75 px-3 py-1.5">
                    <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
                    <Text className="ml-1 text-[11px] font-bold text-white">Full page</Text>
                  </View>
                </Pressable>

                <View className="mt-3 flex-row items-center justify-between">
                  <Text className="text-xs font-medium text-gray-500">
                    {photo.imageUploadedAt
                      ? `Arrived: ${new Date(photo.imageUploadedAt).toLocaleDateString()}`
                      : "Current stock"}
                  </Text>
                  <Pressable
                    onPress={() => setFullscreen(true)}
                    className="flex-row items-center"
                  >
                    <Ionicons name="scan-outline" size={14} color="#128A3A" />
                    <Text className="ml-1 text-xs font-bold text-[#128A3A]">Open Full View</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="my-6 items-center">
                <Ionicons name="image-outline" size={36} color="#9CA3AF" />
                <Text className="mt-2 text-sm font-semibold text-gray-600">
                  No live photo has been uploaded yet.
                </Text>
              </View>
            )}

            <View className="mt-4 flex-row gap-2.5 pt-2 border-t border-gray-100">
              <Pressable
                onPress={() => {
                  setError("");
                  setPhoto(null);
                  setRevision((value) => value + 1);
                }}
                className="flex-1 items-center justify-center rounded-xl bg-gray-100 py-3"
              >
                <Text className="text-xs font-bold text-gray-800">Refresh</Text>
              </Pressable>
              <Pressable
                onPress={() => setVisible(false)}
                className="flex-1 items-center justify-center rounded-xl bg-[#128A3A] py-3"
              >
                <Text className="text-xs font-bold text-white">Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full Page Customer Inspection Modal */}
      {photo?.imageUrl && (
        <Modal
          visible={fullscreen}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setFullscreen(false)}
        >
          <View className="flex-1 bg-black justify-between p-4 pb-8">
            <View className="flex-row items-center justify-between pt-10 px-2">
              <View>
                <Text className="text-lg font-extrabold text-white">{name}</Text>
                <Text className="text-xs font-medium text-gray-300">
                  {photo.imageUploadedAt
                    ? `Stock photo uploaded: ${new Date(photo.imageUploadedAt).toLocaleString()}`
                    : "Fresh stock"}
                </Text>
              </View>
              <Pressable
                onPress={() => setFullscreen(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/20"
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <View className="flex-1 items-center justify-center my-4">
              <Image
                source={{ uri: photo.imageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
              />
            </View>

            <Pressable
              onPress={() => setFullscreen(false)}
              className="items-center justify-center rounded-2xl bg-white/20 py-3.5"
            >
              <Text className="font-bold text-white text-sm">Close Fullscreen</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  );
}

