import { View, Text, Linking, TouchableOpacity } from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import color from "@/themes/app.colors";

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
      <View style={{ padding: windowWidth(20) }}>
        <Text
          style={{
            fontSize: fontSizes.FONT20,
            fontWeight: "500",
            paddingVertical: windowHeight(5),
          }}
        >
          Driver Name: {orderData?.driver?.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontSize: fontSizes.FONT20,
              fontWeight: "500",
              paddingVertical: windowHeight(5),
            }}
          >
            Phone Number:
          </Text>
          <Text
            style={{
              color: color.buttonBg,
              paddingLeft: 5,
              fontSize: fontSizes.FONT20,
              fontWeight: "500",
              paddingVertical: windowHeight(5),
            }}
            onPress={() =>
              Linking.openURL(`tel:${orderData?.driver?.phone_number}`)
            }
          >
            {orderData?.driver?.phone_number}
          </Text>
        </View>
        <Text style={{ fontSize: fontSizes.FONT20, fontWeight: "500" }}>
          {orderData?.driver?.vehicle_type} Color:{" "}
          {orderData?.driver?.vehicle_color}
        </Text>
        <Text
          style={{
            fontSize: fontSizes.FONT20,
            fontWeight: "500",
            paddingVertical: windowHeight(5),
          }}
        >
          Payable amount:{" "}
          {(
            orderData.driver?.distance * parseInt(orderData?.driver?.rate)
          ).toFixed(2)}{" "}
          MRU
        </Text>
        <Text
          style={{
            fontSize: fontSizes.FONT14,
            fontWeight: "400",
            paddingVertical: windowHeight(5),
          }}
        >
          **Pay to your driver after reaching to your destination!
        </Text>
      </View>
    </View>
  );
}
