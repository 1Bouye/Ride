import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Dimensions,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput,
} from "react-native";
import styles from "./styles";
import { useCallback, useEffect, useRef, useState } from "react";
import { external } from "@/styles/external.style";
import { windowHeight, windowWidth } from "@/themes/app.constant";
import MapView, { Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { router } from "expo-router";
import { Clock, LeftArrow, PickLocation, PickUpLocation } from "@/utils/icons";
import color from "@/themes/app.colors";
import DownArrow from "@/assets/icons/downArrow";
import PlaceHolder from "@/assets/icons/placeHolder";
import _ from "lodash";
import axios from "axios";
import * as Location from "expo-location";
import { Toast } from "react-native-toast-notifications";
import moment from "moment";
import { parseDuration } from "@/utils/time/parse.duration";
import Button from "@/components/common/button";
import { useGetUserData } from "@/hooks/useGetUserData";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

export default function RidePlanScreen() {
  const { user } = useGetUserData();
  const ws = useRef<any>(null);
  const notificationListener = useRef<any>();
  const [wsConnected, setWsConnected] = useState(false);
  const [places, setPlaces] = useState<any>([]);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<any>(null); // Start with null, will be set when we get real location
  const [locationLoading, setLocationLoading] = useState(true); // Track if we're still loading location
  const [marker, setMarker] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [distance, setDistance] = useState<any>(null);
  const [locationSelected, setlocationSelected] = useState(false);
  const [selectedVehcile, setselectedVehcile] = useState("Car");
  const [vehicleSelectionVisible, setVehicleSelectionVisible] = useState(false);
  const [showConfirmSelection, setShowConfirmSelection] = useState(false);
  const [selectedVehicleImage, setSelectedVehicleImage] = useState<any>(null);
  const [travelTimes, setTravelTimes] = useState({
    driving: null,
    walking: null,
    bicycling: null,
    transit: null,
  });
  const [keyboardAvoidingHeight, setkeyboardAvoidingHeight] = useState(false);
  const [driverLists, setdriverLists] = useState<DriverType[]>([]);
  const [selectedDriver, setselectedDriver] = useState<DriverType>();
  const [driverLoader, setdriverLoader] = useState(false);
  const driverTimeoutRef = useRef<any>(null);
  const [assignedRide, setAssignedRide] = useState<any>(null); // set when driver accepts

  // Only set up notifications if not in Expo Go
  useEffect(() => {
    const isExpoGo = Constants?.executionEnvironment === "storeClient";
    if (isExpoGo) {
      return; // Skip notification setup in Expo Go
    }

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          const orderData = {
            currentLocation: notification.request.content.data.currentLocation,
            marker: notification.request.content.data.marker,
            distance: notification.request.content.data.distance,
            driver: notification.request.content.data.orderData,
          };
          router.push({
            pathname: "/(routes)/ride-details",
            params: { orderData: JSON.stringify(orderData) },
          });
        });
    } catch (error) {
      console.log("Notification handler setup error:", error);
    }

    return () => {
      if (notificationListener.current) {
        try {
          Notifications.removeNotificationSubscription(
            notificationListener.current
          );
        } catch (error) {
          console.log("Notification cleanup error:", error);
        }
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLocationLoading(true);
        console.log('📍 Requesting location permission...');
        
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.error('❌ Location permission denied');
          Toast.show(
            "Please approve your location tracking otherwise you can't use this app!",
            {
              type: "danger",
              placement: "bottom",
            }
          );
          setLocationLoading(false);
          return;
        }

        console.log('📍 Getting current location...');
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        
        const { latitude, longitude } = location.coords;
        console.log(`✅ Got location: (${latitude}, ${longitude})`);
        
        setCurrentLocation({ latitude, longitude });
        setRegion({
          latitude,
          longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
        setLocationLoading(false);
      } catch (error: any) {
        console.error('❌ Failed to get location:', error?.message || error);
        setLocationLoading(false);
        Toast.show(
          "Failed to get your location. Please check your GPS settings and try again.",
          {
            type: "danger",
            placement: "bottom",
          }
        );
        // Fallback to Nouakchott, Mauritania (capital) if location fails
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

  // Get WebSocket URL - handle Android emulator and physical device
  const getWebSocketUrl = () => {
    // Check if WebSocket URL is configured in environment
    const wsUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL;
    if (wsUrl) {
      return wsUrl;
    }
    
    // For Android emulator, use 10.0.2.2 to reach host machine
    // For physical device, use the server IP from SERVER_URI
    if (Platform.OS === 'android') {
      // Try to extract IP from SERVER_URI, fallback to emulator address
      const serverUri = process.env.EXPO_PUBLIC_SERVER_URI || '';
      const ipMatch = serverUri.match(/http:\/\/([^:]+)/);
      if (ipMatch && ipMatch[1] && !ipMatch[1].includes('localhost')) {
        return `ws://${ipMatch[1]}:8080`;
      }
      // Default to emulator address for Android
      return 'ws://10.0.2.2:8080';
    }
    
    // For iOS or web, try to extract from SERVER_URI or use localhost
    const serverUri = process.env.EXPO_PUBLIC_SERVER_URI || '';
    const ipMatch = serverUri.match(/http:\/\/([^:]+)/);
    if (ipMatch && ipMatch[1]) {
      return `ws://${ipMatch[1]}:8080`;
    }
    
    // Fallback
    return 'ws://localhost:8080';
  };

  const initializeWebSocket = () => {
    const wsUrl = getWebSocketUrl();
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    
    try {
      ws.current = new WebSocket(wsUrl);
      ws.current.onopen = () => {
        console.log("✅ Connected to WebSocket server");
        setWsConnected(true);
        // Identify this user so server can forward accept events
        try {
          if (user?.id) {
            ws.current?.send(
              JSON.stringify({
                type: "identify",
                role: "user",
                userId: user.id,
              })
            );
            console.log("🪪 Identified to WS as user:", user.id);
          }
        } catch {}
      };

      ws.current.onerror = (e: any) => {
        console.error("❌ WebSocket error:", e.message || 'Connection failed');
        setWsConnected(false);
      };

      ws.current.onclose = (e: any) => {
        console.log("🔌 WebSocket closed:", e.code, e.reason || 'Connection closed');
        setWsConnected(false);
        // Attempt to reconnect after a delay (only if not manually closed)
        if (e.code !== 1000) {
          setTimeout(() => {
            if (ws.current?.readyState !== WebSocket.OPEN) {
              console.log('🔄 Attempting to reconnect WebSocket...');
              initializeWebSocket();
            }
          }, 5000);
        }
      };
    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      setWsConnected(false);
    }
  };

  useEffect(() => {
    initializeWebSocket();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      // Cleanup timeout
      if (driverTimeoutRef.current) {
        clearTimeout(driverTimeoutRef.current);
        driverTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Only register for push notifications if not in Expo Go
    // Expo Go doesn't support push notifications in SDK 53+
    const isExpoGo = Constants?.executionEnvironment === "storeClient";
    if (!isExpoGo) {
      registerForPushNotificationsAsync();
    }
  }, []);

  async function registerForPushNotificationsAsync() {
    try {
      // Skip in Expo Go - push notifications not supported in SDK 53+
      const isExpoGo = Constants?.executionEnvironment === "storeClient";
      if (isExpoGo) {
        return;
      }

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
          return;
        }
        try {
          const pushTokenString = (
            await Notifications.getExpoPushTokenAsync({
              projectId,
            })
          ).data;
          console.log(pushTokenString);
          // return pushTokenString;
        } catch (e: unknown) {
          console.log("Push notification error:", e);
          // Silently fail in Expo Go
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
    } catch (error) {
      // Silently handle errors in Expo Go
      console.log("Notification setup error:", error);
    }
  }

  const fetchPlaces = async (input: any) => {
    try {
      if (!process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY) {
        console.error("[fetchPlaces] Google API key is not configured");
        Toast.show("Google Maps API key is not configured", {
          type: "danger",
          placement: "bottom",
        });
        return;
      }

      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json`,
        {
          params: {
            input,
            key: process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY,
            language: "en",
          },
        }
      );

      if (response.data && response.data.predictions) {
        setPlaces(response.data.predictions);
      } else {
        setPlaces([]);
      }
    } catch (error: any) {
      console.error("[fetchPlaces] Error:", error);
      setPlaces([]);
      Toast.show("Unable to load places. Please try again.", {
        type: "danger",
        placement: "bottom",
      });
    }
  };

  const debouncedFetchPlaces = useCallback(_.debounce(fetchPlaces, 100), []);

  useEffect(() => {
    if (query.length > 2) {
      debouncedFetchPlaces(query);
    } else {
      setPlaces([]);
    }
  }, [query, debouncedFetchPlaces]);

  const handleInputChange = (text: any) => {
    setQuery(text);
  };

  const fetchTravelTimes = async (origin: any, destination: any) => {
    const modes = ["driving", "walking", "bicycling", "transit"];
    let travelTimes = {
      driving: null,
      walking: null,
      bicycling: null,
      transit: null,
    } as any;

    for (const mode of modes) {
      let params = {
        origins: `${origin.latitude},${origin.longitude}`,
        destinations: `${destination.latitude},${destination.longitude}`,
        key: process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY!,
        mode: mode,
      } as any;

      if (mode === "driving") {
        params.departure_time = "now";
      }

      try {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/distancematrix/json`,
          { params }
        );

        const elements = response.data.rows[0].elements[0];
        if (elements.status === "OK") {
          travelTimes[mode] = elements.duration.text;
        }
      } catch (error) {
        console.log(error);
      }
    }

    setTravelTimes(travelTimes);
  };

  const handlePlaceSelect = async (placeId: any) => {
    try {
      console.log("[handlePlaceSelect] Place selected:", placeId);
      
      // Show loading state immediately
      setlocationSelected(true);
      // Do NOT search yet; first let the user pick vehicle type
      setdriverLoader(false);
      setdriverLists([]);
      setVehicleSelectionVisible(true);
      setPlaces([]);
      setkeyboardAvoidingHeight(false);

      if (!process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY) {
        throw new Error("Google Maps API key not configured");
      }

      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/place/details/json`,
        {
          params: {
            place_id: placeId,
            key: process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY,
          },
          timeout: 10000,
        }
      );

      if (!response.data || !response.data.result) {
        throw new Error("Invalid response from Google Places API");
      }

      const { lat, lng } = response.data.result.geometry.location;

      const selectedDestination = { latitude: lat, longitude: lng };
      
      // Update map region and marker
      setRegion({
        ...region,
        latitude: lat,
        longitude: lng,
      });
      setMarker({
        latitude: lat,
        longitude: lng,
      });

      // Fetch travel times in parallel with driver request
      if (currentLocation) {
        fetchTravelTimes(currentLocation, selectedDestination).catch((error) => {
          console.error("[handlePlaceSelect] Error fetching travel times:", error);
        });
      }

      console.log("[handlePlaceSelect] Destination set, awaiting vehicle selection...");
    } catch (error: any) {
      console.error("[handlePlaceSelect] Error:", error);
      setdriverLoader(false);
      setlocationSelected(false);
      Toast.show(
        error?.message || "Failed to select location. Please try again.",
        {
          type: "danger",
          placement: "bottom",
        }
      );
    }
  };

  // Simple vehicle options (can be replaced by backend-provided catalog later)
  const vehicleOptions = [
    {
      type: "Car",
      image: require("@/assets/images/vehicles/car.png"),
    },
    {
      type: "Motorcycle",
      image: require("@/assets/images/vehicles/bike.png"),
    },
  ];

  const handleVehicleSelect = (type: string, image: any) => {
    setselectedVehcile(type);
    setSelectedVehicleImage(image);
    setShowConfirmSelection(true);
  };

  const confirmVehicleSelection = () => {
    // Start searching for driver only after confirmation
    setShowConfirmSelection(false);
    setVehicleSelectionVisible(false);
    setdriverLoader(true);
    requestNearbyDrivers();
  };

  const calculateDistance = (lat1: any, lon1: any, lat2: any, lon2: any) => {
    var p = 0.017453292519943295; // Math.PI / 180
    var c = Math.cos;
    var a =
      0.5 -
      c((lat2 - lat1) * p) / 2 +
      (c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))) / 2;

    return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
  };

  const getEstimatedArrivalTime = (travelTime: any) => {
    const now = moment();
    const travelMinutes = parseDuration(travelTime);
    const arrivalTime = now.add(travelMinutes, "minutes");
    return arrivalTime.format("hh:mm A");
  };

  useEffect(() => {
    if (marker && currentLocation) {
      const dist = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        marker.latitude,
        marker.longitude
      );
      setDistance(dist);
    }
  }, [marker, currentLocation]);

  const getNearbyDrivers = () => {
    if (!ws.current) {
      console.error("[getNearbyDrivers] WebSocket not initialized");
      setdriverLoader(false);
      Toast.show("Connection error. Please try again.", {
        type: "danger",
        placement: "bottom",
      });
      return;
    }

    ws.current.onmessage = async (e: any) => {
      try {
        // Clear timeout since we got a response
        if (driverTimeoutRef.current) {
          clearTimeout(driverTimeoutRef.current);
          driverTimeoutRef.current = null;
        }

        const message = JSON.parse(e.data);
        if (message.type === "nearbyDrivers") {
          if (message.drivers && message.drivers.length > 0) {
            await getDriversData(message.drivers);
          } else {
            // No drivers found
            setdriverLists([]);
            setdriverLoader(false);
            Toast.show("No drivers available in your area.", {
              type: "info",
              placement: "bottom",
            });
          }
        }
        // Driver accepted – transition UI
        if (message.type === "rideAccepted" && message.payload) {
          // Only react if this acceptance is for the logged-in user
          const acceptedForUserId = message.payload?.user?.id;
          if (acceptedForUserId && user?.id && acceptedForUserId !== user.id) {
            return;
          }
          console.log("[WS] rideAccepted (for me):", message.payload);
          setdriverLoader(false);
          setAssignedRide(message.payload);
          if (!marker && message.payload?.marker) {
            setMarker(message.payload.marker);
          }
          Toast.show("Driver is on the way!", { type: "success", placement: "bottom" });
        }
      } catch (error) {
        console.error("[getNearbyDrivers] Error parsing websocket:", error);
        setdriverLoader(false);
        Toast.show("Error receiving driver data. Please try again.", {
          type: "danger",
          placement: "bottom",
        });
      }
    };

    ws.current.onerror = (error: any) => {
      console.error("[getNearbyDrivers] WebSocket error:", error);
      if (driverTimeoutRef.current) {
        clearTimeout(driverTimeoutRef.current);
        driverTimeoutRef.current = null;
      }
      setdriverLoader(false);
      Toast.show("Connection error. Please try again.", {
        type: "danger",
        placement: "bottom",
      });
    };
  };

  const getDriversData = async (drivers: any) => {
    try {
      if (!drivers || drivers.length === 0) {
        setdriverLists([]);
        setdriverLoader(false);
        Toast.show("No drivers available.", {
          type: "info",
          placement: "bottom",
        });
        return;
      }

      // Extract driver IDs from the drivers array
      const driverIds = drivers.map((driver: any) => driver.id).join(",");
      
      if (!process.env.EXPO_PUBLIC_SERVER_URI) {
        throw new Error("Server URI not configured");
      }

      const response = await axios.get(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/get-drivers-data`,
        {
          params: { ids: driverIds },
          timeout: 10000, // 10 second timeout
        }
      );

      const driverData = response.data;
      setdriverLists(Array.isArray(driverData) ? driverData : []);
      setdriverLoader(false);
    } catch (error: any) {
      console.error("[getDriversData] Error:", error);
      setdriverLists([]);
      setdriverLoader(false);
      Toast.show("Failed to load drivers. Please try again.", {
        type: "danger",
        placement: "bottom",
      });
    }
  };

  const requestNearbyDrivers = () => {
    console.log("[requestNearbyDrivers] wsConnected:", wsConnected);
    
    // Set loading state
    setdriverLoader(true);
    setdriverLists([]);

    // Set a timeout to stop loading after 15 seconds
    if (driverTimeoutRef.current) {
      clearTimeout(driverTimeoutRef.current);
    }
    
    driverTimeoutRef.current = setTimeout(() => {
      console.log("[requestNearbyDrivers] Timeout reached, stopping loader");
      setdriverLoader(false);
      setdriverLists((currentList) => {
        if (currentList.length === 0) {
          Toast.show("No drivers found. Please try again later.", {
            type: "info",
            placement: "bottom",
          });
        }
        return currentList;
      });
      driverTimeoutRef.current = null;
    }, 15000); // 15 second timeout

    if (currentLocation && wsConnected && ws.current) {
      try {
        ws.current.send(
          JSON.stringify({
            type: "requestRide",
            role: "user",
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          })
        );
        getNearbyDrivers();
      } catch (error) {
        console.error("[requestNearbyDrivers] Error sending WebSocket message:", error);
        if (driverTimeoutRef.current) {
          clearTimeout(driverTimeoutRef.current);
          driverTimeoutRef.current = null;
        }
        setdriverLoader(false);
        Toast.show("Failed to request drivers. Please try again.", {
          type: "danger",
          placement: "bottom",
        });
      }
    } else {
      // WebSocket not connected
      if (driverTimeoutRef.current) {
        clearTimeout(driverTimeoutRef.current);
        driverTimeoutRef.current = null;
      }
      setdriverLoader(false);
      Toast.show("Not connected to server. Please check your connection.", {
        type: "danger",
        placement: "bottom",
      });
    }
  };

  const sendPushNotification = async (expoPushToken: string, data: any) => {
    const message = {
      to: expoPushToken,
      sound: "default",
      title: "New Ride Request",
      body: "You have a new ride request.",
      data: { orderData: data },
    };

    await axios.post("https://exp.host/--/api/v2/push/send", message);
  };

  // Choose nearest driver from list; fall back to first
  const pickNearestDriver = (drivers: any[]) => {
    try {
      if (!drivers || drivers.length === 0 || !currentLocation) return null;
      let best = drivers[0];
      let bestDist = Number.MAX_SAFE_INTEGER;
      for (const d of drivers) {
        const lat = d.latitude ?? d.lat ?? d.coords?.latitude;
        const lon = d.longitude ?? d.lon ?? d.coords?.longitude;
        if (typeof lat === "number" && typeof lon === "number") {
          const dist = calculateDistance(currentLocation.latitude, currentLocation.longitude, lat, lon);
          if (dist < bestDist) {
            best = d;
            bestDist = dist;
          }
        }
      }
      return best || drivers[0];
    } catch {
      return drivers[0];
    }
  };

  const handleConfirmBooking = async () => {
    try {
      console.log("[ConfirmBooking] pressed. driverLists:", driverLists?.length);
      // Immediately reflect UI state to "searching"
      setdriverLoader(true);
      setVehicleSelectionVisible(false);
      // optional: collapse current list while searching to make the state obvious
      // setdriverLists([]);

      // If we don't have drivers yet, start search now
      if (!driverLists || driverLists.length === 0) {
        Toast.show("Searching for the nearest driver…", { placement: "bottom" });
        requestNearbyDrivers();
        return;
      }
      // We have drivers; send order to nearest/selected
      const target = selectedDriver || pickNearestDriver(driverLists);
      console.log("[ConfirmBooking] target driver:", target);
      await handleOrder(target);
    } catch (e: any) {
      console.error("[ConfirmBooking] error:", e?.message || e);
      Toast.show("Failed to confirm booking. Please try again.", {
        type: "danger",
        placement: "bottom",
      });
    }
  };

  const handleOrder = async (targetDriver?: any) => {
    console.log("[handleOrder] sending to driver:", targetDriver?.id || targetDriver?._id || targetDriver?.driverId);
    const currentLocationName = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${currentLocation?.latitude},${currentLocation?.longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY}`
    );
    const destinationLocationName = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${marker?.latitude},${marker?.longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY}`
    );

    const data = {
      user,
      currentLocation,
      marker,
      distance: distance.toFixed(2),
      currentLocationName:
        currentLocationName.data.results[0].formatted_address,
      destinationLocation:
        destinationLocationName.data.results[0].formatted_address,
    };

    // Prefer driver's push token from API if available; fallback to demo token
    const driverPushToken =
      targetDriver?.pushToken ||
      targetDriver?.expoPushToken ||
      targetDriver?.notificationToken ||
      "ExponentPushToken[v1e34ML-hnypD7MKQDDwaK]";

    console.log("[handleOrder] push to token:", driverPushToken);
    await sendPushNotification(driverPushToken, JSON.stringify(data));

    // Also notify driver via WebSocket channel for instant in-app modal
    try {
      if (ws.current && wsConnected) {
        const targetId =
          targetDriver?.id || targetDriver?._id || targetDriver?.driverId;
        ws.current.send(
          JSON.stringify({
            type: "notifyDriver",
            role: "user",
            driverId: targetId,
            payload: data,
          })
        );
        console.log("[handleOrder] also notified via WS to driver:", targetId);
      }
    } catch (err) {
      console.log("[handleOrder] WS notify failed:", err);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[external.fx_1]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View>
        <View
          style={{ height: windowHeight(!keyboardAvoidingHeight ? 500 : 300) }}
        >
          {locationLoading || !region ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
              <ActivityIndicator size="large" color="#000" />
              <Text style={{ marginTop: 10, fontSize: 16, color: '#666' }}>
                Getting your location...
              </Text>
            </View>
          ) : (
            <MapView
              style={{ flex: 1 }}
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
          )}
        </View>
      </View>
      <View style={styles.contentContainer}>
        <View style={[styles.container]}>
          {locationSelected ? (
            <>
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: "#b5b5b5",
                  paddingBottom: windowHeight(10),
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Pressable onPress={() => {
                  setlocationSelected(false);
                  setdriverLoader(false);
                  setdriverLists([]);
                  setVehicleSelectionVisible(false);
                  setShowConfirmSelection(false);
                  if (driverTimeoutRef.current) {
                    clearTimeout(driverTimeoutRef.current);
                    driverTimeoutRef.current = null;
                  }
                }}>
                  <LeftArrow />
                </Pressable>
                <Text
                  style={{
                    margin: "auto",
                    fontSize: 20,
                    fontWeight: "600",
                  }}
                >
                  {vehicleSelectionVisible
                    ? "Select a ride"
                    : driverLoader
                    ? "Searching for driver"
                    : assignedRide
                    ? "Driver is on the way"
                    : "Gathering options"}
                </Text>
              </View>

              {/* Vehicle selection step */}
              {vehicleSelectionVisible && !driverLoader && (
                <View
                  style={{
                    padding: windowWidth(12),
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
                    Choose your car type
                  </Text>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    {vehicleOptions.map((opt) => (
                      <Pressable
                        key={opt.type}
                        onPress={() => handleVehicleSelect(opt.type, opt.image)}
                        style={{
                          flex: 1,
                          borderWidth: selectedVehcile === opt.type ? 2 : 1,
                          borderColor: selectedVehcile === opt.type ? "#111" : "#ddd",
                          borderRadius: 12,
                          padding: 12,
                          alignItems: "center",
                          backgroundColor: "#fff",
                        }}
                      >
                        <Image source={opt.image} style={{ width: 100, height: 90 }} />
                        <Text style={{ marginTop: 8, fontSize: 16, fontWeight: "600" }}>{opt.type}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {selectedVehicleImage && (
                    <View style={{ alignItems: "center", marginTop: 16 }}>
                      <Image source={selectedVehicleImage} style={{ width: 140, height: 120 }} />
                      <Text style={{ marginTop: 6 }}>Selected: {selectedVehcile}</Text>
                    </View>
                  )}

                  {/* Confirmation prompt */}
                  {showConfirmSelection && (
                    <View style={{ marginTop: 20 }}>
                      <Text style={{ textAlign: "center", fontSize: 16, marginBottom: 10 }}>
                        Confirm {selectedVehcile} and start searching for a driver?
                      </Text>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Pressable
                          onPress={() => setShowConfirmSelection(false)}
                          style={{ flex: 1, marginRight: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", alignItems: "center" }}
                        >
                          <Text>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={confirmVehicleSelection}
                          style={{ flex: 1, marginLeft: 8, padding: 12, borderRadius: 10, backgroundColor: "#111", alignItems: "center" }}
                        >
                          <Text style={{ color: "#fff", fontWeight: "600" }}>Confirm</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Searching state */}
              {driverLoader && (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    height: windowHeight(400),
                    paddingVertical: windowHeight(40),
                  }}
                >
                  <ActivityIndicator size={"large"} color="#000" />
                  <Text
                    style={{
                      marginTop: windowHeight(20),
                      fontSize: 16,
                      color: "#666",
                    }}
                  >
                    Searching for driver...
                  </Text>
                </View>
              )}

              {/* Driver options after search returns */}
              {!vehicleSelectionVisible && !driverLoader && (
                <ScrollView
                  style={{
                    paddingBottom: windowHeight(20),
                    height: windowHeight(280),
                  }}
                >
                  <View style={{ padding: windowWidth(10) }}>
                    {driverLists && driverLists.length > 0 ? (
                      driverLists.map((driver: DriverType, index: number) => (
                      <Pressable
                        key={
                          (driver as any)?.id ||
                          (driver as any)?._id ||
                          (driver as any)?.driverId ||
                          `driver-${index}`
                        }
                        style={{
                          width: windowWidth(420),
                          borderWidth:
                            selectedVehcile === driver.vehicle_type ? 2 : 0,
                          borderRadius: 10,
                          padding: 10,
                          marginVertical: 5,
                        }}
                        onPress={() => {
                          setselectedVehcile(driver.vehicle_type);
                        }}
                      >
                        <View style={{ margin: "auto" }}>
                          <Image
                            source={
                              driver?.vehicle_type === "Car"
                                ? require("@/assets/images/vehicles/car.png")
                                : driver?.vehicle_type === "Motorcycle"
                                ? require("@/assets/images/vehicles/bike.png")
                                : require("@/assets/images/vehicles/bike.png")
                            }
                            style={{ width: 90, height: 80 }}
                          />
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View>
                    <Text style={{ fontSize: 20, fontWeight: "600" }}>
                      Flashride {driver?.vehicle_type}
                    </Text>
                            <Text style={{ fontSize: 16 }}>
                              {getEstimatedArrivalTime(travelTimes.driving)}{" "}
                              dropoff
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: windowWidth(20),
                              fontWeight: "600",
                            }}
                          >
                            BDT{" "}
                            {(
                              distance.toFixed(2) * parseInt(driver.rate)
                            ).toFixed(2)}
                          </Text>
                        </View>
                      </Pressable>
                      ))
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingVertical: windowHeight(40),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "600",
                            color: "#666",
                            textAlign: "center",
                          }}
                        >
                          No drivers available in your area
                        </Text>
                        <Text
                          style={{
                            fontSize: 14,
                            color: "#999",
                            textAlign: "center",
                            marginTop: windowHeight(10),
                          }}
                        >
                          Please try again later or select a different location
                        </Text>
                      </View>
                    )}

                    {/* When a driver is assigned, show a status bar */}
                    {assignedRide && (
                      <View style={{ paddingHorizontal: windowWidth(10), marginTop: windowHeight(10) }}>
                        <Text style={{ fontSize: 16, fontWeight: "600" }}>
                          Driver is on the way
                        </Text>
                        <Text style={{ color: "#666" }}>
                          {assignedRide?.driver?.name || "Your driver"} is heading to your pickup
                        </Text>
                      </View>
                    )}

                    {driverLists && driverLists.length > 0 && !assignedRide && (
                      <View
                        style={{
                          paddingHorizontal: windowWidth(10),
                          marginTop: windowHeight(15),
                        }}
                      >
                        <Button
                          backgroundColor={"#000"}
                          textColor="#fff"
                          title={`Confirm Booking`}
                          onPress={handleConfirmBooking}
                          disabled={driverLoader}
                        />
                      </View>
                    )}
                  </View>
                </ScrollView>
              )}
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity onPress={() => router.back()}>
                  <LeftArrow />
                </TouchableOpacity>
                <Text
                  style={{
                    margin: "auto",
                    fontSize: windowWidth(25),
                    fontWeight: "600",
                  }}
                >
                  Plan your ride
                </Text>
              </View>
              {/* picking up time */}
              <View
                style={{
                  width: windowWidth(200),
                  height: windowHeight(28),
                  borderRadius: 20,
                  backgroundColor: color.lightGray,
                  alignItems: "center",
                  justifyContent: "center",
                  marginVertical: windowHeight(10),
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Clock />
                  <Text
                    style={{
                      fontSize: windowHeight(12),
                      fontWeight: "600",
                      paddingHorizontal: 8,
                    }}
                  >
                    Pick-up now
                  </Text>
                  <DownArrow />
                </View>
              </View>
              {/* picking up location */}
              <View
                style={{
                  borderWidth: 2,
                  borderColor: "#000",
                  borderRadius: 15,
                  marginBottom: windowHeight(15),
                  paddingHorizontal: windowWidth(15),
                  paddingVertical: windowHeight(5),
                }}
              >
                <View style={{ flexDirection: "row" }}>
                  <PickLocation />
                  <View
                    style={{
                      width: Dimensions.get("window").width * 1 - 110,
                      borderBottomWidth: 1,
                      borderBottomColor: "#999",
                      marginLeft: 5,
                      height: windowHeight(20),
                    }}
                  >
                    <Text
                      style={{
                        color: "#2371F0",
                        fontSize: 18,
                        paddingLeft: 5,
                      }}
                    >
                      Current Location
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    paddingVertical: 12,
                  }}
                >
                  <PlaceHolder />
                  <View
                    style={{
                      marginLeft: 5,
                      width: Dimensions.get("window").width * 1 - 110,
                    }}
                  >
                    <TextInput
                      placeholder="Where to?"
                      value={query}
                      onChangeText={handleInputChange}
                      onFocus={() => setkeyboardAvoidingHeight(true)}
                      style={{
                        height: 38,
                        color: "#000",
                        fontSize: 16,
                        flex: 1,
                      }}
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>
              </View>
              {/* Last sessions */}
              {Array.isArray(places) && places.length > 0 && places.map((place: any, index: number) => (
                <Pressable
                  key={place.place_id || `place-${index}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: windowHeight(20),
                  }}
                  onPress={() => {
                    if (place.place_id) {
                      handlePlaceSelect(place.place_id);
                    }
                  }}
                >
                  <PickUpLocation />
                  <Text style={{ paddingLeft: 15, fontSize: 18 }}>
                    {place.description || place.structured_formatting?.main_text || "Unknown place"}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
