import { Directory, File, Paths } from "expo-file-system";
import { Linking } from "react-native";
import { apiOrigin, getSessionSnapshot } from "@/lib/api";
export async function openEvidence(url: string) {
  const target = new URL(url),
    origin = apiOrigin();
  if (
    target.origin !== origin ||
    !/^\/api\/uploads\/[a-f0-9-]+\/content$/.test(target.pathname)
  ) {
    if (target.protocol !== "https:") throw Error("Invalid evidence link");
    await Linking.openURL(url);
    return;
  }
  const snapshot = await getSessionSnapshot();
  if (!snapshot.session) throw Error("Sign in to view evidence");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  let file: File | undefined;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${snapshot.session.token}` },
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw Error("Unable to open evidence");
    const type = response.headers.get("content-type");
    if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type))
      throw Error("Invalid evidence image");
    const bytes = await response.arrayBuffer();
    const current = await getSessionSnapshot();
    if (current.version !== snapshot.version) throw Error("Account changed");
    const dir = new Directory(Paths.cache, "private-evidence");
    dir.create({ intermediates: true, idempotent: true });
    file = new File(
      dir,
      `${target.pathname.split("/")[3]}.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`,
    );
    await file.write(new Uint8Array(bytes));
    await File.preview(file, { mimeType: type });
  } finally {
    clearTimeout(timer);
    if (file?.exists) file.delete();
  }
}
