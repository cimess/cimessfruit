module.exports = ({ config }) => {
  const release = ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE);
  if (release) {
    const origin = process.env.EXPO_PUBLIC_API_URL;
    let url;
    try { url = new URL(origin); } catch { throw new Error("Set EXPO_PUBLIC_API_URL to the deployed HTTPS API origin before building."); }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Release API URL must be an HTTPS origin without credentials or a path.");
    if (process.env.EAS_BUILD_PLATFORM === "android" && !process.env.GOOGLE_MAPS_ANDROID_API_KEY) throw new Error("Set GOOGLE_MAPS_ANDROID_API_KEY for standalone Android maps.");
  }
  return {
    ...config,
    android: { ...config.android, package: "com.cimessfruit.app" },
    ios: { ...config.ios, bundleIdentifier: "com.cimessfruit.app" },
    plugins: [...(config.plugins ?? []),
      ["expo-location", { locationWhenInUsePermission: "Use your location to choose a delivery entrance or look up the address of your selected pin." }],
      ["react-native-maps", { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "" }],
    ],
  };
};
