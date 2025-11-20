import { View, Text } from "react-native";
import React, { useState } from "react";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import { useGetDriverData } from "@/hooks/useGetDriverData";
import Input from "@/components/common/input";
import SelectInput from "@/components/common/select-input";
import { countryNameItems } from "@/configs/country-name-list";
import Button from "@/components/common/button";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import axios from "axios";
import { Toast } from "react-native-toast-notifications";

export default function Profile() {
  const { driver, loading } = useGetDriverData();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (loading) {
    return;
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      
      // Set driver status to "inactive" (offline) before logging out
      if (accessToken) {
        try {
          await axios.put(
            `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/update-status`,
            {
              status: "inactive",
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
              timeout: 5000, // 5 second timeout
            }
          );
          console.log("[Logout] Driver status set to inactive");
        } catch (error: any) {
          // Log error but don't prevent logout
          console.error("[Logout] Failed to update status to inactive:", error?.message || error);
        }
      }

      // Clear all stored data
      await AsyncStorage.removeItem("accessToken");
      await AsyncStorage.removeItem("status");
      
      // Navigate to login
      router.push("/(routes)/login");
    } catch (error: any) {
      console.error("[Logout] Error during logout:", error?.message || error);
      // Even if there's an error, still try to log out
      try {
        await AsyncStorage.removeItem("accessToken");
        await AsyncStorage.removeItem("status");
        router.push("/(routes)/login");
      } catch (storageError) {
        console.error("[Logout] Failed to clear storage:", storageError);
        Toast.show("Error during logout. Please try again.", {
          type: "danger",
          placement: "bottom",
        });
        setIsLoggingOut(false);
      }
    }
  };

  return (
    <View style={{ paddingTop: 70 }}>
      <Text
        style={{
          textAlign: "center",
          fontSize: fontSizes.FONT30,
          fontWeight: "600",
        }}
      >
        My Profile
      </Text>
      <View style={{ padding: windowWidth(20) }}>
        <Input
          title="Name"
          value={driver?.name || ""}
          onChangeText={() => {}}
          placeholder={driver?.name || "Name"}
          disabled={true}
        />
        <Input
          title="Email Address"
          value={driver?.email || ""}
          onChangeText={() => {}}
          placeholder={driver?.email || "Email"}
          disabled={true}
        />
        <Input
          title="Phone Number"
          value={driver?.phone_number || ""}
          onChangeText={() => {}}
          placeholder={driver?.phone_number || "Phone Number"}
          disabled={true}
        />
        <Input
          title="Country"
          value="Mauritania"
          onChangeText={() => {}}
          placeholder="Mauritania"
          disabled={true}
        />
        <View style={{ marginVertical: 25 }}>
          <Button
            onPress={handleLogout}
            title={isLoggingOut ? "Logging Out..." : "Log Out"}
            height={windowHeight(35)}
            backgroundColor="crimson"
            disabled={isLoggingOut}
          />
        </View>
      </View>
    </View>
  );
}
