import {
  View,
  Text,
  FlatList,
  Modal,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import React, { useEffect, useRef, useState } from "react";
import Header from "@/components/common/header";
import { rideData } from "@/configs/constants";
import { useTheme } from "@react-navigation/native";
import RenderRideItem from "@/components/ride/render.ride.item";
import { external } from "@/styles/external.style";
import styles from "./styles";
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
  const { driver, loading: DriverDataLoading, refreshDriverData } = useGetDriverData();
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
  // Store user's pickup location separately (from ride request)
  const [userPickupLocation, setUserPickupLocation] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Track active status synchronously for places where state update hasn't flushed yet
  const driverActiveRef = useRef<boolean>(false);
  const locationUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [accepting, setAccepting] = useState(false);
  // Map type: 'standard' | 'satellite' | 'hybrid' | 'terrain'
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid' | 'terrain'>('standard');
  // Track current ride request ID
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  // Track if region has been initialized (to prevent constant updates)
  const regionInitializedRef = useRef(false);
  // Flag to prevent onRegionChangeComplete from updating when we programmatically set region
  const isUpdatingRegionRef = useRef(false);
  // Track if current request has been cancelled
  const [isRequestCancelled, setIsRequestCancelled] = useState(false);
  // Track if we're waiting for server confirmation
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  // Countdown timer for ride request (10 seconds)
  const [countdownTimer, setCountdownTimer] = useState(10);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Store the accept promise resolver
  const acceptConfirmationRef = useRef<{
    resolve: (value: boolean) => void;
    reject: (error: any) => void;
    ride?: any; // Store ride data from server
  } | null>(null);

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
      // If driver is blocked, force status to be "Off" (inactive)
      if (driver?.accountStatus === "blocked") {
        setIsOn(false);
        driverActiveRef.current = false;
        await AsyncStorage.setItem("status", "inactive");
      } else {
        setIsOn(status === "active" ? true : false);
        driverActiveRef.current = status === "active";
      }
    };
    if (driver) {
      fetchStatus();
    }
  }, [driver]);

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
          
          // Handle ride request via websocket
          if (message?.type === "rideRequest" && message?.payload) {
            const orderData = message.payload;
            const requestId = message.requestId;
            
            console.log(`📥 Received ride request ${requestId}`);
            
            // Store request ID and reset cancellation state
            setCurrentRequestId(requestId);
            setIsRequestCancelled(false); // Reset cancellation state for new request
            setCountdownTimer(10); // Reset countdown to 10 seconds
            
            setIsModalVisible(true);
            // Store user's pickup location separately
            const pickupLoc = {
              latitude: orderData.currentLocation.latitude,
              longitude: orderData.currentLocation.longitude,
            };
            setUserPickupLocation(pickupLoc);
            // For the modal map, we can use the pickup location
            setCurrentLocation(pickupLoc);
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
          
          // Handle ride acceptance confirmation from server
          if (message?.type === "rideAcceptedConfirmation") {
            const confirmedRequestId = message.requestId;
            const rideData = message?.ride; // Ride data created by server atomically
            console.log(`✅ Received acceptance confirmation for request ${confirmedRequestId}`, {
              rideId: rideData?.id,
              status: rideData?.status,
              hasRideData: !!rideData,
              messageKeys: Object.keys(message || {}),
              rideDataKeys: rideData ? Object.keys(rideData) : [],
            });
            
            // If we're waiting for confirmation, resolve the promise with ride data
            if (acceptConfirmationRef.current && confirmedRequestId === currentRequestId) {
              console.log(`✅ Confirmation matches current request, storing ride data and resolving IMMEDIATELY`, {
                hasRideData: !!rideData,
                rideId: rideData?.id,
              });
              // Store ride data from server (already created atomically)
              if (acceptConfirmationRef.current) {
                if (rideData) {
                  acceptConfirmationRef.current.ride = rideData; // Store ride data
                  console.log(`📦 Stored ride data in ref:`, {
                    id: rideData.id,
                    status: rideData.status,
                  });
                } else {
                  console.warn(`⚠️ No ride data in confirmation message, but server confirmed - ride was created on server`);
                }
                // Resolve promise immediately - this will trigger navigation
                acceptConfirmationRef.current.resolve(true);
                // Keep ref alive briefly - acceptRideHandler will clear it after retrieving ride data
              }
              setWaitingForConfirmation(false);
            } else {
              console.log(`⚠️ Confirmation received but not waiting for it or request ID mismatch`, {
                hasRef: !!acceptConfirmationRef.current,
                confirmedRequestId,
                currentRequestId,
              });
            }
          }
          
          // Handle ride request cancellation (when another driver accepts)
          if (message?.type === "rideRequestCancelled") {
            const cancelledRequestId = message.requestId;
            console.log(`🚫 Ride request ${cancelledRequestId} was cancelled: ${message.reason || 'Accepted by another driver'}`);
            console.log(`🚫 Current request ID: ${currentRequestId}, Cancelled request ID: ${cancelledRequestId}`);
            
            // If we're waiting for confirmation, reject the promise
            if (acceptConfirmationRef.current && cancelledRequestId === currentRequestId) {
              console.log(`🚫 Request was cancelled while waiting for confirmation`);
              acceptConfirmationRef.current.reject(new Error("Request already accepted by another driver"));
              acceptConfirmationRef.current = null;
              setWaitingForConfirmation(false);
            }
            
            // Close modal if this is the current request OR if modal is open (safety check)
            if (cancelledRequestId === currentRequestId || (isModalVisible && currentRequestId)) {
              console.log(`🚫 Closing modal for cancelled request ${cancelledRequestId}`);
              // Clear countdown timer
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
              }
              setIsRequestCancelled(true);
              setIsModalVisible(false);
              setCurrentRequestId(null);
              setUserData(null);
              setUserPickupLocation(null); // Clear user pickup location
              setCountdownTimer(10); // Reset countdown
              Toast.show("This ride request was accepted by another driver.", {
                type: "info",
                placement: "bottom",
              });
            } else if (isModalVisible) {
              // If modal is open but requestId doesn't match, close it anyway (safety)
              console.log(`🚫 Modal is open but requestId mismatch, closing anyway`);
              // Clear countdown timer
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
              }
              setIsRequestCancelled(true);
              setIsModalVisible(false);
              setCurrentRequestId(null);
              setUserData(null);
              setUserPickupLocation(null); // Clear user pickup location
              setCountdownTimer(10); // Reset countdown
            }
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

  // Set up 20-second interval for location updates when driver is ON
  useEffect(() => {
    // Clear any existing interval first
    if (locationUpdateIntervalRef.current) {
      clearInterval(locationUpdateIntervalRef.current);
      locationUpdateIntervalRef.current = null;
    }

    // Don't set up interval if driver is blocked
    if (driver?.accountStatus === "blocked") {
      console.log('[Driver] Account is blocked - No location updates will be sent');
      setIsOn(false);
      driverActiveRef.current = false;
      return;
    }

    // Only set up interval if driver is ON
    if (!isOn) {
      console.log('[Driver] Status is OFF - No location updates will be sent');
      return;
    }

    console.log('[Driver] Status is ON - Starting 20-second location update interval');

    // Function to send location update
    const sendPeriodicLocationUpdate = async () => {
      // Check if driver is blocked - don't send updates if blocked
      if (driver?.accountStatus === "blocked") {
        console.log('[Driver] Account is blocked, stopping location updates');
        setIsOn(false);
        driverActiveRef.current = false;
        if (locationUpdateIntervalRef.current) {
          clearInterval(locationUpdateIntervalRef.current);
          locationUpdateIntervalRef.current = null;
        }
        return;
      }

      if (!driverActiveRef.current) {
        console.log('[Driver] Driver is OFF, skipping location update');
        return;
      }

      if (!currentLocation) {
        console.log('[Driver] No current location available yet');
        return;
      }

      try {
        // Get fresh location
        const location = await GeoLocation.getCurrentPositionAsync({
          accuracy: GeoLocation.Accuracy.Balanced,
        });

        const { latitude, longitude } = location.coords;
        const locationToSend = { latitude, longitude };
        
        // Update current location state
        setCurrentLocation(locationToSend);
        setLastLocation(locationToSend);

        // Send to server
        await sendLocationUpdate(locationToSend, true);
        console.log(`📍 [Driver] Periodic location update sent: (${latitude}, ${longitude})`);
      } catch (error: any) {
        console.error('[Driver] Failed to get location for periodic update:', error?.message || error);
        // If getting fresh location fails, try sending the last known location
        if (currentLocation) {
          await sendLocationUpdate(currentLocation, true);
        }
      }
    };

    // Send first update after 20 seconds
    const firstUpdateTimeout = setTimeout(() => {
      sendPeriodicLocationUpdate();
    }, 20000);

    // Then send every 20 seconds
    locationUpdateIntervalRef.current = setInterval(() => {
      sendPeriodicLocationUpdate();
    }, 20000) as any;

    // Cleanup function
    return () => {
      clearTimeout(firstUpdateTimeout);
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
        locationUpdateIntervalRef.current = null;
      }
      console.log('[Driver] Location update interval stopped');
    };
  }, [isOn, driver?.accountStatus]); // Removed currentLocation - we don't need to restart interval when location changes

  // Countdown timer for ride request popup (10 seconds)
  useEffect(() => {
    // Clear any existing timer first
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // Only start countdown if modal is visible and request is not cancelled
    if (isModalVisible && !isRequestCancelled && currentRequestId) {
      console.log(`⏰ Starting 10-second countdown timer for request ${currentRequestId}`);
      
      // Start countdown
      countdownTimerRef.current = setInterval(() => {
        setCountdownTimer((prev) => {
          if (prev <= 1) {
            // Timer reached 0, close modal
            console.log(`⏰ Countdown expired, closing modal for request ${currentRequestId}`);
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            setIsModalVisible(false);
            setCurrentRequestId(null);
            setUserData(null);
            setUserPickupLocation(null);
            Toast.show("Ride request expired. The request timed out.", {
              type: "info",
              placement: "bottom",
            });
            return 10; // Reset to 10 for next request
          }
          return prev - 1;
        });
      }, 1000); // Update every second
    }

    // Cleanup on unmount or when modal closes
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [isModalVisible, isRequestCancelled, currentRequestId]);

  useEffect(() => {
    (async () => {
      try {
        setLocationLoading(true);
        console.log('📍 [Driver] Requesting location permission...');
        
        // Request permission first
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
        
        // Get initial location with Balanced accuracy for faster response
        // Then improve accuracy in background
        try {
          // First, try to get a quick location with Balanced accuracy
          const initialLocation = await GeoLocation.getCurrentPositionAsync({
            accuracy: GeoLocation.Accuracy.Balanced, // Faster than High
          });
          const { latitude, longitude } = initialLocation.coords;
          console.log(`✅ [Driver] Got initial location: (${latitude}, ${longitude})`);
          
          // Immediately set location and region so map shows right away
          const initialRegion = {
            latitude,
            longitude,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          };
          
          setCurrentLocation({ latitude, longitude });
          setLastLocation({ latitude, longitude });
          isUpdatingRegionRef.current = true; // Prevent onRegionChangeComplete from firing
          setRegion(initialRegion);
          regionInitializedRef.current = true; // Mark region as initialized
          setLocationLoading(false);
          
          // Don't send location immediately - wait for 20-second interval
          // Location updates will be handled by the interval when driver is ON
          
          // Optionally get a more accurate location in the background
          // This doesn't block the UI
          setTimeout(async () => {
            try {
              const accurateLocation = await GeoLocation.getCurrentPositionAsync({
                accuracy: GeoLocation.Accuracy.High,
              });
              const { latitude: lat, longitude: lng } = accurateLocation.coords;
              console.log(`✅ [Driver] Got accurate location: (${lat}, ${lng})`);
              
              // Update with more accurate location
              setCurrentLocation({ latitude: lat, longitude: lng });
              setLastLocation({ latitude: lat, longitude: lng });
              // Only update region if it hasn't been initialized yet (first time)
              if (!regionInitializedRef.current) {
                isUpdatingRegionRef.current = true; // Prevent onRegionChangeComplete from firing
                setRegion({
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.0922,
                  longitudeDelta: 0.0421,
                });
                regionInitializedRef.current = true;
              }
              
              // Don't send location immediately - wait for 20-second interval
            } catch (err) {
              console.log('⚠️ [Driver] Failed to get accurate location (using initial):', err);
            }
          }, 1000);
          
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

        // Start watching position for map updates (but don't send to server here)
        await GeoLocation.watchPositionAsync(
          {
            accuracy: GeoLocation.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          async (position) => {
            const { latitude, longitude } = position.coords;
            const newLocation = { latitude, longitude };
            
            // Always update current location state for map display
            setCurrentLocation(newLocation);
            
            // Only update region if it hasn't been initialized yet (first time)
            // After that, let the user control the map zoom/pan
            if (!region || !regionInitializedRef.current) {
              isUpdatingRegionRef.current = true; // Prevent onRegionChangeComplete from firing
              setRegion({
                latitude,
                longitude,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              });
              regionInitializedRef.current = true;
            }
            
            // Update lastLocation for map tracking (but don't send to server here)
            setLastLocation(newLocation);
            // Location updates to server are handled by the 20-second interval
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
        isUpdatingRegionRef.current = true; // Prevent onRegionChangeComplete from firing
        setRegion(nouakchottLocation);
        regionInitializedRef.current = true;
        setCurrentLocation({ latitude: nouakchottLocation.latitude, longitude: nouakchottLocation.longitude });
      }
    })();
  }, []);


  const handleClose = () => {
    // Clear countdown timer
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    // If we're waiting for confirmation, cancel the promise
    if (acceptConfirmationRef.current) {
      acceptConfirmationRef.current.reject(new Error("User cancelled"));
      acceptConfirmationRef.current = null;
    }
    setWaitingForConfirmation(false);
    setIsModalVisible(false);
    setCurrentRequestId(null);
    setUserData(null);
    setUserPickupLocation(null); // Clear user pickup location
    setIsRequestCancelled(false); // Reset cancellation state when closing
    setCountdownTimer(10); // Reset countdown
  };

  // Refresh driver data (wallet balance, earnings, etc.)
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshDriverData();
      console.log("[Refresh] Driver data refreshed successfully");
      Toast.show("Data refreshed successfully!", {
        type: "success",
        placement: "bottom",
      });
    } catch (error: any) {
      console.error("[Refresh] Error refreshing driver data:", error);
      Toast.show("Failed to refresh data. Please try again.", {
        type: "danger",
        placement: "bottom",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusChange = async () => {
    // Prevent blocked drivers from turning "On"
    if (driver?.accountStatus === "blocked") {
      Toast.show("Your account is blocked. You cannot go online.", {
        type: "danger",
        placement: "bottom",
      });
      // Ensure status is set to "Off" (inactive)
      setIsOn(false);
      driverActiveRef.current = false;
      await AsyncStorage.setItem("status", "inactive");
      return;
    }

    if (!loading) {
      setloading(true);
      const accessToken = await AsyncStorage.getItem("accessToken");
      const nextStatus = !isOn ? "active" : "inactive";
      console.log("[DriverStatus] Sending status update:", nextStatus);
      
      try {
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
          
          // If driver just went "on", send location immediately so they can be found
          if (nextIsOn && currentLocation) {
            console.log("[DriverStatus] Driver went ON - sending immediate location update");
            // Send location immediately when going online
            setTimeout(() => {
              sendLocationUpdate(currentLocation, true).catch((err) => {
                console.error("[DriverStatus] Failed to send immediate location:", err);
              });
            }, 500); // Small delay to ensure WebSocket is ready
          }
        } else {
          setloading(false);
          console.log("[DriverStatus] Status update response missing data");
        }
      } catch (error: any) {
        setloading(false);
        const errorMessage = error?.response?.data?.message || "Failed to update status";
        Toast.show(errorMessage, {
          type: "danger",
          placement: "bottom",
        });
        console.error("[DriverStatus] Error updating status:", error);
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
    
    // Clear countdown timer when accepting
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    
    // Check if request has been cancelled
    if (isRequestCancelled) {
      console.log("[Driver] Request has been cancelled, cannot accept");
      Toast.show("This ride request was already accepted by another driver.", {
        type: "info",
        placement: "bottom",
      });
      setIsModalVisible(false);
      setCurrentRequestId(null);
      setUserData(null);
      return;
    }
    
    if (!currentRequestId) {
      console.log("[Driver] No active request ID");
      Toast.show("No active ride request.", { type: "danger" });
      return;
    }
    
    // Clear countdown timer when accepting
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    try {
      setAccepting(true);
      console.log(`[Driver] Accept button pressed for request ${currentRequestId}`);
      
      if (!userData?.id) {
        console.log("[Driver] No user data available for this request");
        Toast.show("No rider information found.", { type: "danger" });
        setAccepting(false);
        return;
      }
      
      // Get driver ID for sending to server
      const accessToken = await AsyncStorage.getItem("accessToken");
      let driverId = driver?.id;
      if (!driverId) {
        try {
          const res = await axios.get(
            `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/me`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          driverId = res?.data?.driver?.id;
        } catch (e) {
          console.error("[Driver] Failed to get driver ID:", e);
        }
      }
      
      // Notify the server via WS that the driver accepted
      // Server will check database and only allow if no ride exists for this user
      // Wait for server confirmation before creating ride in database
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.log("❌ WebSocket not open, cannot accept ride");
        Toast.show("Connection error. Please try again.", {
          type: "danger",
          placement: "bottom",
        });
        setAccepting(false);
        return;
      }

      // Send acceptance to server and wait for confirmation
      wsRef.current.send(
        JSON.stringify({
          type: "driverAccept",
          role: "driver",
          driverId: driverId,
          userId: userData.id,
          requestId: currentRequestId,
          payload: {
            user: userData,
            currentLocation,
            marker,
            distance,
            currentLocationName,
            destinationLocationName: destinationLocationName, // Use correct field name
            destinationLocation: destinationLocationName, // Also include for backward compatibility
            driver: {
              ...driver,
              rate: driver?.rate, // Ensure rate is included
            },
          },
        })
      );
      console.log(`📣 Sent driverAccept via WS for request ${currentRequestId}, waiting for server confirmation...`);
      
      // Wait for server confirmation (with timeout) - server creates ride atomically
      let serverConfirmed = false;
      let storedRideData = null; // Store ride data separately
      let confirmationReceived = false; // Track if we received confirmation
      const confirmationPromise = new Promise<boolean>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!confirmationReceived) {
            console.log(`⏰ Server confirmation timeout after 5 seconds`);
            resolve(false); // Timeout - no confirmation received
          }
        }, 5000); // 5 second timeout (increased from 3)

        // Store the promise resolver
        acceptConfirmationRef.current = {
          resolve: (value: boolean) => {
            clearTimeout(timeout);
            confirmationReceived = true;
            serverConfirmed = true;
            // Store ride data from ref before resolving
            storedRideData = acceptConfirmationRef.current?.ride || null;
            console.log(`✅ Promise resolved, stored ride data:`, {
              hasRideData: !!storedRideData,
              rideId: storedRideData?.id,
              serverConfirmed: true,
            });
            resolve(value);
          },
          reject: (error: any) => {
            clearTimeout(timeout);
            // If it's a cancellation, reject immediately
            if (error?.message?.includes("already accepted") || error?.message?.includes("cancelled")) {
              reject(error);
            } else {
              // For other errors, proceed optimistically
              console.log(`⚠️ Server confirmation error, proceeding anyway:`, error);
              resolve(false);
            }
          },
          ride: null, // Initialize ride property
        };
      });

      // Wait for server confirmation - server creates ride atomically
      let wasCancelled = false;
      try {
        // Wait for server confirmation (but don't block if it times out)
        await confirmationPromise;
        console.log(`📡 [Driver] Confirmation promise resolved, serverConfirmed: ${serverConfirmed}, hasStoredRideData: ${!!storedRideData}`);
      } catch (error: any) {
        // Only handle cancellation errors - these mean ride was NOT created
        if (error?.message?.includes("already accepted") || error?.message?.includes("cancelled")) {
          console.error(`❌ Request was cancelled by server:`, error);
          wasCancelled = true;
          setAccepting(false);
          setIsModalVisible(false);
          setCurrentRequestId(null);
          setUserData(null);
          // Clear ref on cancellation
          acceptConfirmationRef.current = null;
          Toast.show("This ride request was already accepted by another driver.", {
            type: "info",
            placement: "bottom",
          });
          return;
        }
        // For other errors, proceed anyway (might be network delay)
        console.log(`⚠️ Server confirmation issue, proceeding optimistically:`, error);
      }
      
      // If we received explicit cancellation, don't proceed
      if (wasCancelled) {
        return;
      }
      
      // Retrieve ride data - try storedRideData first, then ref as fallback
      let serverRideData = storedRideData;
      if (!serverRideData && acceptConfirmationRef.current?.ride) {
        serverRideData = acceptConfirmationRef.current.ride;
        console.log(`📦 Retrieved ride data from ref fallback:`, {
          rideId: serverRideData?.id,
          status: serverRideData?.status,
        });
      }
      
      // Clear confirmation ref AFTER retrieving ride data
      acceptConfirmationRef.current = null;
      
      // DECISION LOGIC: Only fail if we're CERTAIN the ride wasn't created
      // If server confirmed OR we have ride data OR no cancellation was received → proceed
      // Only fail if: no confirmation AND no ride data AND we're sure it failed
      if (!serverConfirmed && !serverRideData) {
        // Check if we received a cancellation message (would have been caught above)
        // If we got here without cancellation, might be network delay - proceed optimistically
        console.log(`⚠️ [Driver] No confirmation and no ride data, but no cancellation either - proceeding optimistically (ride might have been created)`);
        // Don't fail - proceed with minimal ride object
      }
      
      // If server confirmed, the ride was created on server even if we don't have the data
      // IMPORTANT: If server confirmed but we don't have ride data, we MUST fetch it from database
      // Don't use temp IDs - they won't work for status updates
      let rideData = serverRideData;
      
      if (!rideData && serverConfirmed) {
        // Server confirmed but no ride data - fetch it from database
        console.log(`⚠️ [Driver] Server confirmed but no ride data - fetching from database...`);
        try {
          const response = await axios.get(
            `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/get-rides`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          
          const rides = response.data?.rides || response.data || [];
          const actualRide = rides.find((ride: any) => 
            String(ride.userId) === String(userData.id) && 
            String(ride.driverId) === String(driverId) && 
            (ride.status === "Accepted" || ride.status === "Processing")
          );
          
          if (actualRide && actualRide.id) {
            rideData = {
              id: String(actualRide.id),
              userId: String(actualRide.userId),
              driverId: String(actualRide.driverId),
              status: actualRide.status || "Accepted",
              charge: actualRide.charge,
              currentLocationName: actualRide.currentLocationName,
              destinationLocationName: actualRide.destinationLocationName,
              distance: actualRide.distance,
            };
            console.log(`✅ [Driver] Fetched actual ride from database: ${rideData.id}`);
          } else {
            console.error(`❌ [Driver] Could not find ride in database after server confirmation`);
            // Still proceed but with temp ID - will be fixed in ride-details screen
            rideData = { 
              id: `temp_${Date.now()}`, 
              status: "Accepted",
              userId: userData.id,
              driverId: driverId,
            };
          }
        } catch (fetchError) {
          console.error(`❌ [Driver] Failed to fetch ride from database:`, fetchError);
          // Still proceed but with temp ID - will be fixed in ride-details screen
          rideData = { 
            id: `temp_${Date.now()}`, 
            status: "Accepted",
            userId: userData.id,
            driverId: driverId,
          };
        }
      } else if (!rideData) {
        // No server confirmation and no ride data - use temp ID (will be fixed in ride-details)
        rideData = { 
          id: `temp_${Date.now()}`, 
          status: "Accepted",
          userId: userData.id,
          driverId: driverId,
        };
      }
      
      console.log(`📝 [Driver] Final ride data to use - PROCEEDING TO NAVIGATION:`, {
        rideId: rideData.id,
        status: rideData.status,
        hasValidRide: !!rideData.id,
        serverConfirmed,
        hasServerRideData: !!serverRideData,
        willProceed: true,
        reason: serverConfirmed ? 'Server confirmed' : serverRideData ? 'Has ride data' : 'Optimistic (no cancellation)',
      });

      // Try to send push notification (non-blocking - don't prevent navigation)
      try {
        const data = {
          ...driver,
          currentLocation,
          marker,
          distance,
        };
        const driverPushToken = "ExponentPushToken[A22bNzKGUMegAXVEqzDnUx]";
        await sendPushNotification(driverPushToken, data);
      } catch (pushError) {
        console.log(`⚠️ Failed to send push notification, but continuing:`, pushError);
        // Don't block navigation for push notification errors
      }

      // Clear request ID and modal BEFORE navigation
      setCurrentRequestId(null);
      setIsModalVisible(false);
      setAccepting(false); // Reset accepting state immediately

      // Prepare ride data for navigation
      // Use the stored user pickup location (from the ride request)
      const pickupLoc = userPickupLocation || {
        latitude: userData?.currentLocation?.latitude || currentLocation?.latitude,
        longitude: userData?.currentLocation?.longitude || currentLocation?.longitude,
      };
      
      if (!pickupLoc.latitude || !pickupLoc.longitude) {
        console.error("[Driver] Missing user pickup location, cannot navigate");
        Toast.show("Missing pickup location. Please try again.", { type: "danger" });
        setAccepting(false);
        return;
      }
      
      if (!marker || !marker.latitude || !marker.longitude) {
        console.error("[Driver] Missing destination location, cannot navigate");
        Toast.show("Missing destination location. Please try again.", { type: "danger" });
        setAccepting(false);
        return;
      }
      
      // Get driver's current location quickly (with timeout to not block navigation)
      let driverCurrentLoc = lastLocation; // Use last known location as fallback
      try {
        // Try to get fresh location, but don't wait too long
        const locationPromise = GeoLocation.getCurrentPositionAsync({
          accuracy: GeoLocation.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Location timeout")), 2000)
        );
        
        const driverLoc = await Promise.race([locationPromise, timeoutPromise]) as any;
        driverCurrentLoc = {
          latitude: driverLoc.coords.latitude,
          longitude: driverLoc.coords.longitude,
        };
        console.log(`[Driver] Got fresh driver location for navigation:`, driverCurrentLoc);
      } catch (err) {
        console.log(`[Driver] Using last known location or will fetch on ride-details screen`);
        // Use last known location if available, otherwise ride-details will fetch it
      }
      
      // Prepare ride data - use ride from server (already created atomically)
      const rideDataForNavigation = {
        user: userData,
        currentLocation: pickupLoc, // User's pickup location
        marker: marker, // Destination
        driver,
        distance,
        rideData: {
          ...rideData, // Use ride data from server (already created atomically)
          status: "Accepted", // Ensure status is "Accepted" for immediate pickup view
        },
        // Also include location names for display
        currentLocationName: currentLocationName,
        destinationLocationName: destinationLocationName,
        // Pass driver's current location to avoid delay on ride-details screen
        driverLocation: driverCurrentLoc,
      };
      
      console.log(`✅ [Driver] Ride accepted! Navigating to pickup map...`, {
        pickup: pickupLoc,
        destination: marker,
        driverLocation: driverCurrentLoc,
        rideId: rideData.id,
        status: "Accepted",
      });
      
      // Navigate IMMEDIATELY - don't wait for anything else
      router.push({
        pathname: "/(routes)/ride-details",
        params: { orderData: JSON.stringify(rideDataForNavigation) },
      });
      
      // Show success message
      Toast.show("Ride accepted! Navigate to pickup location.", {
        type: "success",
        placement: "bottom",
      });
    } catch (error: any) {
      console.log("[Driver] Accept error:", error?.message || error);
      
      // Clean up confirmation ref if still set
      if (acceptConfirmationRef.current) {
        acceptConfirmationRef.current = null;
      }
      setWaitingForConfirmation(false);
      
      // If error is about request already accepted, handle gracefully
      if (error?.response?.data?.message?.includes("already accepted") || 
          error?.response?.data?.success === false && error?.response?.data?.message?.includes("already accepted") ||
          error?.message?.includes("already accepted")) {
        setIsRequestCancelled(true);
        setIsModalVisible(false);
        setCurrentRequestId(null);
        setUserData(null);
        Toast.show("This ride was already accepted by another driver.", {
          type: "info",
          placement: "bottom",
        });
      } else {
        Toast.show(error?.response?.data?.message || error?.message || "Failed to accept ride. Please try again.", { type: "danger" });
      }
    } finally {
      setAccepting(false);
    }
  };

  return (
    <ScrollView
      style={[external.fx_1]}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[color.buttonBg]} // Android
          tintColor={color.buttonBg} // iOS
        />
      }
    >
      <View style={[external.fx_1]}>
        {/* Main Map View - Shows driver's current location immediately */}
        <View style={{ height: windowHeight(350), position: 'relative' }}>
        {region ? (
          <MapView
            style={{ flex: 1 }}
            region={region}
            onRegionChangeComplete={(newRegion) => {
              // Only update region if user manually interacted with map
              // Don't update if we're programmatically setting the region
              if (regionInitializedRef.current && !isUpdatingRegionRef.current) {
                setRegion(newRegion);
              }
              // Reset the flag after a short delay
              setTimeout(() => {
                isUpdatingRegionRef.current = false;
              }, 100);
            }}
            showsUserLocation={true}
            showsMyLocationButton={true}
            followsUserLocation={false}
            loadingEnabled={true}
            initialRegion={region}
            mapType={mapType}
          >
            {currentLocation && (
              <Marker
                coordinate={currentLocation}
                title="Your Location"
                pinColor="blue"
              />
            )}
          </MapView>
        ) : locationLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
            <ActivityIndicator size="large" color={color.buttonBg} />
            <Text style={{ marginTop: 10, fontSize: 16, color: '#666' }}>
              Loading your location...
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
            <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', paddingHorizontal: 20 }}>
              Location permission required. Please enable location access in settings.
            </Text>
          </View>
        )}
        
        {/* Header overlay on top of map */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(255, 255, 255, 0.95)', zIndex: 10 }}>
          <Header 
            isOn={isOn} 
            toggleSwitch={() => handleStatusChange()} 
            walletBalance={driver?.walletBalance || 0}
            isBlocked={driver?.accountStatus === "blocked"}
          />
        </View>
        
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
      
      {/* Ride type selection below map */}
      <View style={styles.spaceBelow}>
        <FlatList
          data={rideData}
          numColumns={2}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <RenderRideItem item={item} colors={colors} />
          )}
        />
      </View>
      <Modal
        transparent={true}
        visible={isModalVisible}
        onRequestClose={handleClose}
      >
        <TouchableOpacity style={styles.modalBackground} activeOpacity={1}>
          <TouchableOpacity style={styles.modalContainer} activeOpacity={1}>
            <View>
              <Text style={styles.modalTitle}>
                {isRequestCancelled ? "Ride Request No Longer Available" : "New Ride Request Received!"}
              </Text>
              {isRequestCancelled && (
                <Text style={{ 
                  textAlign: 'center', 
                  color: '#ef4444', 
                  marginTop: 10, 
                  fontSize: 14,
                  fontWeight: '600'
                }}>
                  This request was already accepted by another driver.
                </Text>
              )}
              {!isRequestCancelled && isModalVisible && (
                <View style={{
                  alignItems: 'center',
                  marginTop: 10,
                  marginBottom: 5,
                }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: countdownTimer <= 3 ? '#ef4444' : '#3b82f6',
                  }}>
                    {countdownTimer} seconds remaining
                  </Text>
                  {/* Visual countdown bar */}
                  <View style={{
                    width: '80%',
                    height: 4,
                    backgroundColor: '#e5e7eb',
                    borderRadius: 2,
                    marginTop: 8,
                    overflow: 'hidden',
                  }}>
                    <View style={{
                      width: `${(countdownTimer / 10) * 100}%`,
                      height: '100%',
                      backgroundColor: countdownTimer <= 3 ? '#ef4444' : '#3b82f6',
                      borderRadius: 2,
                    }} />
                  </View>
                </View>
              )}
              {region ? (
                <MapView
                  style={{ height: windowHeight(180) }}
                  region={region}
                  onRegionChangeComplete={(region) => setRegion(region)}
                  showsUserLocation={true}
                  showsMyLocationButton={true}
                  mapType={mapType}
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
                {(distance * parseInt(driver?.rate!)).toFixed(2)} MRU
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
                  title={
                    isRequestCancelled 
                      ? "Already Taken" 
                      : waitingForConfirmation 
                      ? "Waiting..." 
                      : accepting 
                      ? "Accepting..." 
                      : "Accept"
                  }
                  onPress={() => acceptRideHandler()}
                  disabled={isRequestCancelled || accepting || waitingForConfirmation}
                  width={windowWidth(120)}
                  height={windowHeight(30)}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      </View>
    </ScrollView>
  );
}
