import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import React, { useState } from "react";
import { windowHeight, windowWidth } from "@/themes/app.constant";
import ProgressBar from "@/components/common/progress.bar";
import styles from "../signup/styles";
import { useTheme } from "@react-navigation/native";
import TitleView from "@/components/signup/title.view";
import Input from "@/components/common/input";
import SelectInput from "@/components/common/select-input";
import Button from "@/components/common/button";
import color from "@/themes/app.colors";
import { router, useLocalSearchParams } from "expo-router";
import axios from "axios";
import { Toast } from "react-native-toast-notifications";

export default function DocumentVerificationScreen() {
  const driverData = useLocalSearchParams();
  const { colors } = useTheme();
  const getParamValue = (param: any) =>
    Array.isArray(param) ? param[0] : param ?? "";
  const [showWarning, setShowWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    vehicleType: "", // Start with empty to show placeholder
    registrationNumber: "",
    registrationDate: "",
    drivingLicenseNumber: "",
    color: "",
    rate: "",
  });

  const handleChange = (key: string, value: string) => {
    setFormData((prevData) => ({
      ...prevData,
      [key]: value,
    }));
  };

  const handleSubmit = async () => {
    if (
      !formData.vehicleType ||
      !formData.registrationNumber.trim() ||
      !formData.registrationDate.trim() ||
      !formData.drivingLicenseNumber.trim() ||
      !formData.color.trim() ||
      !formData.rate.trim()
    ) {
      setShowWarning(true);
      Toast.show("Please fill out all vehicle details.", {
        placement: "bottom",
      });
      return;
    }

    const apiBaseUrl = process.env.EXPO_PUBLIC_SERVER_URI;

    if (!apiBaseUrl) {
      setLoading(false);
      Toast.show(
        "Driver API URL is not configured. Please set EXPO_PUBLIC_SERVER_URI.",
        {
          placement: "bottom",
          type: "danger",
        }
      );
      return;
    }

    if (
      apiBaseUrl.includes("localhost") ||
      apiBaseUrl.includes("127.0.0.1")
    ) {
      setLoading(false);
      Toast.show(
        "EXPO_PUBLIC_SERVER_URI points to localhost. Use your computer's LAN IP when testing on a phone.",
        {
          placement: "bottom",
          type: "danger",
        }
      );
      return;
    }

    const payload = {
      name: getParamValue(driverData.name),
      country: getParamValue(driverData.country),
      phone_number: getParamValue(driverData.phone_number),
      email: getParamValue(driverData.email),
      password: getParamValue(driverData.password),
      vehicle_type: formData.vehicleType,
      registration_number: formData.registrationNumber,
      registration_date: formData.registrationDate,
      driving_license: formData.drivingLicenseNumber,
      vehicle_color: formData.color,
      rate: formData.rate,
    };

    setLoading(true);
    try {
      // Ensure API URL has the correct path
      let finalApiUrl = apiBaseUrl;
      if (!finalApiUrl.endsWith('/api/v1')) {
        // Remove trailing slash if present
        finalApiUrl = finalApiUrl.replace(/\/$/, '');
        // Add /api/v1 if not present
        if (!finalApiUrl.endsWith('/api/v1')) {
          finalApiUrl = `${finalApiUrl}/api/v1`;
        }
      }
      
      // First, test connectivity with a simple health check
      const healthEndpoint = `${finalApiUrl}/driver/health`;
      console.log("[DocumentVerification] Testing server connectivity:", healthEndpoint);
      
      try {
        const healthResponse = await axios.get(healthEndpoint, { timeout: 5000 });
        console.log("[DocumentVerification] ✅ Server is reachable:", healthResponse.data);
      } catch (healthError: any) {
        console.warn("[DocumentVerification] ⚠️ Health check failed, but continuing:", healthError?.message);
        // Continue anyway - might be a CORS issue with GET request
      }
      
      const endpoint = `${finalApiUrl}/driver/register`;
      console.log("[DocumentVerification] Submitting driver application to:", endpoint);
      console.log("[DocumentVerification] Payload (without password):", {
        name: payload.name,
        country: payload.country,
        phone_number: payload.phone_number,
        email: payload.email || "(not provided)",
        vehicle_type: payload.vehicle_type,
        registration_number: payload.registration_number,
        registration_date: payload.registration_date,
        driving_license: payload.driving_license,
        vehicle_color: payload.vehicle_color,
        rate: payload.rate,
      });
      
      const response = await axios.post(endpoint, payload, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log("[DocumentVerification] Response:", {
        status: response.status,
        success: response.data?.success,
        message: response.data?.message,
      });
      
      if (response.data?.success) {
        console.log("[DocumentVerification] Submission succeeded, showing success message");
        
        // Show popup alert with success message
        Alert.alert(
          "Application Submitted",
          "Your information has been submitted for further verification. Please wait for a call or message on WhatsApp.",
          [
            {
              text: "OK",
              onPress: () => {
                // Navigate to login screen after clicking OK
                router.replace({
                  pathname: "/(routes)/login",
                  params: { submitted: "true", phone: payload.phone_number },
                });
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        throw new Error(response.data?.message || "Submission failed");
      }
    } catch (error: any) {
      console.error("[DocumentVerification] Submission failed:", error);
      console.error("[DocumentVerification] Error details:", {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        code: error?.code,
        config: error?.config ? {
          url: error.config.url,
          method: error.config.method,
        } : null,
      });
      
      let errorMessage = "Unable to submit application. Please try again.";
      
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        if (error.message.includes('timeout') || error.code === 'ECONNABORTED') {
          errorMessage = "Connection timeout. Please check your internet connection and try again.";
        } else if (error.message.includes('Network Error') || error.code === 'ERR_NETWORK') {
          errorMessage = "Network error. Please check your internet connection and ensure the server is running.";
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = "Cannot connect to server. Please check if the server is running.";
        } else {
          errorMessage = error.message;
        }
      }
      
      Toast.show(errorMessage, {
        placement: "bottom",
        type: "danger",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: windowHeight(100) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          {/* logo */}
          <Text
            style={{
              fontFamily: "TT-Octosquares-Medium",
              fontSize: windowHeight(22),
              paddingTop: windowHeight(50),
              textAlign: "center",
            }}
          >
            Flashride
          </Text>
          <View style={{ padding: windowWidth(20) }}>
            <ProgressBar fill={2} />
            <View
              style={[styles.subView, { backgroundColor: colors.background }]}
            >
              <View style={styles.space}>
                <TitleView
                  title={"Vehicle Registration"}
                  subTitle={"Explore your life by joining Flashride"}
                />
                <SelectInput
                  title="Vehicle Type"
                  placeholder="Select your vehicle"
                  value={formData.vehicleType}
                  onValueChange={(text) => handleChange("vehicleType", text)}
                  showWarning={showWarning && formData.vehicleType === ""}
                  warning={"Please choose your vehicle type!"}
                  items={[
                    { label: "Car", value: "Car" },
                    { label: "Motorcycle", value: "Motorcycle" },
                  ]}
                />
                <Input
                  title="Registration Number"
                  placeholder="Enter your vehicle registration number"
                  keyboardType="number-pad"
                  value={formData.registrationNumber}
                  onChangeText={(text) =>
                    handleChange("registrationNumber", text)
                  }
                  showWarning={showWarning && formData.registrationNumber === ""}
                  warning={"Please enter your vehicle registration number!"}
                />
                <Input
                  title="Vehicle Registration Date"
                  placeholder="Enter your vehicle registration date"
                  value={formData.registrationDate}
                  onChangeText={(text) => handleChange("registrationDate", text)}
                  showWarning={showWarning && formData.registrationDate === ""}
                  warning={"Please enter your vehicle Registration Date number!"}
                />
                <Input
                  title={"Driving License Number"}
                  placeholder={"Enter your driving license number"}
                  keyboardType="number-pad"
                  value={formData.drivingLicenseNumber}
                  onChangeText={(text) =>
                    handleChange("drivingLicenseNumber", text)
                  }
                  showWarning={
                    showWarning && formData.drivingLicenseNumber === ""
                  }
                  warning={"Please enter your driving license number!"}
                />
                <Input
                  title={"Vehicle Color"}
                  placeholder={"Enter your vehicle color"}
                  value={formData.color}
                  onChangeText={(text) => handleChange("color", text)}
                  showWarning={showWarning && formData.color === ""}
                  warning={"Please enter your vehicle color!"}
                />
                <Input
                  title={"Rate per km"}
                  placeholder={
                    "How much you want to charge from your passenger per km."
                  }
                  keyboardType="number-pad"
                  value={formData.rate}
                  onChangeText={(text) => handleChange("rate", text)}
                  showWarning={showWarning && formData.rate === ""}
                  warning={
                    "Please enter how much you want to charge from your customer per km."
                  }
                />
              </View>
              <View style={styles.margin}>
                <Button
                  onPress={() => handleSubmit()}
                  title={loading ? "Submitting..." : "Submit"}
                  height={windowHeight(30)}
                  disabled={loading}
                  backgroundColor={color.buttonBg}
                  textColor={color.whiteColor}
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
