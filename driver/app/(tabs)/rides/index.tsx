import { View, Text, ScrollView } from "react-native";
import React, { useEffect, useState } from "react";
import styles from "@/screens/home/styles";
import color from "@/themes/app.colors";
import RideCard from "@/components/ride/ride.card";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { windowHeight } from "@/themes/app.constant";

export default function Rides() {
  const [recentRides, setrecentRides] = useState([]);
  const getRecentRides = async () => {
    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      
      if (!accessToken) {
        console.error("[Driver Rides] No access token found");
        return;
      }

      console.log("[Driver Rides] Fetching rides from:", `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/get-rides`);
      
      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/get-rides`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      console.log("[Driver Rides] Response:", {
        success: res.data.success,
        ridesCount: res.data.rides?.length || 0,
      });
      
      setrecentRides(res.data.rides || []);
    } catch (error: any) {
      console.error("[Driver Rides] Error fetching rides:", error);
      console.error("[Driver Rides] Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      setrecentRides([]);
    }
  };

  useEffect(() => {
    getRecentRides();
  }, []);

  return (
    <View
      style={[
        styles.rideContainer,
        { backgroundColor: color.lightGray, paddingTop: windowHeight(40) },
      ]}
    >
      <Text
        style={[
          styles.rideTitle,
          { color: color.primaryText, fontWeight: "600" },
        ]}
      >
        Ride History
      </Text>
      <ScrollView>
        {recentRides?.map((item: any, index: number) => (
          <RideCard item={item} key={index} />
        ))}
      </ScrollView>
    </View>
  );
}
