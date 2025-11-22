import { View, Text, StyleSheet } from "react-native";
import React from "react";
import { rideIcons } from "@/configs/constants";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import color from "@/themes/app.colors";
import { useGetDriverData } from "@/hooks/useGetDriverData";
import { LinearGradient } from "expo-linear-gradient";

export default function RenderRideItem({ item, colors }: any) {
  const { driver } = useGetDriverData();
  // Map item IDs to icon indices: id "1" -> index 0, id "2" -> index 1, id "4" -> index 2
  const iconIndexMap: { [key: string]: number } = {
    "1": 0, // Total Earning -> Wallet
    "2": 1, // Complete Ride -> SmartCar
    "4": 2, // Cancel Ride -> Driving
  };
  const iconIndex = iconIndexMap[item.id] ?? 0;
  const icon = rideIcons[iconIndex];

  // Define gradient colors for each card type
  const getGradientColors = (): [string, string] => {
    switch (item.title) {
      case "Total Earning":
        return ['#667eea', '#764ba2'];
      case "Complete Ride":
        return ['#f093fb', '#f5576c'];
      case "Cancel Ride":
        return ['#fa709a', '#fee140'];
      default:
        return ['#667eea', '#764ba2'];
    }
  };

  const gradientColors = getGradientColors();
  const value = item.title === "Total Earning"
    ? Math.floor(driver?.totalEarning || 0) + " MRU"
    : item.title === "Complete Ride"
    ? driver?.totalRides
    : item.title === "Cancel Ride"
    ? driver?.cancelRides
    : 0;

  return (
    <View style={styles.main}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Shiny overlay effect */}
        <View style={styles.shinyOverlay} />
        
        {/* Card content */}
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <View style={styles.valueContainer}>
              <Text style={styles.data}>
                {value}
              </Text>
            </View>
            <View style={styles.iconContain}>
              <View style={styles.iconBackground}>
                {icon}
              </View>
            </View>
          </View>
          <View style={styles.cardBottom}>
            <View>
              <Text style={styles.title}>
                {item.title}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Bottom accent line */}
        <View style={styles.bottomAccent} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    marginVertical: windowHeight(8),
    marginHorizontal: windowWidth(12),
  },
  card: {
    minHeight: windowHeight(110),
    height: "auto",
    width: windowWidth(205),
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  shinyOverlay: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    transform: [{ rotate: "45deg" }],
  },
  cardContent: {
    padding: windowWidth(16),
    flex: 1,
    justifyContent: "space-between",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: windowHeight(8),
  },
  valueContainer: {
    flex: 1,
  },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: windowHeight(8),
  },
  data: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: fontSizes.FONT24,
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  iconContain: {
    height: windowHeight(50),
    width: windowWidth(50),
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: windowWidth(8),
  },
  iconBackground: {
    height: windowHeight(45),
    width: windowWidth(45),
    borderRadius: 22.5,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  title: {
    width: windowWidth(120),
    fontSize: fontSizes.FONT18,
    fontWeight: "600",
    color: "#ffffff",
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    letterSpacing: 0.3,
  },
  bottomAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: windowHeight(5),
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
});
