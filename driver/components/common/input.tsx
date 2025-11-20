import {
  View,
  Text,
  KeyboardTypeOptions,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "@react-navigation/native";
import fonts from "@/themes/app.fonts";
import { windowHeight, windowWidth } from "@/themes/app.constant";
import color from "@/themes/app.colors";
import React, { useState } from "react";

interface InputProps {
  title: string;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
  value?: string;
  warning?: string;
  onChangeText?: (text: string) => void;
  showWarning?: boolean;
  emailFormatWarning?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  required?: boolean; // Add required prop to show asterisk
  showPasswordToggle?: boolean; // Add prop to enable password visibility toggle
  prefix?: string; // Add prefix prop for country code or other prefixes
}

export default function Input({
  title,
  placeholder,
  keyboardType,
  value,
  warning,
  onChangeText,
  showWarning,
  emailFormatWarning,
  disabled,
  secureTextEntry,
  required = false,
  showPasswordToggle = false,
  prefix,
}: InputProps) {
  const { colors } = useTheme();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // If showPasswordToggle is true, override secureTextEntry based on visibility state
  const shouldHideText = showPasswordToggle ? !isPasswordVisible : secureTextEntry;

  // Handle phone number input - only allow digits, limit to 8 digits
  // Remove country code "222" if user tries to type it
  const handlePhoneNumberChange = (text: string) => {
    if (prefix && onChangeText) {
      // Remove any non-digit characters
      let digitsOnly = text.replace(/\D/g, '');
      // Remove "222" if user tries to type it at the beginning (country code)
      if (digitsOnly.startsWith('222')) {
        digitsOnly = digitsOnly.substring(3);
      }
      // Limit to 8 digits (Mauritanian phone number format)
      const limitedDigits = digitsOnly.slice(0, 8);
      onChangeText(limitedDigits);
    } else if (onChangeText) {
      onChangeText(text);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {required && (
          <Text style={[styles.asterisk, { color: color.red }]}> *</Text>
        )}
      </View>
      {prefix ? (
        // Two separate boxes: one for prefix, one for phone number
        <View style={styles.phoneInputContainer}>
          <View style={[styles.prefixBox, { borderColor: colors.border }]}>
            <Text style={styles.prefixText}>{prefix}</Text>
          </View>
          <TextInput
            style={[
              styles.phoneInput,
              {
                backgroundColor: disabled ? color.lightGray : color.lightGray,
                borderColor: colors.border,
                opacity: disabled ? 0.7 : 1,
              },
            ]}
            placeholder={placeholder}
            placeholderTextColor={color.secondaryFont}
            keyboardType={keyboardType}
            value={value}
            editable={!disabled}
            onChangeText={handlePhoneNumberChange}
            maxLength={8}
          />
        </View>
      ) : (
        // Regular input without prefix
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: disabled ? color.lightGray : color.lightGray,
                borderColor: colors.border,
                opacity: disabled ? 0.7 : 1,
                paddingRight: showPasswordToggle ? windowWidth(45) : windowWidth(15),
              },
            ]}
            placeholder={placeholder}
            placeholderTextColor={color.secondaryFont}
            keyboardType={keyboardType}
            value={value}
            editable={!disabled}
            onChangeText={onChangeText}
            secureTextEntry={shouldHideText}
          />
          {showPasswordToggle && (
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setIsPasswordVisible(!isPasswordVisible)}
              activeOpacity={0.7}
            >
              <Text style={styles.eyeIconText}>
                {isPasswordVisible ? "👁️" : "👁️‍🗨️"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {showWarning && <Text style={[styles.warning]}>{warning}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.medium,
    fontSize: windowWidth(20),
    marginVertical: windowHeight(8),
  },
  inputContainer: {
    position: "relative",
    width: "100%",
  },
  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: windowWidth(10),
    marginBottom: 5,
  },
  prefixBox: {
    borderRadius: 5,
    borderWidth: 1,
    height: windowHeight(35),
    width: windowWidth(70),
    backgroundColor: color.lightGray,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.7,
  },
  prefixText: {
    fontSize: windowWidth(16),
    color: color.secondaryFont,
    fontWeight: "500",
  },
  phoneInput: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    height: windowHeight(35),
    color: color.secondaryFont,
    paddingHorizontal: windowWidth(15),
    fontSize: windowWidth(16),
  },
  input: {
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 5,
    height: windowHeight(35),
    width: "100%",
    color: color.secondaryFont,
    paddingLeft: windowWidth(15),
    fontSize: windowWidth(16),
  },
  eyeIcon: {
    position: "absolute",
    right: windowWidth(15),
    top: windowHeight(8),
    padding: windowWidth(5),
    zIndex: 1,
  },
  eyeIconText: {
    fontSize: windowWidth(18),
  },
  warning: {
    color: color.red,
    marginTop: 3,
  },
  asterisk: {
    fontSize: windowWidth(20),
    fontWeight: "bold",
  },
});
