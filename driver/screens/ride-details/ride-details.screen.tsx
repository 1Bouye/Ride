import { View, Text, Linking, TouchableOpacity } from "react-native";
import React, { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import color from "@/themes/app.colors";
import Button from "@/components/common/button";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Toast } from "react-native-toast-notifications";
import * as GeoLocation from "expo-location";

export default function RideDetailsScreen() {
  const { orderData: orderDataObj } = useLocalSearchParams() as any;
  const [orderStatus, setorderStatus] = useState("Processing");
  const orderData = JSON.parse(orderDataObj);
  const [region, setRegion] = useState<any>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  // Map type: 'standard' | 'satellite' | 'hybrid' | 'terrain'
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid' | 'terrain'>('standard');
  // Driver's current location
  // Use driver location from orderData if available (passed from home screen), otherwise fetch it
  const [driverLocation, setDriverLocation] = useState<any>(
    orderData?.driverLocation || null
  );

  // Get driver's current location and keep it updated (especially important after pickup)
  useEffect(() => {
    // If driver location was already passed, use it initially
    if (orderData?.driverLocation) {
      console.log("[RideDetails] Using driver location from orderData:", orderData.driverLocation);
      setDriverLocation(orderData.driverLocation);
    }
    
    // Always set up location tracking to keep driver location updated
    (async () => {
      try {
        const { status } = await GeoLocation.requestForegroundPermissionsAsync();
        if (status === "granted") {
          // Get initial location
          const location = await GeoLocation.getCurrentPositionAsync({
            accuracy: GeoLocation.Accuracy.Balanced,
          });
          const { latitude, longitude } = location.coords;
          setDriverLocation({ latitude, longitude });
          console.log("[RideDetails] Got driver location:", { latitude, longitude });
          
          // Watch position to keep driver location updated (especially after pickup)
          const subscription = await GeoLocation.watchPositionAsync(
            {
              accuracy: GeoLocation.Accuracy.Balanced,
              timeInterval: 5000, // Update every 5 seconds
              distanceInterval: 10, // Or when moved 10 meters
            },
            (position) => {
              const { latitude, longitude } = position.coords;
              setDriverLocation({ latitude, longitude });
              console.log("[RideDetails] Driver location updated:", { latitude, longitude });
            }
          );
          
          // Cleanup subscription on unmount
          return () => {
            if (subscription) {
              subscription.remove();
            }
          };
        }
      } catch (error) {
        console.error("[RideDetails] Failed to get/update driver location:", error);
      }
    })();
  }, []);

  // Initialize status and region on mount
  // Show pickup location immediately, even if driver location isn't ready yet
  useEffect(() => {
    const status = orderData?.rideData?.status || "Processing";
    setorderStatus(status);
    
    // Always show pickup location immediately
    if (orderData?.currentLocation) {
      if (status === "Processing") {
        // Before pickup: Show pickup location immediately, adjust when driver location is available
        if (driverLocation) {
          // Calculate region to show both points
          const latitudeDelta = Math.abs(
            driverLocation.latitude - orderData.currentLocation.latitude
          ) * 2.2;
          const longitudeDelta = Math.abs(
            driverLocation.longitude - orderData.currentLocation.longitude
          ) * 2.2;
          
          setRegion({
            latitude: (driverLocation.latitude + orderData.currentLocation.latitude) / 2,
            longitude: (driverLocation.longitude + orderData.currentLocation.longitude) / 2,
            latitudeDelta: Math.max(latitudeDelta, 0.0922),
            longitudeDelta: Math.max(longitudeDelta, 0.0421),
          });
        } else {
          // Show pickup location immediately (driver location will be fetched)
          setRegion({
            latitude: orderData.currentLocation.latitude,
            longitude: orderData.currentLocation.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          });
        }
      } else if (status === "Ongoing") {
        // After pickup: Show both pickup and destination
        if (orderData?.currentLocation && orderData?.marker) {
          const latitudeDelta = Math.abs(
            orderData.currentLocation.latitude - orderData.marker.latitude
          ) * 2.2;
          const longitudeDelta = Math.abs(
            orderData.currentLocation.longitude - orderData.marker.longitude
          ) * 2.2;
          
          setRegion({
            latitude: (orderData.currentLocation.latitude + orderData.marker.latitude) / 2,
            longitude: (orderData.currentLocation.longitude + orderData.marker.longitude) / 2,
            latitudeDelta: Math.max(latitudeDelta, 0.0922),
            longitudeDelta: Math.max(longitudeDelta, 0.0421),
          });
        } else if (orderData?.marker) {
          setRegion({
            latitude: orderData.marker.latitude,
            longitude: orderData.marker.longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          });
        }
      }
    }
  }, [driverLocation, orderData]); // Run when driver location is available or orderData changes

  // Update region when orderStatus changes
  useEffect(() => {
    console.log(`[RideDetails] Status changed to: ${orderStatus}`);
    
    if (orderStatus === "Processing") {
      // Before pickup: Show both driver location and pickup location
      if (orderData?.currentLocation && driverLocation) {
        // Calculate region to show both points
        const latitudeDelta = Math.abs(
          driverLocation.latitude - orderData.currentLocation.latitude
        ) * 2.2;
        const longitudeDelta = Math.abs(
          driverLocation.longitude - orderData.currentLocation.longitude
        ) * 2.2;
        
        setRegion({
          latitude: (driverLocation.latitude + orderData.currentLocation.latitude) / 2,
          longitude: (driverLocation.longitude + orderData.currentLocation.longitude) / 2,
          latitudeDelta: Math.max(latitudeDelta, 0.0922),
          longitudeDelta: Math.max(longitudeDelta, 0.0421),
        });
      } else if (orderData?.currentLocation) {
        // Fallback: just show pickup location if driver location not available
        setRegion({
          latitude: orderData.currentLocation.latitude,
          longitude: orderData.currentLocation.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
      }
    } else if (orderStatus === "Ongoing") {
      // After pickup: Show driver's current location and destination
      console.log(`[RideDetails] Status is Ongoing, updating region to show driver location and destination`);
      if (driverLocation && orderData?.marker) {
        // Calculate region to show driver's current location and destination
        const latitudeDelta = Math.abs(
          driverLocation.latitude - orderData.marker.latitude
        ) * 2.2;
        const longitudeDelta = Math.abs(
          driverLocation.longitude - orderData.marker.longitude
        ) * 2.2;
        
        const newRegion = {
          latitude: (driverLocation.latitude + orderData.marker.latitude) / 2,
          longitude: (driverLocation.longitude + orderData.marker.longitude) / 2,
          latitudeDelta: Math.max(latitudeDelta, 0.0922),
          longitudeDelta: Math.max(longitudeDelta, 0.0421),
        };
        
        console.log(`[RideDetails] Setting region for Ongoing status (driver to destination):`, newRegion);
        setRegion(newRegion);
      } else if (orderData?.marker) {
        // Fallback: just show destination if driver location not available yet
        console.log(`[RideDetails] Only destination available, showing destination`);
        setRegion({
          latitude: orderData.marker.latitude,
          longitude: orderData.marker.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
      } else {
        console.warn(`[RideDetails] Missing location data for Ongoing status`);
      }
    }
  }, [orderStatus, driverLocation, orderData]); // Run when orderStatus, driverLocation, or orderData changes

  const handleSubmit = async () => {
    const accessToken = await AsyncStorage.getItem("accessToken");
    await axios
      .put(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/update-ride-status`,
        {
          rideStatus: orderStatus === "Ongoing" ? "Completed" : "Ongoing",
          rideId: orderData?.rideData.id,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      .then((res) => {
        const newStatus = res.data.updatedRide.status;
        console.log(`[RideDetails] Status updated to: ${newStatus}`);
        
        if (newStatus === "Ongoing") {
          // Update status immediately
          setorderStatus(newStatus);
          
          // Get driver's current location (where they are now, after pickup)
          // Then update region to show driver's current location and destination
          (async () => {
            try {
              const currentLocation = await GeoLocation.getCurrentPositionAsync({
                accuracy: GeoLocation.Accuracy.Balanced,
              });
              const driverCurrentLoc = {
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
              };
              
              // Update driver location state
              setDriverLocation(driverCurrentLoc);
              
              // Update region to show driver's current location and destination
              if (orderData?.marker) {
                const latitudeDelta = Math.abs(
                  driverCurrentLoc.latitude - orderData.marker.latitude
                ) * 2.2;
                const longitudeDelta = Math.abs(
                  driverCurrentLoc.longitude - orderData.marker.longitude
                ) * 2.2;
                
                const newRegion = {
                  latitude: (driverCurrentLoc.latitude + orderData.marker.latitude) / 2,
                  longitude: (driverCurrentLoc.longitude + orderData.marker.longitude) / 2,
                  latitudeDelta: Math.max(latitudeDelta, 0.0922),
                  longitudeDelta: Math.max(longitudeDelta, 0.0421),
                };
                
                console.log(`[RideDetails] Updating region to show driver location and destination:`, newRegion);
                setRegion(newRegion);
              }
            } catch (error) {
              console.error("[RideDetails] Failed to get driver location for region update:", error);
              // Fallback: use existing driverLocation or just show destination
              if (driverLocation && orderData?.marker) {
                const latitudeDelta = Math.abs(
                  driverLocation.latitude - orderData.marker.latitude
                ) * 2.2;
                const longitudeDelta = Math.abs(
                  driverLocation.longitude - orderData.marker.longitude
                ) * 2.2;
                
                setRegion({
                  latitude: (driverLocation.latitude + orderData.marker.latitude) / 2,
                  longitude: (driverLocation.longitude + orderData.marker.longitude) / 2,
                  latitudeDelta: Math.max(latitudeDelta, 0.0922),
                  longitudeDelta: Math.max(longitudeDelta, 0.0421),
                });
              } else if (orderData?.marker) {
                setRegion({
                  latitude: orderData.marker.latitude,
                  longitude: orderData.marker.longitude,
                  latitudeDelta: 0.0922,
                  longitudeDelta: 0.0421,
                });
              }
            }
          })();
          
          Toast.show("Let's have a safe journey! Navigate to the destination.", {
            type: "success",
            placement: "bottom",
          });
        } else if (newStatus === "Completed") {
          Toast.show(`Well done ${orderData.driver.name}!`, {
            type: "success",
            placement: "bottom",
          });
          router.push("/(tabs)/home");
        }
      })
      .catch((error) => {
        console.error("[RideDetails] Error updating ride status:", error);
        Toast.show("Failed to update ride status. Please try again.", {
          type: "danger",
          placement: "bottom",
        });
      });
  };

  return (
    <View>
      <View style={{ height: windowHeight(480), position: 'relative' }}>
        <MapView
          style={{ flex: 1 }}
          region={region}
          onRegionChangeComplete={(region) => setRegion(region)}
          mapType={mapType}
        >
          {orderStatus === "Processing" ? (
            // Before pickup: Show driver location, pickup location, and route between them
            <>
              {/* Always show pickup location immediately */}
              {orderData?.currentLocation && (
                <Marker
                  coordinate={orderData.currentLocation}
                  pinColor="green"
                  title="Pickup Location"
                  description="Passenger pickup point"
                />
              )}
              {/* Show driver location when available */}
              {driverLocation && (
                <Marker
                  coordinate={driverLocation}
                  pinColor="blue"
                  title="Your Location"
                  description="Driver's current location"
                />
              )}
              {/* Show route only when both locations are available */}
              {driverLocation && orderData?.currentLocation && (
                <MapViewDirections
                  origin={driverLocation}
                  destination={orderData.currentLocation}
                  apikey={process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!}
                  strokeWidth={4}
                  strokeColor="blue"
                />
              )}
            </>
          ) : orderStatus === "Ongoing" ? (
            // After pickup: Show driver's current location, destination, and route from driver to destination
            <>
              {/* Show driver's current location (updating in real-time) */}
              {driverLocation && (
                <Marker
                  coordinate={driverLocation}
                  pinColor="blue"
                  title="Your Location"
                  description="Driver's current location"
                />
              )}
              {/* Show pickup location (where passenger was picked up) - optional reference */}
              {orderData?.currentLocation && (
                <Marker
                  coordinate={orderData.currentLocation}
                  pinColor="green"
                  title="Pickup Location"
                  description="Passenger was picked up here"
                />
              )}
              {/* Show destination (where to drop off) */}
              {orderData?.marker && (
                <Marker
                  coordinate={orderData.marker}
                  pinColor="red"
                  title="Destination"
                  description="Drop-off location"
                />
              )}
              {/* Route from driver's CURRENT location to destination */}
              {driverLocation && orderData?.marker && (
                <MapViewDirections
                  origin={driverLocation}
                  destination={orderData.marker}
                  apikey={process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!}
                  strokeWidth={4}
                  strokeColor="blue"
                />
              )}
            </>
          ) : (
            // Default: Show both (fallback)
            <>
              {orderData?.marker && (
                <Marker coordinate={orderData.marker} pinColor="red" title="Destination" />
              )}
              {orderData?.currentLocation && (
                <Marker coordinate={orderData.currentLocation} pinColor="green" title="Pickup" />
              )}
              {orderData?.currentLocation && orderData?.marker && (
                <MapViewDirections
                  origin={orderData.currentLocation}
                  destination={orderData.marker}
                  apikey={process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!}
                  strokeWidth={4}
                  strokeColor="blue"
                />
              )}
            </>
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
          Passenger Name: {orderData?.user?.name}
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
              Linking.openURL(`tel:${orderData?.user?.phone_number}`)
            }
          >
            {orderData?.user?.phone_number}
          </Text>
        </View>
        <Text
          style={{
            fontSize: fontSizes.FONT20,
            fontWeight: "500",
            paddingVertical: windowHeight(5),
          }}
        >
          Payable amount:{" "}
          {(orderData.distance * parseInt(orderData?.driver?.rate)).toFixed(2)}{" "}
          MRU
        </Text>

        <View style={{ paddingTop: windowHeight(30) }}>
          <Button
            title={
              orderStatus === "Processing"
                ? "Pick Up Passenger"
                : "Drop Off Passenger"
            }
            height={windowHeight(40)}
            disabled={orderStatus?.length === 0}
            backgroundColor={color.bgDark}
            onPress={() => handleSubmit()}
          />
        </View>
      </View>
    </View>
  );
}
