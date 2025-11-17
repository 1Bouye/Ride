import "dotenv/config";

const sharedMapsApiKey =
  process.env.GOOGLE_MAPS_ANDROID_KEY ??
  process.env.GOOGLE_MAPS_IOS_KEY ??
  process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY ??
  "";

export default {
  expo: {
    name: "Flashride",
    slug: "flashride",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "flashride-driver",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.flashride.driver",
      config: sharedMapsApiKey
        ? {
            googleMapsApiKey: sharedMapsApiKey,
          }
        : undefined,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.flashride.driver",
      config: sharedMapsApiKey
        ? {
            googleMaps: {
              apiKey: sharedMapsApiKey,
            },
          }
        : undefined,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
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
        projectId: "e0f929ef-0efd-437f-a415-cb1fa23e155a",
      },
    },
  },
};

