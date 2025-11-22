import { View, Text, FlatList, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styles from "./styles";
import { commonStyles } from "@/styles/common.style";
import { external } from "@/styles/external.style";
import LocationSearchBar from "@/components/location/location.search.bar";
import color from "@/themes/app.colors";
import { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import RideCard from "@/components/ride/ride.card";
import { useGetUserData } from "@/hooks/useGetUserData";

export default function HomeScreen() {
  const [recentRides, setrecentRides] = useState([]);
  const { user } = useGetUserData();
  const wsRef = useRef<WebSocket | null>(null);

  const getRecentRides = async () => {
    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      
      if (!accessToken) {
        console.error("[getRecentRides] No access token found");
        return;
      }

      console.log("[getRecentRides] Fetching rides from:", `${process.env.EXPO_PUBLIC_SERVER_URI}/get-rides`);
      
      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/get-rides`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      console.log("[getRecentRides] Response:", {
        success: res.data.success,
        ridesCount: res.data.rides?.length || 0,
      });
      
      setrecentRides(res.data.rides || []);
    } catch (error: any) {
      console.error("[getRecentRides] Error fetching rides:", error);
      console.error("[getRecentRides] Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      setrecentRides([]);
    }
  };

  // Initialize WebSocket connection for user identification
  useEffect(() => {
    const getWebSocketUrl = () => {
      // Check if WebSocket URL is configured in environment
      const wsUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL;
      if (wsUrl) {
        return wsUrl;
      }
      
      // Extract IP from SERVER_URI
      const serverUri = process.env.EXPO_PUBLIC_SERVER_URI || '';
      const ipMatch = serverUri.match(/http:\/\/([^:]+)/);
      if (ipMatch && ipMatch[1] && !ipMatch[1].includes('localhost')) {
        return `ws://${ipMatch[1]}:8080`;
      }
      
      // Fallback
      return Platform.OS === 'android' ? 'ws://10.0.2.2:8080' : 'ws://localhost:8080';
    };

    const initializeWebSocket = () => {
      // Close existing connection if any
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
          }
        } catch (e) {
          console.log("[HomeScreen] Error closing existing WebSocket:", e);
        }
      }

      const wsUrl = getWebSocketUrl();
      console.log('[HomeScreen] Connecting to WebSocket:', wsUrl);
      
      try {
        wsRef.current = new WebSocket(wsUrl);
        const wsInstance = wsRef.current;

        wsInstance.onopen = () => {
          console.log("[HomeScreen] ✅ Connected to WebSocket server");
          
          // Identify user if data is available
          if (user?.id) {
            try {
              wsInstance.send(JSON.stringify({
                type: "identify",
                role: "user",
                userId: user.id,
              }));
              console.log("[HomeScreen] 🪪 Sent identify message as user:", user.id);
            } catch (error) {
              console.error("[HomeScreen] ❌ Failed to identify user:", error);
            }
          } else {
            console.log("[HomeScreen] ⚠️ User ID not available yet");
          }
        };

        wsInstance.onerror = (error) => {
          console.error("[HomeScreen] ❌ WebSocket error:", error);
        };

        wsInstance.onclose = () => {
          console.log("[HomeScreen] 🔌 WebSocket closed");
        };
      } catch (error) {
        console.error("[HomeScreen] ❌ Failed to create WebSocket:", error);
      }
    };

    // Initialize WebSocket when component mounts
    initializeWebSocket();

    // Re-identify when user data becomes available
    if (user?.id && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: "identify",
          role: "user",
          userId: user.id,
        }));
        console.log("[HomeScreen] 🪪 Re-identified as user:", user.id);
      } catch (error) {
        console.error("[HomeScreen] ❌ Failed to re-identify:", error);
      }
    }

    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          console.log("[HomeScreen] Error closing WebSocket on cleanup:", e);
        }
      }
    };
  }, [user?.id]);

  useEffect(() => {
    getRecentRides();
  }, []);

  return (
    <View style={[commonStyles.flexContainer, { backgroundColor: "#fff" }]}>
      <SafeAreaView style={styles.container}>
        <View style={[external.p_5, external.ph_20]}>
          <Text
            style={{
              fontFamily: "TT-Octosquares-Medium",
              fontSize: 25,
            }}
          >
            Flashride
          </Text>
          <LocationSearchBar />
        </View>
        <View style={{ padding: 5 }}>
          <View
            style={[
              styles.rideContainer,
              { backgroundColor: color.whiteColor },
            ]}
          >
            <Text style={[styles.rideTitle, { color: color.regularText }]}>
              Recent Rides
            </Text>
            <ScrollView>
              {recentRides?.map((item: any, index: number) => (
                <RideCard item={item} key={index} />
              ))}
              {recentRides?.length === 0 && (
                <Text style={{ fontSize: 16 }}>
                  You don't have any ride history yet!
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
