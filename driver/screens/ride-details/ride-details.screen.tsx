import { View, Text, Linking, TouchableOpacity } from "react-native";
import React, { useEffect, useState, useRef } from "react";
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
  const [orderStatus, setorderStatus] = useState("Accepted"); // Changed from "Processing" - rides are directly accepted
  const orderData = JSON.parse(orderDataObj);
  
  // Extract stable values from orderData to use in effects
  const pickupLocation = orderData?.currentLocation;
  const destinationLocation = orderData?.marker;
  const initialDriverLocation = orderData?.driverLocation;
  
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
    initialDriverLocation || null
  );
  
  // Refs to prevent infinite loops
  const regionInitializedRef = useRef(false);
  const lastRegionUpdateRef = useRef<string>("");

  // OPTIMIZED: Use passed location immediately, fetch fresh location in background
  useEffect(() => {
    // Use passed driver location immediately (no wait)
    if (initialDriverLocation) {
      console.log("[RideDetails] Using driver location from orderData immediately:", initialDriverLocation);
      setDriverLocation(initialDriverLocation);
    }
    
    let subscription: any = null;
    
    // Fetch fresh location in background (non-blocking)
    (async () => {
      try {
        const { status } = await GeoLocation.requestForegroundPermissionsAsync();
        if (status === "granted") {
          // Try to get fresh location, but don't block if it takes too long
          try {
            const locationPromise = GeoLocation.getCurrentPositionAsync({
              accuracy: GeoLocation.Accuracy.Balanced,
            });
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Location timeout")), 3000)
            );
            
            const location = await Promise.race([locationPromise, timeoutPromise]) as any;
            const { latitude, longitude } = location.coords;
            setDriverLocation({ latitude, longitude });
            console.log("[RideDetails] Updated driver location in background:", { latitude, longitude });
          } catch (err) {
            console.log("[RideDetails] Using passed location (fresh location fetch timed out)");
            // Keep using initialDriverLocation
          }
          
          // Watch position to keep driver location updated (especially after pickup)
          subscription = await GeoLocation.watchPositionAsync(
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
        }
      } catch (error) {
        console.error("[RideDetails] Failed to get/update driver location:", error);
        // Continue with initialDriverLocation if available
      }
    })();
    
    // Cleanup subscription on unmount
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []); // Only run once on mount

  // Initialize status on mount (only once)
  useEffect(() => {
    // Get status from rideData, default to "Accepted" (new rides are directly accepted)
    const status = orderData?.rideData?.status || "Accepted";
    console.log(`[RideDetails] Initializing with status: ${status}`);
    setorderStatus(status);
  }, []); // Only run once on mount

  // Update region based on status and available locations (with guards to prevent infinite loops)
  // AUTOMATIC MAP UPDATES: Immediately show pickup location when ride is accepted, then dropoff when picked up
  useEffect(() => {
    // Create a unique key for this update to prevent duplicate updates
    const updateKey = `${orderStatus}-${driverLocation?.latitude?.toFixed(4)}-${driverLocation?.longitude?.toFixed(4)}`;
    
    // Skip if we've already processed this exact update
    if (lastRegionUpdateRef.current === updateKey) {
      return;
    }
    
    console.log(`[RideDetails] Updating region for status: ${orderStatus}`);
    
    if (orderStatus === "Accepted" || orderStatus === "Processing") {
      // AUTOMATIC: Before pickup - Show driver location → pickup location immediately
      // Support both "Accepted" (new) and "Processing" (legacy) for backward compatibility
      if (pickupLocation && driverLocation) {
        const latitudeDelta = Math.abs(
          driverLocation.latitude - pickupLocation.latitude
        ) * 2.2;
        const longitudeDelta = Math.abs(
          driverLocation.longitude - pickupLocation.longitude
        ) * 2.2;
        
        const newRegion = {
          latitude: (driverLocation.latitude + pickupLocation.latitude) / 2,
          longitude: (driverLocation.longitude + pickupLocation.longitude) / 2,
          latitudeDelta: Math.max(latitudeDelta, 0.0922),
          longitudeDelta: Math.max(longitudeDelta, 0.0421),
        };
        
        console.log(`[RideDetails] AUTOMATIC: Setting region for pickup (driver → pickup location)`);
        setRegion(newRegion);
        lastRegionUpdateRef.current = updateKey;
        regionInitializedRef.current = true;
      } else if (pickupLocation) {
        // AUTOMATIC: Immediately show pickup location even if driver location not available yet
        console.log(`[RideDetails] AUTOMATIC: Setting region to pickup location (driver location pending)`);
        setRegion({
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
        regionInitializedRef.current = true;
        lastRegionUpdateRef.current = updateKey;
      }
    } else if (orderStatus === "Ongoing") {
      // AUTOMATIC: After pickup - Immediately show driver's current location → destination
      if (driverLocation && destinationLocation) {
        const latitudeDelta = Math.abs(
          driverLocation.latitude - destinationLocation.latitude
        ) * 2.2;
        const longitudeDelta = Math.abs(
          driverLocation.longitude - destinationLocation.longitude
        ) * 2.2;
        
        const newRegion = {
          latitude: (driverLocation.latitude + destinationLocation.latitude) / 2,
          longitude: (driverLocation.longitude + destinationLocation.longitude) / 2,
          latitudeDelta: Math.max(latitudeDelta, 0.0922),
          longitudeDelta: Math.max(longitudeDelta, 0.0421),
        };
        
        console.log(`[RideDetails] AUTOMATIC: Setting region for dropoff (driver → destination)`);
        setRegion(newRegion);
        lastRegionUpdateRef.current = updateKey;
        regionInitializedRef.current = true;
      } else if (destinationLocation) {
        // AUTOMATIC: Immediately show destination even if driver location not available yet
        console.log(`[RideDetails] AUTOMATIC: Setting region to destination (driver location pending)`);
        setRegion({
          latitude: destinationLocation.latitude,
          longitude: destinationLocation.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
        regionInitializedRef.current = true;
        lastRegionUpdateRef.current = updateKey;
      }
    }
  }, [orderStatus, driverLocation, pickupLocation, destinationLocation]); // Use extracted stable values

  const handleSubmit = async () => {
    const accessToken = await AsyncStorage.getItem("accessToken");
    
    // Get ride ID - check multiple possible locations
    // The ride data structure: orderData.rideData.id (from server-created ride)
    let rideId = orderData?.rideData?.id || 
                 orderData?.rideData?._id || 
                 orderData?.ride?.id ||
                 orderData?.rideData?.rideId; // Fallback
    
    console.log(`[RideDetails] Attempting to update ride status. Ride ID check:`, {
      rideId,
      hasRideId: !!rideId,
      isTempId: rideId?.startsWith?.('temp_'),
      orderDataKeys: Object.keys(orderData || {}),
      rideDataKeys: orderData?.rideData ? Object.keys(orderData.rideData) : [],
      rideData: orderData?.rideData,
    });
    
    // If ride ID is a temp ID (starts with "temp_" or "server_created_"), we need to fetch the actual ride from database
    // This happens when server confirmation didn't include ride data
    if (rideId && (rideId.startsWith('temp_') || rideId.startsWith('server_created_'))) {
      console.log(`[RideDetails] Temp ride ID detected (${rideId}), fetching actual ride from database...`);
      try {
        const userId = orderData?.user?.id || orderData?.rideData?.userId;
        const driverId = orderData?.driver?.id || orderData?.rideData?.driverId;
        
        console.log(`[RideDetails] Fetching ride with userId: ${userId}, driverId: ${driverId}`);
        
        if (!userId || !driverId) {
          throw new Error("Missing userId or driverId to fetch ride");
        }
        
        // Fetch the actual ride from database
        const response = await axios.get(
          `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/get-rides`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        
        // Find the most recent ride for this user by this driver with Accepted/Processing status
        const rides = response.data?.rides || response.data || [];
        console.log(`[RideDetails] Found ${rides.length} rides, searching for matching ride...`);
        
        const actualRide = rides.find((ride: any) => {
          const matchesUser = String(ride.userId) === String(userId);
          const matchesDriver = String(ride.driverId) === String(driverId);
          const isActive = ride.status === "Accepted" || ride.status === "Processing" || ride.status === "Ongoing";
          return matchesUser && matchesDriver && isActive;
        });
        
        if (actualRide && actualRide.id) {
          rideId = String(actualRide.id);
          console.log(`[RideDetails] ✅ Found actual ride ID: ${rideId}, status: ${actualRide.status}`);
          // Update orderData with the actual ride ID
          if (orderData.rideData) {
            orderData.rideData.id = rideId;
          }
        } else {
          console.error(`[RideDetails] ❌ Could not find matching ride in database. Rides found:`, rides.map((r: any) => ({
            id: r.id,
            userId: r.userId,
            driverId: r.driverId,
            status: r.status,
          })));
          throw new Error("Could not find ride in database. The ride may not have been created properly.");
        }
      } catch (fetchError: any) {
        console.error(`[RideDetails] Failed to fetch actual ride ID:`, {
          message: fetchError?.message,
          response: fetchError?.response?.data,
          status: fetchError?.response?.status,
        });
        Toast.show("Could not find ride. Please try again or contact support.", {
          type: "danger",
          placement: "bottom",
        });
        return;
      }
    }
    
    if (!rideId || rideId.startsWith('temp_')) {
      console.error("[RideDetails] No valid ride ID found:", {
        rideId,
        rideData: orderData?.rideData,
        ride: orderData?.ride,
        orderDataKeys: Object.keys(orderData || {}),
      });
      Toast.show("Ride ID not found. Cannot update status.", {
        type: "danger",
        placement: "bottom",
      });
      return;
    }
    
    // Determine next status based on current status
    // "Accepted" or "Processing" -> "Ongoing" (pickup passenger)
    // "Ongoing" -> "Completed" (drop off passenger)
    let nextStatus: string;
    if (orderStatus === "Ongoing") {
      nextStatus = "Completed";
    } else {
      // "Accepted" or "Processing" -> "Ongoing"
      nextStatus = "Ongoing";
    }
    
    console.log(`[RideDetails] Updating ride status:`, {
      rideId,
      currentStatus: orderStatus,
      nextStatus,
      hasRideId: !!rideId,
    });
    
    await axios
      .put(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/update-ride-status`,
        {
          rideStatus: nextStatus,
          rideId: String(rideId), // Ensure it's a string
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
          // AUTOMATIC: Update status immediately - map will automatically update via useEffect
          setorderStatus(newStatus);
          
          // AUTOMATIC: Get driver's current location (where they are now, after pickup)
          // Map will automatically update to show driver → destination via useEffect
          (async () => {
            try {
              const currentLocation = await GeoLocation.getCurrentPositionAsync({
                accuracy: GeoLocation.Accuracy.Balanced,
              });
              const driverCurrentLoc = {
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
              };
              
              // Update driver location state - this will trigger useEffect to update map automatically
              setDriverLocation(driverCurrentLoc);
              console.log(`[RideDetails] AUTOMATIC: Driver location updated, map will show dropoff route`);
              
              // Reset region update key to force map update
              lastRegionUpdateRef.current = "";
            } catch (error) {
              console.error("[RideDetails] Failed to get driver location for region update:", error);
              // The useEffect will handle region update when driverLocation state updates
              // Reset region update key to force map update even without driver location
              lastRegionUpdateRef.current = "";
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
        console.error("[RideDetails] Error updating ride status:", {
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          rideId,
          nextStatus,
        });
        
        const errorMessage = error?.response?.data?.message || error?.message || "Failed to update ride status. Please try again.";
        Toast.show(errorMessage, {
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
          {(orderStatus === "Accepted" || orderStatus === "Processing") ? (
            // Before pickup: Show driver location, pickup location, and route between them
            // Support both "Accepted" (new) and "Processing" (legacy) for backward compatibility
            <>
              {/* Always show pickup location immediately */}
              {pickupLocation && (
                <Marker
                  coordinate={pickupLocation}
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
              {driverLocation && pickupLocation && (
                <MapViewDirections
                  origin={driverLocation}
                  destination={pickupLocation}
                  apikey={process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!}
                  strokeWidth={4}
                  strokeColor="blue"
                />
              )}
            </>
          ) : orderStatus === "Ongoing" ? (
            // After pickup: NEW map showing driver's current location, destination, and route from driver to destination
            <>
              {/* Show driver's current location (where they picked up the passenger, updating in real-time) */}
              {driverLocation && (
                <Marker
                  coordinate={driverLocation}
                  pinColor="blue"
                  title="Your Location"
                  description="Driver's current location"
                />
              )}
              {/* Show destination (where to drop off) */}
              {destinationLocation && (
                <Marker
                  coordinate={destinationLocation}
                  pinColor="red"
                  title="Destination"
                  description="Drop-off location"
                />
              )}
              {/* Route from driver's CURRENT location to destination */}
              {driverLocation && destinationLocation && (
                <MapViewDirections
                  origin={driverLocation}
                  destination={destinationLocation}
                  apikey={process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!}
                  strokeWidth={4}
                  strokeColor="blue"
                />
              )}
            </>
          ) : (
            // Default: Show both (fallback)
            <>
              {destinationLocation && (
                <Marker coordinate={destinationLocation} pinColor="red" title="Destination" />
              )}
              {pickupLocation && (
                <Marker coordinate={pickupLocation} pinColor="green" title="Pickup" />
              )}
              {pickupLocation && destinationLocation && (
                <MapViewDirections
                  origin={pickupLocation}
                  destination={destinationLocation}
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
          {Math.floor(parseFloat(orderData.distance) * parseInt(orderData?.driver?.rate))}{" "}
          MRU
        </Text>

        <View style={{ paddingTop: windowHeight(30) }}>
          <Button
            title={
              (orderStatus === "Accepted" || orderStatus === "Processing")
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
