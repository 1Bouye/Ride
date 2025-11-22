import axios, { AxiosError } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Helper to check if error is a network error
export const isNetworkError = (error: any): boolean => {
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
export const validateServerUri = (
  serverUri: string | undefined
): { valid: boolean; message?: string } => {
  if (!serverUri) {
    return {
      valid: false,
      message:
        "EXPO_PUBLIC_SERVER_URI is not set in environment variables. Please add it to your .env file.",
    };
  }

  if (serverUri.includes("localhost") || serverUri.includes("127.0.0.1")) {
    return {
      valid: false,
      message:
        "EXPO_PUBLIC_SERVER_URI points to localhost. On physical devices, use your computer's LAN IP address (e.g., http://192.168.1.100:3000).",
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
export const retryApiCall = async <T>(
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
        `[API] Network error on attempt ${attempt}/${maxRetries}. Retrying in ${delayMs}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
};

// Get error message for display
export const getErrorMessage = (error: any): string => {
  if (isNetworkError(error)) {
    return "Network error. Please check:\n1. Server is running\n2. EXPO_PUBLIC_SERVER_URI is correct\n3. Device has internet connection";
  }

  if (error?.response) {
    // Server responded with error
    return error.response.data?.message || `Server error: ${error.response.status}`;
  }

  if (error?.message) {
    return error.message;
  }

  return "An unexpected error occurred";
};

// Make authenticated API call with automatic retry
export const makeAuthenticatedRequest = async <T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    data?: any;
    timeout?: number;
    retries?: number;
  } = {}
): Promise<T> => {
  const {
    method = "GET",
    data,
    timeout = 15000,
    retries = 3,
  } = options;

  const serverUri = process.env.EXPO_PUBLIC_SERVER_URI;
  const validation = validateServerUri(serverUri);

  if (!validation.valid) {
    throw new Error(validation.message || "Server configuration error");
  }

  const accessToken = await AsyncStorage.getItem("accessToken");
  if (!accessToken) {
    throw new Error("Not authenticated. Please log in again.");
  }

  const url = `${serverUri}${endpoint}`;

  return retryApiCall(
    async () => {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error("Authentication failed. Please log in again.");
      }

      return response.data;
    },
    retries,
    1000
  );
};

// Get server URI with validation
export const getServerUri = (): string => {
  const serverUri = process.env.EXPO_PUBLIC_SERVER_URI;
  const validation = validateServerUri(serverUri);

  if (!validation.valid) {
    throw new Error(validation.message || "Server URI not configured");
  }

  return serverUri!;
};

