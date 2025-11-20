import { View, Text, StyleSheet } from "react-native";
import React from "react";
import { useTheme } from "@react-navigation/native";
import fonts from "@/themes/app.fonts";
import { windowHeight, windowWidth } from "@/themes/app.constant";
import color from "@/themes/app.colors";
import RNPickerSelect from "react-native-picker-select";

interface InputProps {
  title?: string;
  placeholder: string;
  items: { label: string; value: string }[];
  value?: string;
  warning?: string;
  onValueChange: (value: string) => void;
  showWarning?: boolean;
}

export default function SelectInput({
  title,
  placeholder,
  items,
  value,
  warning,
  onValueChange,
  showWarning,
}: InputProps) {
  const { colors } = useTheme();
  return (
    <View>
      {title && (
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      )}
      <RNPickerSelect
        onValueChange={onValueChange}
        items={items}
        placeholder={{
          label: placeholder,
          value: null,
          color: '#9BA6B8',
        }}
        style={{
          inputIOS: {
            ...styles.input,
            backgroundColor: color.lightGray,
            borderColor: colors.border,
            height: windowHeight(45),
            width: "100%",
            paddingLeft: windowWidth(15),
            paddingRight: windowWidth(40),
            paddingTop: windowHeight(12),
            paddingBottom: windowHeight(12),
            fontSize: windowWidth(16),
            color: value && value.trim() !== "" ? color.secondaryFont : '#9BA6B8',
          },
          inputAndroid: {
            ...styles.input,
            backgroundColor: color.lightGray,
            borderColor: colors.border,
            height: windowHeight(45),
            width: "100%",
            paddingLeft: windowWidth(15),
            paddingRight: windowWidth(40),
            paddingTop: windowHeight(12),
            paddingBottom: windowHeight(12),
            fontSize: windowWidth(16),
            color: value && value.trim() !== "" ? color.secondaryFont : '#9BA6B8',
          },
          placeholder: {
            color: '#9BA6B8',
            fontSize: windowWidth(16),
          },
        }}
        value={value && value.trim() !== "" ? value : null}
      />
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
  input: {
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 5,
    height: windowHeight(45),
    width: "100%",
    color: color.secondaryFont,
    paddingLeft: windowWidth(15),
    paddingRight: windowWidth(40),
    paddingTop: windowHeight(12),
    paddingBottom: windowHeight(12),
    fontSize: windowWidth(16),
  },
  warning: {
    color: color.red,
    marginTop: 3,
  },
});
