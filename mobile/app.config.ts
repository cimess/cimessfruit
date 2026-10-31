import type { ExpoConfig, ConfigContext } from "expo/config";

// Keep credentials out of git. EAS can supply GOOGLE_SERVICES_JSON as a file variable.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "CimessFruit",
  slug: config.slug ?? "cimessfruit",
  android: {
    ...config.android,
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
  extra: {
    ...config.extra,
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? {
      eas: { ...config.extra?.eas, projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID },
    } : {}),
  },
});
