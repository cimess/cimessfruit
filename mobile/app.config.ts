import type { ExpoConfig, ConfigContext } from "expo/config";

// Expo selects this TypeScript entry point. Explicitly compose the existing
// JavaScript build settings so package IDs, maps, and release checks also run.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configureBuild = require("./app.config.js") as (context: ConfigContext) => ExpoConfig;

// Keep credentials out of git. EAS can supply GOOGLE_SERVICES_JSON as a file variable.
export default (context: ConfigContext): ExpoConfig => {
  const config = configureBuild(context);
  return ({
  ...config,

  name: config.name ?? "CimessFruit",
  slug: config.slug ?? "cimessfruit",

  // Preserve existing plugins and add expo-web-browser
  plugins: [
    ...(config.plugins ?? []),
    "expo-web-browser",
  ],

  android: {
    ...config.android,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },

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
  });
};