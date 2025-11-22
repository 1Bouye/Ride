import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";

// Helper to check if error is a network error
const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message || error.toString();
  const errorCode = error.code;
  
  return (
    errorCode === "ERR_NETWORK" ||
    errorCode === "ECONNREFUSED" ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "ENOTFOUND" ||
    errorMessage.includes("Network Error") ||
    errorMessage.includes("Network request failed") ||
    !error.response // Network errors typically don't have a response
  );
};

// Helper to validate server URI
const validateServerUri = (serverUri: string | undefined): { valid: boolean; message?: string } => {
  if (!serverUri) {
    return {
      valid: false,
      message: "EXPO_PUBLIC_SERVER_URI is not set in environment variables. Please add it to your .env file.",
    };
  }

  if (serverUri.includes("localhost") || serverUri.includes("127.0.0.1")) {
    return {
      valid: false,
      message: "EXPO_PUBLIC_SERVER_URI points to localhost. On physical devices, use your computer's LAN IP address (e.g., http://192.168.1.100:3000).",
    };
  }

  if (!serverUri.startsWith("http://") && !serverUri.startsWith("https://")) {
    return {
      valid: false,
      message: "EXPO_PUBLIC_SERVER_URI must start with http:// or https://",
    };
  }

  return { valid: true };
};

// Retry helper for network operations
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Only retry on network errors
      if (!isNetworkError(error) || attempt === maxRetries) {
        throw error;
      }

      console.warn(
        `[useGetDriverData] Network error on attempt ${attempt}/${maxRetries}. Retrying in ${delayMs}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
};

export const useGetDriverData = () => {
  const [driver, setDriver] = useState<DriverType>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDriverData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const accessToken = await AsyncStorage.getItem("accessToken");

      if (!accessToken) {
        const errorMsg = "[useGetDriverData] No access token found. Please log in again.";
        console.error(errorMsg);
        setError("Not authenticated. Please log in.");
        setLoading(false);
        return null;
      }

      const serverUri = process.env.EXPO_PUBLIC_SERVER_URI;
      const validation = validateServerUri(serverUri);

      if (!validation.valid) {
        console.error("[useGetDriverData] Server URI validation failed:", validation.message);
        setError(validation.message || "Server configuration error");
        setLoading(false);
        return null;
      }

      const apiUrl = `${serverUri}/driver/me`;
      console.log("[useGetDriverData] Fetching driver data from:", apiUrl);
      console.log("[useGetDriverData] Platform:", Platform.OS);
      console.log("[useGetDriverData] Server URI:", serverUri);

      const res = await retryOperation(
        () =>
          axios.get(apiUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 15000, // Increased timeout to 15 seconds
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors
          }),
        3, // 3 retries
        1000 // 1 second initial delay
      );

      console.log("[useGetDriverData] Response status:", res.status);
      console.log("[useGetDriverData] Response data:", {
        success: res.data?.success,
        hasDriver: !!res.data?.driver,
        driverId: res.data?.driver?.id,
        driverName: res.data?.driver?.name,
      });

      if (res.status === 401 || res.status === 403) {
        const errorMsg = "Authentication failed. Please log in again.";
        console.error("[useGetDriverData]", errorMsg);
        setError(errorMsg);
        setLoading(false);
        return null;
      }

      if (res.data?.success && res.data?.driver) {
        setDriver(res.data.driver);
        setLoading(false);
        return res.data.driver;
      } else {
        const errorMsg = res.data?.message || "Invalid response from server";
        console.error("[useGetDriverData] Invalid response:", res.data);
        setError(errorMsg);
        setLoading(false);
        return null;
      }
    } catch (error: any) {
      console.error("[useGetDriverData] Error fetching driver data:", error);

      let errorMessage = "Failed to fetch driver data";

      if (isNetworkError(error)) {
        errorMessage = "Network error. Please check:\n1. Server is running\n2. EXPO_PUBLIC_SERVER_URI is correct\n3. Device has internet connection";
        console.error("[useGetDriverData] Network error details:", {
          code: error?.code,
          message: error?.message,
          serverUri: process.env.EXPO_PUBLIC_SERVER_URI,
          platform: Platform.OS,
        });
      } else if (error?.response) {
        // Server responded with error
        errorMessage = error.response.data?.message || `Server error: ${error.response.status}`;
        console.error("[useGetDriverData] Server error:", {
          status: error.response.status,
          data: error.response.data,
        });
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
      setLoading(false);

      // Don't throw error, return null instead to prevent unhandled promise rejections
      return null;
    }
  }, []);

  useEffect(() => {
    fetchDriverData();
  }, [fetchDriverData]);

  return { loading, driver, error, refreshDriverData: fetchDriverData };
};
