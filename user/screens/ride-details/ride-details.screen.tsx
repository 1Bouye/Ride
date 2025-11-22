import { View, Text, Linking, TouchableOpacity, Image, StyleSheet } from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import color from "@/themes/app.colors";
import { LinearGradient } from "expo-linear-gradient";

export default function RideDetailsScreen() {
  const { orderData: orderDataObj } = useLocalSearchParams() as any;
  const orderData = JSON.parse(orderDataObj);
  const [region, setRegion] = useState<any>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  // Map type: 'standard' | 'satellite' | 'hybrid' | 'terrain'
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid' | 'terrain'>('standard');

  useEffect(() => {
    if (orderData?.driver?.currentLocation && orderData?.driver?.marker) {
      const latitudeDelta =
        Math.abs(
          orderData.driver.marker.latitude -
            orderData.driver.currentLocation.latitude
        ) * 2;
      const longitudeDelta =
        Math.abs(
          orderData.driver.marker.longitude -
            orderData.driver.currentLocation.longitude
        ) * 2;

      setRegion({
        latitude:
          (orderData.driver.marker.latitude +
            orderData.driver.currentLocation.latitude) /
          2,
        longitude:
          (orderData.driver.marker.longitude +
            orderData.driver.currentLocation.longitude) /
          2,
        latitudeDelta: Math.max(latitudeDelta, 0.0922),
        longitudeDelta: Math.max(longitudeDelta, 0.0421),
      });
    }
  }, []);

  return (
    <View>
      <View style={{ height: windowHeight(450), position: 'relative' }}>
        <MapView
          style={{ flex: 1 }}
          region={region}
          onRegionChangeComplete={(region) => setRegion(region)}
          mapType={mapType}
        >
          {orderData?.driver?.marker && (
            <Marker coordinate={orderData?.driver?.marker} />
          )}
          {orderData?.driver?.currentLocation && (
            <Marker coordinate={orderData?.driver?.currentLocation} />
          )}
          {orderData?.driver?.currentLocation && orderData?.driver?.marker && (
            <MapViewDirections
              origin={orderData?.driver?.currentLocation}
              destination={orderData?.driver?.marker}
              apikey={process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!}
              strokeWidth={4}
              strokeColor="blue"
            />
          )}
        </MapView>
        
        {/* Map Type Toggle Button - Bottom Right */}
        <TouchableOpacity
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            backgroundColor: '#ffffff',
            borderRadius: 8,
            padding: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
            zIndex: 10,
          }}
          onPress={() => {
            // Cycle through: standard -> satellite -> hybrid -> standard
            if (mapType === 'standard') {
              setMapType('satellite');
            } else if (mapType === 'satellite') {
              setMapType('hybrid');
            } else {
              setMapType('standard');
            }
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#000' }}>
            {mapType === 'standard' ? '🗺️ Map' : mapType === 'satellite' ? '🛰️ Satellite' : '🌍 Hybrid'}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Driver Information Card */}
      <View style={styles.driverCard}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.driverCardHeader}
        >
          <View style={styles.driverHeaderContent}>
            {/* Driver Photo */}
            <View style={styles.driverPhotoContainer}>
              {orderData?.driver?.avatar ? (
                <Image
                  source={{ uri: orderData.driver.avatar }}
                  style={styles.driverPhoto}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.driverPhotoPlaceholder}>
                  <Text style={styles.driverPhotoInitials}>
                    {orderData?.driver?.name
                      ? orderData.driver.name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase()
                          .substring(0, 2)
                      : "DR"}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Driver Name and Rating */}
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {orderData?.driver?.name || "Driver"}
              </Text>
              <View style={styles.ratingContainer}>
                <Text style={styles.ratingStar}>⭐</Text>
                <Text style={styles.ratingText}>
                  {orderData?.driver?.ratings?.toFixed(1) || "5.0"}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>
        
        {/* Driver Details */}
        <View style={styles.driverDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>📱 Phone Number:</Text>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${orderData?.driver?.phone_number || ""}`)}>
              <Text style={styles.detailValueLink}>
                {orderData?.driver?.phone_number || "N/A"}
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>🚗 Vehicle Type:</Text>
            <Text style={styles.detailValue}>
              {orderData?.driver?.vehicle_type || "N/A"}
            </Text>
          </View>
          
          {orderData?.driver?.vehicle_color && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>🎨 Vehicle Color:</Text>
              <Text style={styles.detailValue}>
                {orderData.driver.vehicle_color}
              </Text>
            </View>
          )}
          
          {orderData?.driver?.registration_number && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>🔢 Registration Number:</Text>
              <Text style={styles.detailValue}>
                {orderData.driver.registration_number}
              </Text>
            </View>
          )}
          
          <View style={styles.divider} />
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>💰 Payable Amount:</Text>
            <Text style={styles.paymentAmount}>
              {Math.floor(parseFloat(orderData?.distance || "0") * parseFloat(orderData?.driver?.rate || "0"))} MRU
            </Text>
          </View>
          
          <Text style={styles.paymentNote}>
            **Pay to your driver after reaching your destination!
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  driverCard: {
    margin: windowWidth(20),
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  driverCardHeader: {
    padding: windowWidth(20),
    paddingVertical: windowHeight(20),
  },
  driverHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverPhotoContainer: {
    marginRight: windowWidth(15),
  },
  driverPhoto: {
    width: windowWidth(70),
    height: windowWidth(70),
    borderRadius: windowWidth(35),
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  driverPhotoPlaceholder: {
    width: windowWidth(70),
    height: windowWidth(70),
    borderRadius: windowWidth(35),
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  driverPhotoInitials: {
    fontSize: fontSizes.FONT24,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: fontSizes.FONT24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: windowHeight(5),
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: windowWidth(5),
  },
  ratingStar: {
    fontSize: fontSizes.FONT16,
  },
  ratingText: {
    fontSize: fontSizes.FONT16,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  driverDetails: {
    padding: windowWidth(20),
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: windowHeight(12),
  },
  detailLabel: {
    fontSize: fontSizes.FONT16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  detailValue: {
    fontSize: fontSizes.FONT16,
    fontWeight: '500',
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  detailValueLink: {
    fontSize: fontSizes.FONT16,
    fontWeight: '600',
    color: color.buttonBg,
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginVertical: windowHeight(15),
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: windowHeight(10),
  },
  paymentLabel: {
    fontSize: fontSizes.FONT18,
    fontWeight: '600',
    color: '#333',
  },
  paymentAmount: {
    fontSize: fontSizes.FONT20,
    fontWeight: '700',
    color: color.buttonBg,
  },
  paymentNote: {
    fontSize: fontSizes.FONT12,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: windowHeight(5),
  },
});
