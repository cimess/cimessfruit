import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { apiRequest, apiOrigin, readStoredSession } from "@/lib/api";
import { draftDirectory, type LocalImage } from "./drafts";

export default function ImageUpload({
  owner,
  slot,
  disabled,
  value,
  onChange,
  onBusy,
}: {
  slot: string;
  disabled: boolean;
  owner: string;
  value: LocalImage;
  onChange: (value: LocalImage) => void;
  onBusy: (busy: boolean) => void;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  useEffect(() => {
    if (value.id)
      void apiRequest(`/api/uploads/${value.id}`, { method: "PATCH" }).catch(
        () =>
          setError(
            "Upload unavailable or offline. Retry, or select and upload the image again.",
          ),
      );
  }, [value.id]);

  async function accept(asset: ImagePicker.ImagePickerAsset) {
    if (!active.current) return;
    if ((asset.fileSize ?? 0) > 4 * 1024 * 1024)
      throw Error("Choose an image up to 4 MB.");
    const type = asset.mimeType ?? "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type))
      throw Error("Choose JPEG, PNG or WebP.");
    const file = new File(
      draftDirectory(owner),
      `${Crypto.randomUUID()}.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`,
    );
    await new File(asset.uri).copy(file);
    if (!active.current) {
      if (file.exists) file.delete();
      return;
    }
    const old = value;
    onChange({ uri: file.uri, name: file.name, type });
    if (old.id)
      void apiRequest(`/api/uploads/${old.id}`, { method: "DELETE" }).catch(
        () => {},
      );
    if (old.uri) {
      const previous = new File(old.uri);
      if (previous.exists) previous.delete();
    }
  }

  useEffect(() => {
    const marker = new File(draftDirectory(owner), "picker.json");
    if (!marker.exists) return;
    try {
      if (JSON.parse(marker.textSync()).slot !== slot) return;
    } catch {
      return;
    }
    void ImagePicker.getPendingResultAsync()
      .then(async (result) => {
        if (
          result &&
          "assets" in result &&
          !result.canceled &&
          result.assets?.[0]
        ) {
          await accept(result.assets[0]);
          if (marker.exists) marker.delete();
        }
      })
      .catch(() => setError("Select the image again to continue your draft."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recover a pending Android picker once for this owner and composer slot.
  }, [owner, slot]);

  async function choose() {
    if (disabled || busy) return;
    setBusy(true);
    onBusy(true);
    try {
      const marker = new File(draftDirectory(owner), "picker.json");
      marker.writeSync(JSON.stringify({ slot }));
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
      });
      if (!result.canceled) await accept(result.assets[0]);
      if (marker.exists) marker.delete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to select image.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  async function upload() {
    if (!value.uri || busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      // FileSystem.uploadAsync performs multipart upload at the native (OS) level.
      // It never constructs a JS Blob or ArrayBuffer, bypassing all Hermes
      // limitations. Auth token is passed manually in the Authorization header.
      const session = await readStoredSession();
      if (!session) throw new Error("Sign in first.");
      const origin = apiOrigin();
      const response = await FileSystem.uploadAsync(
        `${origin}/api/uploads/evidence`,
        value.uri,
        {
          fieldName: "file",
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          mimeType: value.type ?? "image/jpeg",
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      );
      if (response.status < 200 || response.status >= 300) {
        let msg = "Upload failed. Retry when connected.";
        try {
          const body = JSON.parse(response.body) as { error?: string };
          if (body.error) msg = body.error;
        } catch { /* ignore parse errors */ }
        throw new Error(msg);
      }
      const result = JSON.parse(response.body) as LocalImage;
      const old = value.uri;
      onChange(result);
      const file = new File(old);
      if (file.exists) file.delete();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload failed. Retry when connected.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  async function remove() {
    if (disabled || busy) return;
    setBusy(true);
    onBusy(true);
    try {
      if (value.id)
        await apiRequest(`/api/uploads/${value.id}`, { method: "DELETE" });
      if (value.uri) {
        const file = new File(value.uri);
        if (file.exists) file.delete();
      }
      onChange({});
      setError("");
    } catch {
      setError("Unable to remove image. Retry when connected.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  const isUploaded = Boolean(value.id && !value.uri);
  const isSelectedPendingUpload = Boolean(value.uri && !value.id);

  return (
    <View className="my-2 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-xs">
      {/* 1. Empty State - Choose photo */}
      {!value.uri && !value.id && (
        <Pressable
          disabled={busy || disabled}
          onPress={() => void choose()}
          className="flex-row items-center justify-center rounded-xl border border-dashed border-emerald-400 bg-emerald-50/60 py-4 active:bg-emerald-100"
        >
          <Ionicons name="camera-outline" size={22} color="#128A3A" />
          <Text className="ml-2.5 font-bold text-[#128A3A]">
            Select Evidence Photo
          </Text>
        </Pressable>
      )}

      {/* 2. Photo Selected but NOT yet uploaded */}
      {isSelectedPendingUpload && (
        <View className="items-center">
          <View className="overflow-hidden rounded-xl border border-gray-200">
            <Image
              source={{ uri: value.uri }}
              style={{ width: 180, height: 130 }}
              resizeMode="cover"
            />
          </View>

          {/* Prominent Action to Upload */}
          <Pressable
            disabled={busy || disabled}
            onPress={() => void upload()}
            className={`mt-3 w-full flex-row items-center justify-center rounded-xl py-3 px-4 shadow-sm ${
              busy ? "bg-amber-500" : "bg-[#128A3A] active:opacity-90"
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
            )}
            <Text className="ml-2 font-extrabold text-white">
              {busy ? "Uploading to Cloud..." : "Upload Selected Photo"}
            </Text>
          </Pressable>

          <Text className="mt-1 text-center text-[11px] font-semibold text-amber-700">
            ⚠️ Tap &quot;Upload Selected Photo&quot; to complete before submitting.
          </Text>

          <Pressable
            disabled={busy || disabled}
            onPress={() => void remove()}
            className="mt-2 flex-row items-center py-1"
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text className="ml-1 text-xs font-bold text-red-600">Remove Photo</Text>
          </Pressable>
        </View>
      )}

      {/* 3. Photo Successfully Uploaded */}
      {isUploaded && (
        <View className="flex-row items-center justify-between rounded-xl bg-emerald-50 p-3 border border-emerald-200">
          <View className="flex-row items-center flex-1 pr-2">
            <Ionicons name="checkmark-circle" size={24} color="#128A3A" />
            <View className="ml-2.5 flex-1">
              <Text className="text-xs font-extrabold text-emerald-900">
                Photo Uploaded Successfully
              </Text>
              <Text className="text-[10px] text-emerald-700">
                {value.imageUploadedAt
                  ? `Uploaded at ${new Date(value.imageUploadedAt).toLocaleTimeString()}`
                  : "Ready for dispute"}
              </Text>
            </View>
          </View>
          <Pressable
            disabled={busy || disabled}
            onPress={() => void remove()}
            className="rounded-lg bg-white px-2.5 py-1.5 border border-red-200"
          >
            <Text className="text-xs font-bold text-red-600">Delete</Text>
          </Pressable>
        </View>
      )}

      <Text className="mt-2 text-[10px] text-gray-400 text-center">
        JPEG, PNG or WebP, up to 4 MB
      </Text>

      {/* Error Message */}
      {!!error && (
        <View className="mt-2 rounded-lg bg-red-50 p-2 border border-red-200">
          <Text className="text-xs font-bold text-red-700" accessibilityRole="alert">
            {error}
          </Text>
        </View>
      )}
    </View>
  );
}
