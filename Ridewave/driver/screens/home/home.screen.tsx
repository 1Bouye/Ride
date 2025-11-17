import {
  View,
  Text,
  FlatList,
  Modal,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import React, { useEffect, useRef, useState } from "react";
import Header from "@/components/common/header";
import { recentRidesData, rideData } from "@/configs/constants";
import { useTheme } from "@react-navigation/native";
import RenderRideItem from "@/components/ride/render.ride.item";
import { external } from "@/styles/external.style";
import styles from "./styles";
import RideCard from "@/components/ride/ride.card";
import MapView, { Marker, Polyline } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { windowHeight, windowWidth } from "@/themes/app.constant";
import { Gps, Location } from "@/utils/icons";
import color from "@/themes/app.colors";
import Button from "@/components/common/button";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as GeoLocation from "expo-location";
import { Toast } from "react-native-toast-notifications";
import { useGetDriverData } from "@/hooks/useGetDriverData";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { router } from "expo-router";

export default function HomeScreen() {
  const notificationListener = useRef<any>(null);
  const { driver, loading: DriverDataLoading } = useGetDriverData();
  const [userData, setUserData] = useState<any>(null);
  const [isOn, setIsOn] = useState<any>();
  const [loading, setloading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [region, setRegion] = useState<any>(null); // Start with null, will be set when we get real location
  const [locationLoading, setLocationLoading] = useState(true); // Track if we're still loading location
  const [currentLocationName, setcurrentLocationName] = useState("");
  const [destinationLocationName, setdestinationLocationName] = useState("");
  const [distance, setdistance] = useState<any>();
  const [wsConnected, setWsConnected] = useState(false);
  const [marker, setMarker] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [lastLocation, setLastLocation] = useState<any>(null);
  const [recentRides, setrecentRides] = useState([]);
  const wsRef = useRef<WebSocket | null>(null);
  // Track active status synchronously for places where state update hasn't flushed yet
  const driverActiveRef = useRef<boolean>(false);
  const [accepting, setAccepting] = useState(false);

  // Get WebSocket URL - handle Android emulator and physical device
  const getWebSocketUrl = () => {
    // Check if WebSocket URL is configured in environment (highest priority)
    const wsUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL;
    if (wsUrl) {
      console.log('🔌 Using WebSocket URL from environment:', wsUrl);
      return wsUrl;
    }
    
    // For Android, default to 10.0.2.2 (works for emulator and Expo Go)
    // For physical devices, user should set EXPO_PUBLIC_WEBSOCKET_URL in .env
    if (Platform.OS === 'android') {
      // Check if we're in Expo Go (which typically runs in emulator during development)
      const isExpoGo = Constants?.executionEnvironment === 'storeClient';
      const isPhysicalDevice = Device.isDevice;
      
      // Default to 10.0.2.2 for Android (works for emulator/Expo Go)
      // Users can override with EXPO_PUBLIC_WEBSOCKET_URL for physical devices
      // 10.0.2.2 is the special IP that Android emulator uses to access host's localhost
      if (isExpoGo) {
        console.log('📱 Expo Go detected, using 10.0.2.2:8080');
        return 'ws://10.0.2.2:8080';
      }
      
      if (!isPhysicalDevice) {
        console.log('📱 Android emulator detected, using 10.0.2.2:8080');
        return 'ws://10.0.2.2:8080';
      }
      
      // Physical Android device - try to extract IP from SERVER_URI
      // Physical devices on same network can use the server IP directly
      const serverUri = process.env.EXPO_PUBLIC_SERVER_URI || '';
      const ipMatch = serverUri.match(/http:\/\/([^:]+)/);
      if (ipMatch && ipMatch[1] && !ipMatch[1].includes('localhost') && !ipMatch[1].includes('127.0.0.1') && !ipMatch[1].startsWith('10.0.2.')) {
        console.log(`📱 Physical Android device, using ${ipMatch[1]}:8080`);
        return `ws://${ipMatch[1]}:8080`;
      }
      
      // Default to 10.0.2.2 for Android (works for emulator, won't work for physical device)
      // User should set EXPO_PUBLIC_WEBSOCKET_URL for physical devices
      console.log('📱 Android - defaulting to 10.0.2.2:8080 (set EXPO_PUBLIC_WEBSOCKET_URL for physical devices)');
      return 'ws://10.0.2.2:8080';
    }
    
    // For iOS or web, try to extract from SERVER_URI or use localhost
    const serverUri = process.env.EXPO_PUBLIC_SERVER_URI || '';
    const ipMatch = serverUri.match(/http:\/\/([^:]+)/);
    if (ipMatch && ipMatch[1] && !ipMatch[1].includes('localhost')) {
      console.log(`📱 iOS/Web, using ${ipMatch[1]}:8080`);
      return `ws://${ipMatch[1]}:8080`;
    }
    
    // Fallback
    console.log('📱 Using localhost fallback');
    return 'ws://localhost:8080';
  };

  const { colors } = useTheme();

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        // Handle the notification and extract data
        const orderDataString = notification.request.content.data.orderData;
        const orderData = JSON.parse(
          typeof orderDataString === 'string' ? orderDataString : String(orderDataString)
        );
        setIsModalVisible(true);
        setCurrentLocation({
          latitude: orderData.currentLocation.latitude,
          longitude: orderData.currentLocation.longitude,
        });
        setMarker({
          latitude: orderData.marker.latitude,
          longitude: orderData.marker.longitude,
        });
        setRegion({
          latitude:
            (orderData.currentLocation.latitude + orderData.marker.latitude) /
            2,
          longitude:
            (orderData.currentLocation.longitude + orderData.marker.longitude) /
            2,
          latitudeDelta:
            Math.abs(
              orderData.currentLocation.latitude - orderData.marker.latitude
            ) * 2,
          longitudeDelta:
            Math.abs(
              orderData.currentLocation.longitude - orderData.marker.longitude
            ) * 2,
        });
        setdistance(orderData.distance);
        setcurrentLocationName(orderData.currentLocationName);
        setdestinationLocationName(orderData.destinationLocation);
        setUserData(orderData.user);
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      const status: any = await AsyncStorage.getItem("status");
      setIsOn(status === "active" ? true : false);
    };
    fetchStatus();
  }, []);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  async function registerForPushNotificationsAsync() {
    if (Device.isDevice) {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        Toast.show("Failed to get push token for push notification!", {
          type: "danger",
        });
        return;
      }
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      if (!projectId) {
        Toast.show("Failed to get project id for push notification!", {
          type: "danger",
        });
      }
      try {
        const pushTokenString = (
          await Notifications.getExpoPushTokenAsync({
            projectId,
          })
        ).data;
        console.log(pushTokenString);
        // Register token with backend so users can notify this driver
        try {
          const accessToken = await AsyncStorage.getItem("accessToken");
          await axios.post(
            `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/register-push-token`,
            { token: pushTokenString },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          console.log("[Notifications] Registered driver push token");
        } catch (e: any) {
          console.log("[Notifications] Failed to register push token:", e?.message || e);
        }
      } catch (e: unknown) {
        Toast.show(`${e}`, {
          type: "danger",
        });
      }
    } else {
      Toast.show("Must use physical device for Push Notifications", {
        type: "danger",
      });
    }

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }
  }

  // socket updates
  useEffect(() => {
    const wsUrl = getWebSocketUrl();
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      const ws = wsRef.current;

      ws.onopen = () => {
        console.log("✅ Connected to WebSocket server");
        setWsConnected(true);
        
        // Identify this driver to the WS server (so user can notify even before movement)
        (async () => {
          try {
            const accessToken = await AsyncStorage.getItem("accessToken");
            const res = await axios.get(
              `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/me`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            const driverId = res?.data?.driver?.id;
            if (driverId) {
              ws.send(
                JSON.stringify({
                  type: "identify",
                  role: "driver",
                  driverId,
                })
              );
              console.log("🪪 Identified to WS as driver:", driverId);
            }
          } catch (e) {
            console.log("⚠️ Failed to identify driver on WS:", e);
          }
        })();

        // Send initial location update when connected (if driver is active and has location)
        if (isOn && currentLocation) {
          console.log("📡 WebSocket connected, sending initial location update");
          setTimeout(() => {
            sendLocationUpdate(currentLocation, true);
          }, 1000); // Wait 1 second for connection to stabilize
        }
      };

      ws.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          console.log("📨 Received message:", message);
          // Handle ride request via websocket (fallback to push)
          if (message?.type === "rideRequest" && message?.payload) {
            const orderData = message.payload;
            setIsModalVisible(true);
            setCurrentLocation({
              latitude: orderData.currentLocation.latitude,
              longitude: orderData.currentLocation.longitude,
            });
            setMarker({
              latitude: orderData.marker.latitude,
              longitude: orderData.marker.longitude,
            });
            setRegion({
              latitude:
                (orderData.currentLocation.latitude + orderData.marker.latitude) / 2,
              longitude:
                (orderData.currentLocation.longitude + orderData.marker.longitude) / 2,
              latitudeDelta: Math.abs(
                orderData.currentLocation.latitude - orderData.marker.latitude
              ) * 2,
              longitudeDelta: Math.abs(
                orderData.currentLocation.longitude - orderData.marker.longitude
              ) * 2,
            });
            setdistance(orderData.distance);
            setcurrentLocationName(orderData.currentLocationName);
            setdestinationLocationName(orderData.destinationLocation);
            setUserData(orderData.user);
          }
        } catch (error) {
          console.error("❌ Failed to parse WebSocket message:", error);
        }
      };

      ws.onerror = (e: any) => {
        console.error("❌ WebSocket error:", e.message || 'Connection failed');
        setWsConnected(false);
      };

      ws.onclose = (e) => {
        console.log("🔌 WebSocket closed:", e.code, e.reason || 'Connection closed');
        setWsConnected(false);
        // Attempt to reconnect after a delay (only if not manually closed)
        if (e.code !== 1000) {
          setTimeout(() => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
              console.log('🔄 Attempting to reconnect WebSocket...');
              // Reinitialize connection with event handlers
              const newWs = new WebSocket(wsUrl);
              newWs.onopen = () => {
                console.log("✅ Reconnected to WebSocket server");
                setWsConnected(true);
              };
              newWs.onmessage = (e) => {
                try {
                  const message = JSON.parse(e.data);
                  console.log("📨 Received message:", message);
                } catch (error) {
                  console.error("❌ Failed to parse WebSocket message:", error);
                }
              };
              newWs.onerror = (e: any) => {
                console.error("❌ WebSocket error:", e.message || 'Connection failed');
                setWsConnected(false);
              };
              newWs.onclose = (e) => {
                console.log("🔌 WebSocket closed:", e.code, e.reason || 'Connection closed');
                setWsConnected(false);
              };
              wsRef.current = newWs;
            }
          }, 5000);
        }
      };
    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      setWsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const haversineDistance = (coords1: any, coords2: any) => {
    const toRad = (x: any) => (x * Math.PI) / 180;

    const R = 6371e3; // Radius of the Earth in meters
    const lat1 = toRad(coords1.latitude);
    const lat2 = toRad(coords2.latitude);
    const deltaLat = toRad(coords2.latitude - coords1.latitude);
    const deltaLon = toRad(coords2.longitude - coords1.longitude);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in meters
    return distance;
  };

  const sendLocationUpdate = async (location: any, force: boolean = false) => {
    // Check if WebSocket is connected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('⚠️ WebSocket not connected, cannot send location update');
      return;
    }

    // Check if driver is active
    if (!driverActiveRef.current && !force) {
      console.log('⚠️ Driver is not active, skipping location update');
      return;
    }

    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      const res = await axios.get(`${process.env.EXPO_PUBLIC_SERVER_URI}/driver/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.data && res.data.driver) {
        const message = JSON.stringify({
          type: "locationUpdate",
          data: location,
          role: "driver",
          driver: res.data.driver.id!,
        });
        wsRef.current.send(message);
        console.log(`📍 Sent location update to server: (${location.latitude}, ${location.longitude})`);
      } else {
        console.error('❌ Driver data not found in response');
      }
    } catch (error: any) {
      console.error('❌ Failed to send location update:', error?.message || error);
    }
  };

  useEffect(() => {
    // Keep a synchronous mirror of isOn for timing-sensitive checks
    driverActiveRef.current = !!isOn;
  }, [isOn]);

  useEffect(() => {
    (async () => {
      try {
        setLocationLoading(true);
        console.log('📍 [Driver] Requesting location permission...');
        
        let { status } = await GeoLocation.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.error('❌ [Driver] Location permission denied');
          Toast.show("Please give us to access your location to use this app!");
          setLocationLoading(false);
          // Fallback to Nouakchott, Mauritania
          const nouakchottLocation = {
            latitude: 18.0735,
            longitude: -15.9582,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          };
          setRegion(nouakchottLocation);
          setCurrentLocation({ latitude: nouakchottLocation.latitude, longitude: nouakchottLocation.longitude });
          return;
        }

        console.log('📍 [Driver] Starting location tracking...');
        
        // Get initial location first
        try {
          const initialLocation = await GeoLocation.getCurrentPositionAsync({
            accuracy: GeoLocation.Accuracy.High,
          });
          const { latitude, longitude } = initialLocation.coords;
          console.log(`✅ [Driver] Got initial location: (${latitude}, ${longitude})`);
          
          setCurrentLocation({ latitude, longitude });
          setLastLocation({ latitude, longitude });
          setRegion({
            latitude,
            longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          });
          setLocationLoading(false);
          
          // Send initial location if driver is active
          if (isOn) {
            await sendLocationUpdate({ latitude, longitude }, true);
          }
        } catch (error: any) {
          console.error('❌ [Driver] Failed to get initial location:', error?.message || error);
          setLocationLoading(false);
          // Fallback to Nouakchott, Mauritania
          const nouakchottLocation = {
            latitude: 18.0735,
            longitude: -15.9582,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          };
          setRegion(nouakchottLocation);
          setCurrentLocation({ latitude: nouakchottLocation.latitude, longitude: nouakchottLocation.longitude });
        }

        // Start watching position for updates
        await GeoLocation.watchPositionAsync(
          {
            accuracy: GeoLocation.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          async (position) => {
            const { latitude, longitude } = position.coords;
            const newLocation = { latitude, longitude };
            
            // Always update current location state
            setCurrentLocation(newLocation);
            
            // Update region if it's the first location or if we don't have a region yet
            if (!region) {
              setRegion({
                latitude,
                longitude,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              });
            }
            
            // Send location update if:
            // 1. First location (no lastLocation)
            // 2. Driver moved more than 200 meters
            // 3. Driver is active
            if (
              !lastLocation ||
              haversineDistance(lastLocation, newLocation) > 200
            ) {
              setLastLocation(newLocation);
              // Only send if driver is active (checked inside sendLocationUpdate)
              await sendLocationUpdate(newLocation);
            }
          }
        );
      } catch (error: any) {
        console.error('❌ [Driver] Location setup error:', error?.message || error);
        setLocationLoading(false);
        Toast.show("Failed to setup location tracking. Please check your GPS settings.", {
          type: "danger",
        });
        // Fallback to Nouakchott, Mauritania
        const nouakchottLocation = {
          latitude: 18.0735,
          longitude: -15.9582,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setRegion(nouakchottLocation);
        setCurrentLocation({ latitude: nouakchottLocation.latitude, longitude: nouakchottLocation.longitude });
      }
    })();
  }, []);

  const getRecentRides = async () => {
    const accessToken = await AsyncStorage.getItem("accessToken");
    const res = await axios.get(
      `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/get-rides`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    setrecentRides(res.data.rides);
  };

  useEffect(() => {
    getRecentRides();
  }, []);

  const handleClose = () => {
    setIsModalVisible(false);
  };

  const handleStatusChange = async () => {
    if (!loading) {
      setloading(true);
      const accessToken = await AsyncStorage.getItem("accessToken");
      const nextStatus = !isOn ? "active" : "inactive";
      console.log("[DriverStatus] Sending status update:", nextStatus);
      const changeStatus = await axios.put(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/update-status`,
        {
          status: nextStatus,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      if (changeStatus.data) {
        const nextIsOn = !isOn;
        setIsOn(nextIsOn);
        driverActiveRef.current = nextIsOn;
        await AsyncStorage.setItem("status", changeStatus.data.driver.status);
        setloading(false);
        console.log(
          "[DriverStatus] Status updated successfully:",
          changeStatus.data.driver.status
        );
        
        // If driver just turned ON, send immediate location update
        if (nextStatus === "active" && currentLocation) {
          console.log("[DriverStatus] Driver turned ON, sending initial location update");
          await sendLocationUpdate(currentLocation, true); // Force send even if not moved
        }
      } else {
        setloading(false);
        console.log("[DriverStatus] Status update response missing data");
      }
    }
  };

  const sendPushNotification = async (expoPushToken: string, data: any) => {
    const message = {
      to: expoPushToken,
      sound: "default",
      title: "Ride Request Accepted!",
      body: `Your driver is on the way!`,
      data: { orderData: data },
    };
    await axios
      .post("https://exp.host/--/api/v2/push/send", message)
      .catch((error) => {
        console.log(error);
      });
  };

  const acceptRideHandler = async () => {
    if (accepting) {
      return;
    }
    try {
      setAccepting(true);
      console.log("[Driver] Accept button pressed");
      if (!userData?.id) {
        console.log("[Driver] No user data available for this request");
        Toast.show("No rider information found.", { type: "danger" });
        setAccepting(false);
        return;
      }
      const accessToken = await AsyncStorage.getItem("accessToken");
      const res = await axios.post(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/new-ride`,
        {
          userId: userData.id,
          charge: (distance * parseInt(driver?.rate!)).toFixed(2),
          status: "Processing",
          currentLocationName,
          destinationLocationName,
          distance,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = {
        ...driver,
        currentLocation,
        marker,
        distance,
      };
      const driverPushToken = "ExponentPushToken[A22bNzKGUMegAXVEqzDnUx]";
      await sendPushNotification(driverPushToken, data);

      // Notify the user via WS that the driver accepted
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "driverAccept",
              role: "driver",
              userId: userData.id,
              payload: {
                user: userData,
                currentLocation,
                marker,
                distance,
                currentLocationName,
                destinationLocation: destinationLocationName,
                driver,
              },
            })
          );
          console.log("📣 Sent driverAccept via WS to user:", userData.id);
        } else {
          console.log("⚠️ WS not open; cannot send driverAccept");
        }
      } catch (err) {
        console.log("⚠️ Failed to send driverAccept via WS:", err);
      }

      const rideData = {
        user: userData,
        currentLocation,
        marker,
        driver,
        distance,
        rideData: res.data.newRide,
      };
      router.push({
        pathname: "/(routes)/ride-details",
        params: { orderData: JSON.stringify(rideData) },
      });
    } catch (error: any) {
      console.log("[Driver] Accept error:", error?.message || error);
      Toast.show("Failed to accept ride. Please try again.", { type: "danger" });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View style={[external.fx_1]}>
      <View style={styles.spaceBelow}>
        <Header isOn={isOn} toggleSwitch={() => handleStatusChange()} />
        <FlatList
          data={rideData}
          numColumns={2}
          renderItem={({ item }) => (
            <RenderRideItem item={item} colors={colors} />
          )}
        />
        <View style={[styles.rideContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.rideTitle, { color: colors.text }]}>
            Recent Rides
          </Text>
          <ScrollView>
            {recentRides?.map((item: any, index: number) => (
              <RideCard item={item} key={index} />
            ))}
            {recentRides?.length === 0 && (
              <Text>You didn't take any ride yet!</Text>
            )}
          </ScrollView>
        </View>
      </View>
      <Modal
        transparent={true}
        visible={isModalVisible}
        onRequestClose={handleClose}
      >
        <TouchableOpacity style={styles.modalBackground} activeOpacity={1}>
          <TouchableOpacity style={styles.modalContainer} activeOpacity={1}>
            <View>
              <Text style={styles.modalTitle}>New Ride Request Received!</Text>
              {region ? (
                <MapView
                  style={{ height: windowHeight(180) }}
                  region={region}
                  onRegionChangeComplete={(region) => setRegion(region)}
                  showsUserLocation={true}
                  showsMyLocationButton={true}
                >
                  {marker && <Marker coordinate={marker} />}
                  {currentLocation && <Marker coordinate={currentLocation} />}
                  {currentLocation && marker && (
                    <MapViewDirections
                      origin={currentLocation}
                      destination={marker}
                      apikey={process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!}
                      strokeWidth={4}
                      strokeColor="blue"
                    />
                  )}
                </MapView>
              ) : (
                <View style={{ height: windowHeight(180), justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
                  <ActivityIndicator size="large" color="#000" />
                  <Text style={{ marginTop: 10, fontSize: 14, color: '#666' }}>
                    Loading map...
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: "row" }}>
                <View style={styles.leftView}>
                  <Location color={colors.text} />
                  <View
                    style={[
                      styles.verticaldot,
                      { borderColor: color.buttonBg },
                    ]}
                  />
                  <Gps colors={colors.text} />
                </View>
                <View style={styles.rightView}>
                  <Text style={[styles.pickup, { color: colors.text }]}>
                    {currentLocationName}
                  </Text>
                  <View style={styles.border} />
                  <Text style={[styles.drop, { color: colors.text }]}>
                    {destinationLocationName}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  paddingTop: windowHeight(5),
                  fontSize: windowHeight(14),
                }}
              >
                Distance: {distance} km
              </Text>
              <Text
                style={{
                  paddingVertical: windowHeight(5),
                  paddingBottom: windowHeight(5),
                  fontSize: windowHeight(14),
                }}
              >
                Amount:
                {(distance * parseInt(driver?.rate!)).toFixed(2)} BDT
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginVertical: windowHeight(5),
                }}
              >
                <Button
                  title="Decline"
                  onPress={handleClose}
                  width={windowWidth(120)}
                  height={windowHeight(30)}
                  backgroundColor="crimson"
                />
                <Button
                  title="Accept"
                  onPress={() => acceptRideHandler()}
                  disabled={accepting}
                  width={windowWidth(120)}
                  height={windowHeight(30)}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
