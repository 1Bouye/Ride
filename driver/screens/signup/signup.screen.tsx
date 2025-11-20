import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import React, { useState } from "react";
import { windowHeight, windowWidth } from "@/themes/app.constant";
import ProgressBar from "@/components/common/progress.bar";
import styles from "./styles";
import { useTheme } from "@react-navigation/native";
import TitleView from "@/components/signup/title.view";
import Input from "@/components/common/input";
import Button from "@/components/common/button";
import color from "@/themes/app.colors";
import { router } from "expo-router";
import { Toast } from "react-native-toast-notifications";

export default function SignupScreen() {
  const { colors } = useTheme();
  const [showWarning, setShowWarning] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phoneNumber: "",
    email: "",
    country: "Mauritania 🇲🇷", // Fixed to Mauritania only
    password: "",
    confirmPassword: "",
  });

  const handleChange = (key: string, value: string) => {
    setFormData((prevData) => ({
      ...prevData,
      [key]: value,
    }));
  };

  const gotoDocument = () => {
    // Validate required fields: name, phone number, password, confirm password
    // Email is optional
    const errors: string[] = [];
    
    if (!formData.name.trim()) {
      errors.push("Name");
    }
    if (!formData.phoneNumber.trim()) {
      errors.push("Phone Number");
    }
    if (!formData.password) {
      errors.push("Password");
    }
    if (!formData.confirmPassword) {
      errors.push("Confirm Password");
    }

    if (errors.length > 0) {
      setShowWarning(true);
      Toast.show(`Please fill in all required fields: ${errors.join(", ")}`, {
        placement: "bottom",
        type: "danger",
      });
      return;
    }

    if (formData.password.length < 6) {
      Toast.show("Password must be at least 6 characters long.", {
        placement: "bottom",
        type: "danger",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      Toast.show("Passwords do not match.", {
        placement: "bottom",
        type: "danger",
      });
      return;
    }

    setShowWarning(false);

    // Phone number already has only digits (prefix is handled in Input component)
    // Automatically prepend +222
    const phone_number = `+222${formData.phoneNumber.trim()}`;

    const driverData = {
      name: formData.name.trim(),
      country: "Mauritania", // Always Mauritania
      phone_number,
      email: formData.email.trim() || "", // Optional - can be empty
      password: formData.password,
    };
    router.push({
      pathname: "/(routes)/document-verification",
      params: driverData,
    });
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
            <ProgressBar fill={1} />
            <View
              style={[styles.subView, { backgroundColor: colors.background }]}
            >
              <View style={styles.space}>
                <TitleView
                  title={"Create your account"}
                  subTitle={"Explore your life by joining Flashride"}
                />
                <Input
                  title="Name"
                  placeholder="Enter your name"
                  value={formData.name}
                  onChangeText={(text) => handleChange("name", text)}
                  showWarning={showWarning && !formData.name.trim()}
                  warning={"Please enter your name!"}
                  required={true}
                />
                <Input
                  title="Country"
                  placeholder="Mauritania"
                  value="Mauritania"
                  onChangeText={() => {}} // Disabled - no changes allowed
                  disabled={true}
                />
                <Input
                  title="Phone Number"
                  placeholder="Enter 8 digits"
                  keyboardType="phone-pad"
                  value={formData.phoneNumber}
                  onChangeText={(text) => handleChange("phoneNumber", text)}
                  showWarning={showWarning && !formData.phoneNumber.trim()}
                  warning={"Please enter your phone number (8 digits)!"}
                  required={true}
                  prefix="+222"
                />
                <Input
                  title={"Email Address (Optional)"}
                  placeholder={"Enter your email address (optional)"}
                  keyboardType="email-address"
                  value={formData.email}
                  onChangeText={(text) => handleChange("email", text)}
                  showWarning={false}
                  warning={""}
                />
                <Input
                  title="Password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChangeText={(text) => handleChange("password", text)}
                  showWarning={showWarning && !formData.password}
                  warning={"Please create a password!"}
                  secureTextEntry={true}
                  showPasswordToggle={true}
                  required={true}
                />
                <Input
                  title="Confirm Password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChangeText={(text) =>
                    handleChange("confirmPassword", text)
                  }
                  showWarning={showWarning && !formData.confirmPassword}
                  warning={"Please confirm your password!"}
                  secureTextEntry={true}
                  showPasswordToggle={true}
                  required={true}
                />
              </View>
              <View style={styles.margin}>
                <Button
                  onPress={gotoDocument}
                  height={windowHeight(30)}
                  title={"Next"}
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
