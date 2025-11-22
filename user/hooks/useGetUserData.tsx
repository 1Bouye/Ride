import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useEffect, useState } from "react";

export const useGetUserData = () => {
  const [user, setUser] = useState<UserType>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getLoggedInUserData = async () => {
      try {
        const accessToken = await AsyncStorage.getItem("accessToken");
        
        if (!accessToken) {
          console.error("[useGetUserData] No access token found");
          setLoading(false);
          return;
        }

        const serverUri = process.env.EXPO_PUBLIC_SERVER_URI;
        if (!serverUri) {
          console.error("[useGetUserData] EXPO_PUBLIC_SERVER_URI is not set");
          setLoading(false);
          return;
        }

        console.log("[useGetUserData] Fetching user data from:", `${serverUri}/me`);
        
        const res = await axios.get(
          `${serverUri}/me`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 10000,
          }
        );

        console.log("[useGetUserData] Response:", {
          success: res.data.success,
          hasUser: !!res.data.user,
          userId: res.data.user?.id,
          userName: res.data.user?.name,
        });

        if (res.data.success && res.data.user) {
          setUser(res.data.user);
          setLoading(false);
        } else {
          console.error("[useGetUserData] Invalid response:", res.data);
          setLoading(false);
        }
      } catch (error: any) {
        console.error("[useGetUserData] Error fetching user data:", error);
        console.error("[useGetUserData] Error details:", {
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          code: error?.code,
        });
        setLoading(false);
      }
    };
    getLoggedInUserData();
  }, []);

  return { loading, user };
};
