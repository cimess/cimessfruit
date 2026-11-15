import type { ExpoConfig, ConfigContext } from "expo/config";

// Keep credentials out of git. EAS can supply GOOGLE_SERVICES_JSON as a file variable.
export default ({ config }: ConfigContext): ExpoConfig => {
  const release = ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE ?? "");
  if (release) {
    const origin = process.env.EXPO_PUBLIC_API_URL;
    let url: URL;
    try {
      url = new URL(origin ?? "");
    } catch {
      throw new Error("Set EXPO_PUBLIC_API_URL to the deployed HTTPS API origin before building.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Release API URL must be an HTTPS origin without credentials or a path.");
    }
    if (process.env.EAS_BUILD_PLATFORM === "android" && !process.env.GOOGLE_MAPS_ANDROID_API_KEY) {
      throw new Error("Set GOOGLE_MAPS_ANDROID_API_KEY for standalone Android maps.");
    }
  }

  return {
    ...config,

    name: config.name ?? "CimessFruit",
    slug: config.slug ?? "cimessfruit",

    android: {
      ...config.android,
      package: "com.cimessfruit",
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
    },

    ios: {
      ...config.ios,
      bundleIdentifier: "com.cimessfruit",
    },

    plugins: [
      ...(config.plugins ?? []),
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Use your location to choose a delivery entrance or look up the address of your selected pin.",
        },
      ],
      [
        "react-native-maps",
        {
          androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? "",
        },
      ],
      "expo-web-browser",
    ],

    extra: {
      ...config.extra,
      ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
        ? {
            eas: {
              ...config.extra?.eas,
              projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
            },
          }
        : {}),
    },
  };
};
