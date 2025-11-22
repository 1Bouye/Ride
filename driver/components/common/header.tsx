import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import React from "react";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import color from "@/themes/app.colors";
import fonts from "@/themes/app.fonts";
import SwitchToggle from "react-native-switch-toggle";
import { Notification } from "@/utils/icons";
import { LinearGradient } from "expo-linear-gradient";

interface HeaderProps {
  isOn: boolean;
  toggleSwitch: () => void;
  walletBalance?: number;
  isBlocked?: boolean;
}

export default function Header({ isOn, toggleSwitch, walletBalance = 0, isBlocked = false }: HeaderProps) {
  return (
    <LinearGradient
      colors={['#667eea', '#764ba2', '#f093fb']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.headerMain}
    >
      {/* Shiny overlay effect */}
      <View style={styles.shinyOverlay} />
      
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
          <View style={styles.headerTitle}>
            {/* Logo with shine effect */}
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>🚗</Text>
              <View style={styles.logoShine} />
            </View>
            <Text style={styles.companyName}>
              Flashride
            </Text>
          </View>
          
          {/* Switch Button - Moved to top row */}
          <View style={[styles.switchContainerTop, { opacity: isBlocked ? 0.5 : 1 }]}>
            <View style={styles.switchBorder}>
              <LinearGradient
                colors={isOn ? ['#22c55e', '#16a34a'] : ['#ef4444', '#dc2626']}
                style={styles.switchGradient}
              >
                <SwitchToggle
                  switchOn={isOn}
                  onPress={isBlocked ? () => {} : toggleSwitch}
                  containerStyle={styles.switchView}
                  circleStyle={isOn ? {...styles.switchCircle, ...styles.switchCircleActive} : styles.switchCircle}
                  backgroundColorOff="transparent"
                  backgroundColorOn="transparent"
                  circleColorOn="#ffffff"
                  circleColorOff="#ffffff"
                />
              </LinearGradient>
            </View>
            <Text style={[styles.switchLabelTop, { color: "#fff" }]}>
              {isOn ? "🟢" : "🔴"}
            </Text>
          </View>
          
          <View style={{ flexDirection: "row", alignItems: "center", gap: windowWidth(8) }}>
            {/* Wallet Balance Display - Enhanced with beautiful gradient */}
            <LinearGradient
              colors={['#FFD700', '#FFA500', '#FF8C00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.walletContainer}
            >
              <View style={styles.walletInner}>
                <Text style={styles.walletLabel}>💰 Wallet</Text>
                <Text style={styles.walletAmount}>
                  {Math.floor(walletBalance)} MRU
                </Text>
              </View>
            </LinearGradient>
            <TouchableOpacity style={styles.notificationIcon} activeOpacity={0.7}>
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.15)']}
                style={styles.notificationGradient}
              >
                <Notification color={color.whiteColor} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  headerMain: {
    paddingHorizontal: windowWidth(10),
    paddingTop: windowHeight(20),
    width: "100%",
    height: windowHeight(110),
    position: "relative",
    overflow: "hidden",
  },
  shinyOverlay: {
    position: "absolute",
    top: -50,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    transform: [{ rotate: "45deg" }],
  },
  walletContainer: {
    paddingHorizontal: windowWidth(14),
    paddingVertical: windowHeight(8),
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  walletInner: {
    alignItems: "center",
  },
  walletLabel: {
    fontSize: fontSizes.FONT10,
    color: "#fff",
    fontFamily: fonts.bold,
    fontWeight: "700",
    marginBottom: 3,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  walletAmount: {
    fontSize: fontSizes.FONT16,
    color: "#fff",
    fontFamily: fonts.bold,
    fontWeight: "800",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  logoTitle: {
    fontSize: fontSizes.FONT18,
    fontFamily: fonts.bold,
    color: color.whiteColor,
  },
  headerMargin: {
    marginHorizontal: windowWidth(10),
    marginTop: windowHeight(5),
  },
  headerAlign: {
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    alignItems: "flex-start",
  },
  logoContainer: {
    position: "relative",
    marginBottom: windowHeight(4),
  },
  logoText: {
    fontSize: windowHeight(32),
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  logoShine: {
    position: "absolute",
    top: -5,
    left: -5,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    transform: [{ scale: 1.2 }],
  },
  companyName: {
    fontFamily: "TT-Octosquares-Medium",
    fontSize: windowHeight(26),
    color: "#fff",
    textAlign: "left",
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  notificationIcon: {
    height: windowHeight(15),
    width: windowWidth(40),
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  notificationGradient: {
    height: "100%",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  switchContainerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: windowWidth(6),
    marginHorizontal: windowWidth(8),
  },
  switchLabelTop: {
    fontSize: fontSizes.FONT14,
    fontWeight: "600",
  },
  switchContainer: {
    height: windowHeight(40),
    width: "100%",
    marginTop: windowHeight(10),
    marginBottom: windowHeight(5),
    justifyContent: "center",
    alignItems: "center",
  },
  statusContainer: {
    alignItems: "center",
  },
  switchLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.FONT16,
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statusSubtext: {
    fontSize: fontSizes.FONT10,
    color: "#fff",
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  valueTitle: {
    fontFamily: fonts.medium,
  },
  switchBorder: {
    height: windowHeight(22),
    width: windowHeight(50),
    borderRadius: 25,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  switchGradient: {
    height: "100%",
    width: "100%",
    borderRadius: 30,
  },
  switchView: {
    height: windowHeight(18),
    width: windowWidth(45),
    borderRadius: 22,
    padding: windowWidth(2),
  },
  switchCircle: {
    height: windowHeight(16),
    width: windowWidth(20),
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  switchCircleActive: {
    shadowColor: "#22c55e",
    shadowOpacity: 0.5,
  },
});
