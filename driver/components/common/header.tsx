import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import React from "react";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import color from "@/themes/app.colors";
import fonts from "@/themes/app.fonts";
import SwitchToggle from "react-native-switch-toggle";
import { Notification } from "@/utils/icons";

interface HeaderProps {
  isOn: boolean;
  toggleSwitch: () => void;
  walletBalance?: number;
  isBlocked?: boolean;
}

export default function Header({ isOn, toggleSwitch, walletBalance = 0, isBlocked = false }: HeaderProps) {
  return (
    <View style={styles.headerMain}>
      <View style={styles.headerMargin}>
        <View
          style={[
            styles.headerAlign,
            {
              alignItems: "center",
              paddingTop: windowHeight(3),
              flexDirection: "row",
            },
          ]}
        >
          <View style={[styles.headerTitle]}>
            <Text
              style={{
                fontFamily: "TT-Octosquares-Medium",
                fontSize: windowHeight(22),
                color: "#fff",
                textAlign: "left",
              }}
            >
              Flashride
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: windowWidth(8) }}>
            {/* Wallet Balance Display */}
            <View style={styles.walletContainer}>
              <Text style={styles.walletLabel}>Wallet</Text>
              <Text style={styles.walletAmount}>
                {walletBalance.toFixed(2)} MRU
              </Text>
            </View>
            <TouchableOpacity style={styles.notificationIcon} activeOpacity={0.5}>
              <Notification color={color.whiteColor} />
            </TouchableOpacity>
          </View>
        </View>
        <View
          style={[
            styles.switchContainer,
            { backgroundColor: "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: windowWidth(8) },
          ]}
        >
          <Text style={[styles.switchLabel, { color: "#fff", opacity: isBlocked ? 0.5 : 1 }]}>
            {isOn ? "On" : "Off"}
          </Text>
          <View style={[styles.switchBorder, { opacity: isBlocked ? 0.5 : 1 }]}>
            <SwitchToggle
              switchOn={isOn}
              onPress={isBlocked ? () => {} : toggleSwitch}
              containerStyle={styles.switchView}
              circleStyle={styles.switchCircle}
              backgroundColorOff="#ef4444"
              backgroundColorOn="#22c55e"
              circleColorOn="#ffffff"
              circleColorOff="#ffffff"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerMain: {
    backgroundColor: color.primary,
    paddingHorizontal: windowWidth(10),
    paddingTop: windowHeight(25),
    width: "100%",
    height: windowHeight(115),
  },
  walletContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: windowWidth(12),
    paddingVertical: windowHeight(4),
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  walletLabel: {
    fontSize: fontSizes.FONT10,
    color: "#fff",
    fontFamily: fonts.medium,
    opacity: 0.9,
  },
  walletAmount: {
    fontSize: fontSizes.FONT14,
    color: "#fff",
    fontFamily: fonts.bold,
    fontWeight: "700",
  },
  logoTitle: {
    fontSize: fontSizes.FONT18,
    fontFamily: fonts.bold,
    color: color.whiteColor,
  },
  headerMargin: {
    marginHorizontal: windowWidth(10),
    marginTop: windowHeight(10),
  },
  headerAlign: {
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    alignItems: "center",
  },
  notificationIcon: {
    height: windowHeight(15),
    width: windowWidth(40),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: "#675fd800",
    borderColor: color.buttonBg,
  },
  switchContainer: {
    height: windowHeight(28),
    width: "100%",
    marginVertical: windowHeight(5),
    justifyContent: "center",
    alignItems: "center",
  },
  switchLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.FONT16,
    fontWeight: "600",
  },
  valueTitle: {
    fontFamily: fonts.medium,
  },
  switchBorder: {
    height: windowHeight(20),
    width: windowHeight(45),
    borderWidth: 2,
    borderRadius: 25,
    borderColor: color.linearBorder,
  },
  switchView: {
    height: windowHeight(20),
    width: windowWidth(55),
    borderRadius: 25,
    padding: windowWidth(8),
    borderColor: color.buttonBg,
  },
  switchCircle: {
    height: windowHeight(15),
    width: windowWidth(25),
    borderRadius: 20,
  },
});
