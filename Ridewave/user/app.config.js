import "dotenv/config";

// Use the correct env vars for Google Maps native SDK keys.
// For Android builds, use EXPO_GOOGLE_MAPS_ANDROID_KEY (or fallback to GOOGLE_MAPS_ANDROID_KEY).
// For iOS builds, use EXPO_GOOGLE_MAPS_IOS_KEY (or fallback to GOOGLE_MAPS_IOS_KEY).
const ANDROID_MAPS_API_KEY =
  process.env.EXPO_GOOGLE_MAPS_ANDROID_KEY ?? process.env.GOOGLE_MAPS_ANDROID_KEY ?? "";
const IOS_MAPS_API_KEY =
  process.env.EXPO_GOOGLE_MAPS_IOS_KEY ?? process.env.GOOGLE_MAPS_IOS_KEY ?? "";

export default {
  expo: {
    name: "Flashride",
    slug: "flashride-user",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "flashride",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.flashride.user",
      config: IOS_MAPS_API_KEY
        ? {
            googleMapsApiKey: IOS_MAPS_API_KEY,
          }
        : undefined,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.flashride.user",
      config: ANDROID_MAPS_API_KEY
        ? {
            googleMaps: {
              apiKey: ANDROID_MAPS_API_KEY,
            },
          }
        : undefined,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-web-browser",
      [
        "expo-font",
        {
          fonts: ["./assets/fonts/TT-Octosquares-Medium.ttf"],
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "f2fcc533-6353-4af7-866a-f41310252bda",
      },
      // Explicitly expose Supabase environment variables
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};

