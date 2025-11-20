import { View, Text, Image, TouchableOpacity, TextInput } from "react-native";
import React, { useEffect, useState } from "react";
import AuthContainer from "@/utils/container/auth-container";
import { windowHeight, windowWidth } from "@/themes/app.constant";
import styles from "./styles";
import Images from "@/utils/images";
import SignInText from "@/components/login/signin.text";
import { external } from "@/styles/external.style";
import Button from "@/components/common/button";
import Input from "@/components/common/input";
import { router, useLocalSearchParams } from "expo-router";
import { Toast } from "react-native-toast-notifications";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
 
export default function LoginScreen() {
  const params = useLocalSearchParams();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  // Validate Mauritanian phone number (expects 8 digits, +222 is added automatically)
  const validateMauritanianPhone = (phone: string): boolean => {
    // Phone should be exactly 8 digits
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length === 8 && /^\d{8}$/.test(digitsOnly);
  };

  // Handle phone number input - only digits, max 8
  const handlePhoneChange = (text: string) => {
    // Remove any non-digit characters
    let digitsOnly = text.replace(/\D/g, '');
    // Remove "222" if user tries to type it at the beginning (country code)
    if (digitsOnly.startsWith('222')) {
      digitsOnly = digitsOnly.substring(3);
    }
    // Limit to 8 digits
    const limitedDigits = digitsOnly.slice(0, 8);
    setPhoneNumber(limitedDigits);
    
    // Clear error if user is typing
    if (phoneError) {
      setPhoneError("");
    }
    
    // Validate in real-time
    if (limitedDigits.length > 0 && limitedDigits.length < 8) {
      setPhoneError("Phone number must be 8 digits");
    } else if (limitedDigits.length > 8) {
      setPhoneError("Phone number should be 8 digits");
    } else {
      setPhoneError("");
    }
  };

  useEffect(() => {
    if (params?.submitted) {
      Toast.show("Application submitted. We will notify you once approved.", {
        placement: "bottom",
      });
    }
    if (params?.phone) {
      const value = Array.isArray(params.phone)
        ? params.phone[0]
        : (params.phone as string);
      if (value) {
        // Extract only the 8 digits if full phone number is passed
        const digitsOnly = value.replace(/\D/g, '').replace(/^222/, '');
        setPhoneNumber(digitsOnly.slice(0, 8));
      }
    }
  }, [params?.submitted, params?.phone]);

  const handleSubmit = async () => {
    if (!phoneNumber.trim() || !password.trim()) {
      Toast.show("Phone number and password are required.", {
        placement: "bottom",
      });
      return;
    }

    // Validate Mauritanian phone number (should be 8 digits)
    if (!validateMauritanianPhone(phoneNumber.trim())) {
      setPhoneError("Please enter a valid phone number (8 digits)");
      Toast.show("Phone number must be 8 digits", {
        type: "danger",
        placement: "bottom",
      });
      return;
    }

    setPhoneError("");
    setLoading(true);
    try {
      // Automatically add +222 prefix
      const fullPhoneNumber = `+222${phoneNumber.trim()}`;
      const response = await axios.post(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/login`,
        {
          phone_number: fullPhoneNumber,
          password,
        }
      );

      await AsyncStorage.setItem("accessToken", response.data.accessToken);
      router.replace("/(tabs)/home");
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        "Unable to sign in. Please check your credentials.";
      Toast.show(message, {
        type: "danger",
        placement: "bottom",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      topSpace={windowHeight(150)}
      imageShow={true}
      container={
        <View>
          <View>
            <View>
              <Image style={styles.transformLine} source={Images.line} />
              <SignInText />
              <View style={[external.mt_25, external.Pb_10]}>
                <View style={[external.mt_5]}>
                  <Input
                    title="Phone Number"
                    placeholder="Enter 8 digits"
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={handlePhoneChange}
                    showWarning={!!phoneError}
                    warning={phoneError}
                    required={true}
                    prefix="+222"
                  />
                </View>
                <View style={[external.mt_15]}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Enter your password"
                    placeholderTextColor="#9BA6B8"
                    secureTextEntry={!isPasswordVisible}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setIsPasswordVisible((prev) => !prev)}
                    style={{ alignSelf: "flex-end", marginTop: 6 }}
                  >
                    <Text style={{ color: "#665CFF", fontSize: windowHeight(11) }}>
                      {isPasswordVisible ? "Hide password" : "Show password"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={[external.mt_25, external.Pb_15]}>
                  <Button
                    title={loading ? "Signing In..." : "Sign In"}
                    disabled={loading}
                    height={windowHeight(35)}
                    onPress={() => handleSubmit()}
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: windowWidth(8),
                    paddingBottom: windowHeight(15),
                  }}
                >
                  <Text style={{ fontSize: windowHeight(12) }}>
                    Don't have any rider account?
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/(routes)/signup")}
                  >
                    <Text style={{ color: "blue", fontSize: windowHeight(12) }}>
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      }
    />
  );
}
