import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Alert, Platform } from "react-native";
import React, { useState } from "react";
import { fontSizes, windowHeight, windowWidth } from "@/themes/app.constant";
import { useGetDriverData } from "@/hooks/useGetDriverData";
import Input from "@/components/common/input";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import axios from "axios";
import { Toast } from "react-native-toast-notifications";
import { LinearGradient } from "expo-linear-gradient";
import fonts from "@/themes/app.fonts";
import color from "@/themes/app.colors";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

export default function Profile() {
  const { driver, loading, refreshDriverData } = useGetDriverData();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Update profile image when driver data changes - MUST be before early return
  React.useEffect(() => {
    if (driver?.avatar) {
      setProfileImage(driver.avatar);
    } else {
      setProfileImage(null);
    }
  }, [driver?.avatar]);

  // Early return AFTER all hooks
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={color.buttonBg} />
      </View>
    );
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      
      // Set driver status to "inactive" (offline) before logging out
      if (accessToken) {
        try {
          await axios.put(
            `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/update-status`,
            {
              status: "inactive",
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
              timeout: 5000,
            }
          );
          console.log("[Logout] Driver status set to inactive");
        } catch (error: any) {
          console.error("[Logout] Failed to update status to inactive:", error?.message || error);
        }
      }

      // Clear all stored data
      await AsyncStorage.removeItem("accessToken");
      await AsyncStorage.removeItem("status");
      
      // Navigate to login
      router.push("/(routes)/login");
    } catch (error: any) {
      console.error("[Logout] Error during logout:", error?.message || error);
      try {
        await AsyncStorage.removeItem("accessToken");
        await AsyncStorage.removeItem("status");
        router.push("/(routes)/login");
      } catch (storageError) {
        console.error("[Logout] Failed to clear storage:", storageError);
        Toast.show("Error during logout. Please try again.", {
          type: "danger",
          placement: "bottom",
        });
        setIsLoggingOut(false);
      }
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "DR";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const requestImagePickerPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'Sorry, we need camera and photo library permissions to upload your profile picture!',
          [{ text: 'OK' }]
        );
        return false;
      }
    }
    return true;
  };

  const handleImagePicker = () => {
    Alert.alert(
      'Select Profile Picture',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: () => pickImage('camera'),
        },
        {
          text: 'Choose from Gallery',
          onPress: () => pickImage('gallery'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    const hasPermission = await requestImagePickerPermissions();
    if (!hasPermission) return;

    try {
      let result;
      
      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        await uploadProfilePicture(imageUri);
      }
    } catch (error: any) {
      console.error('[Profile] Error picking image:', error);
      Toast.show('Failed to pick image. Please try again.', {
        type: 'danger',
        placement: 'bottom',
      });
    }
  };

  const uploadProfilePicture = async (imageUri: string) => {
    try {
      setIsUploading(true);
      console.log('[Profile] Starting image upload, URI:', imageUri);

      // Convert image to base64 using expo-file-system (React Native compatible)
      let base64data: string;
      
      try {
        console.log('[Profile] Processing image URI:', imageUri);
        
        // Use fetch to get the image and convert to base64 (works reliably in React Native)
        const response = await fetch(imageUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const blob = await response.blob();
        console.log('[Profile] Image blob created, size:', blob.size);
        
        // Convert blob to base64 using FileReader
        base64data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result && typeof reader.result === 'string') {
              console.log('[Profile] Image converted to base64 successfully');
              resolve(reader.result);
            } else {
              reject(new Error('Failed to convert image to base64'));
            }
          };
          reader.onerror = () => {
            reject(new Error('Error reading image file'));
          };
          reader.readAsDataURL(blob);
        });
        
        console.log('[Profile] Base64 data length:', base64data.length);
      } catch (fileError: any) {
        console.error('[Profile] Error processing image:', fileError);
        console.error('[Profile] Error details:', {
          message: fileError?.message,
          name: fileError?.name,
          stack: fileError?.stack?.substring(0, 300),
        });
        throw new Error('Failed to process image: ' + (fileError?.message || 'Unknown error'));
      }

      const accessToken = await AsyncStorage.getItem("accessToken");
      if (!accessToken) {
        Toast.show('Please log in again', { type: 'danger', placement: 'bottom' });
        setIsUploading(false);
        return;
      }

      const apiUrl = `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/upload-profile-picture`;
      console.log('[Profile] Uploading to:', apiUrl);
      
      const uploadResponse = await axios.put(
        apiUrl,
        { avatar: base64data },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log('[Profile] Upload response:', uploadResponse.data);

      if (uploadResponse.data.success) {
        setProfileImage(base64data);
        try {
          await refreshDriverData();
        } catch (refreshError) {
          console.error('[Profile] Error refreshing driver data:', refreshError);
          // Don't show error to user, image was uploaded successfully
        }
        Toast.show('Profile picture updated successfully!', {
          type: 'success',
          placement: 'bottom',
        });
      } else {
        throw new Error(uploadResponse.data.message || 'Upload failed');
      }
    } catch (error: any) {
      console.error('[Profile] Error uploading image:', error);
      console.error('[Profile] Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to upload image. Please try again.';
      Toast.show(errorMessage, {
        type: 'danger',
        placement: 'bottom',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Beautiful Gradient Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.shinyOverlay} />
        
        {/* Profile Avatar - Clickable */}
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={handleImagePicker}
          disabled={isUploading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.1)']}
            style={styles.avatarGradient}
          >
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarText}>
                {getInitials(driver?.name || "Driver")}
              </Text>
            )}
            {isUploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
            <View style={styles.cameraIconContainer}>
              <Text style={styles.cameraIcon}>📷</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        
        {/* Driver Name */}
        <Text style={styles.driverName}>{driver?.name || "Driver"}</Text>
        <Text style={styles.driverEmail}>{driver?.email || ""}</Text>
        
        {/* Status Badge */}
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: driver?.accountStatus === "blocked" ? "#ef4444" : "#22c55e" }]} />
          <Text style={styles.statusText}>
            {driver?.accountStatus === "blocked" ? "Blocked" : driver?.accountStatus === "approved" ? "Verified" : "Pending"}
          </Text>
        </View>
      </LinearGradient>

      {/* Statistics Cards */}
      <View style={styles.statsContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statCard}
        >
          <Text style={styles.statValue}>{Math.floor(driver?.totalEarning || 0)}</Text>
          <Text style={styles.statLabel}>Total Earnings (MRU)</Text>
        </LinearGradient>
        
        <LinearGradient
          colors={['#f093fb', '#f5576c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statCard}
        >
          <Text style={styles.statValue}>{driver?.totalRides || 0}</Text>
          <Text style={styles.statLabel}>Completed Rides</Text>
        </LinearGradient>
      </View>

      {/* Profile Information Card */}
      <View style={styles.infoCard}>
        <Text style={styles.sectionTitle}>📋 Profile Information</Text>
        
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>👤 Full Name</Text>
          <View style={styles.infoField}>
            <Text style={styles.infoValue}>{driver?.name || "N/A"}</Text>
          </View>
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>📧 Email Address</Text>
          <View style={styles.infoField}>
            <Text style={styles.infoValue}>{driver?.email || "N/A"}</Text>
          </View>
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>📱 Phone Number</Text>
          <View style={styles.infoField}>
            <Text style={styles.infoValue}>{driver?.phone_number || "N/A"}</Text>
          </View>
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>🌍 Country</Text>
          <View style={styles.infoField}>
            <Text style={styles.infoValue}>Mauritania</Text>
          </View>
        </View>

        {driver?.rate && (
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>💰 Rate per KM</Text>
            <View style={styles.infoField}>
              <Text style={styles.infoValue}>{driver.rate} MRU/km</Text>
            </View>
          </View>
        )}
      </View>

      {/* Logout Button */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity
          onPress={handleLogout}
          disabled={isLoggingOut}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.logoutButton, isLoggingOut && styles.logoutButtonDisabled]}
          >
            {isLoggingOut ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.logoutIcon}>🚪</Text>
                <Text style={styles.logoutText}>Log Out</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingTop: windowHeight(50),
    paddingBottom: windowHeight(30),
    paddingHorizontal: windowWidth(20),
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  shinyOverlay: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    transform: [{ rotate: '45deg' }],
  },
  avatarContainer: {
    marginBottom: windowHeight(15),
  },
  avatarGradient: {
    width: windowWidth(100),
    height: windowWidth(100),
    borderRadius: windowWidth(50),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: windowWidth(50),
  },
  avatarText: {
    fontSize: fontSizes.FONT30,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: windowWidth(50),
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(102, 126, 234, 0.9)',
    width: windowWidth(35),
    height: windowWidth(35),
    borderRadius: windowWidth(17.5),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  cameraIcon: {
    fontSize: fontSizes.FONT18,
  },
  driverName: {
    fontSize: fontSizes.FONT28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: windowHeight(5),
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  driverEmail: {
    fontSize: fontSizes.FONT14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: windowHeight(12),
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: windowWidth(16),
    paddingVertical: windowHeight(6),
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: windowWidth(8),
  },
  statusText: {
    fontSize: fontSizes.FONT12,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: windowWidth(20),
    marginTop: windowHeight(-25),
    marginBottom: windowHeight(20),
    gap: windowWidth(12),
  },
  statCard: {
    flex: 1,
    padding: windowWidth(16),
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  statValue: {
    fontSize: fontSizes.FONT24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: windowHeight(4),
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statLabel: {
    fontSize: fontSizes.FONT11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  infoCard: {
    backgroundColor: '#fff',
    marginHorizontal: windowWidth(20),
    marginBottom: windowHeight(20),
    padding: windowWidth(20),
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  sectionTitle: {
    fontSize: fontSizes.FONT22,
    fontWeight: '700',
    color: color.primaryText,
    marginBottom: windowHeight(20),
    fontFamily: fonts.bold,
  },
  inputWrapper: {
    marginBottom: windowHeight(18),
  },
  inputLabel: {
    fontSize: fontSizes.FONT12,
    color: color.regularText,
    marginBottom: windowHeight(6),
    fontWeight: '600',
    fontFamily: fonts.medium,
  },
  infoField: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: windowWidth(16),
    paddingVertical: windowHeight(14),
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e9ecef',
  },
  infoValue: {
    fontSize: fontSizes.FONT16,
    color: color.primaryText,
    fontWeight: '500',
    fontFamily: fonts.medium,
  },
  logoutContainer: {
    paddingHorizontal: windowWidth(20),
    paddingBottom: windowHeight(30),
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: windowHeight(16),
    borderRadius: 16,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    gap: windowWidth(10),
  },
  logoutButtonDisabled: {
    opacity: 0.7,
  },
  logoutIcon: {
    fontSize: fontSizes.FONT20,
  },
  logoutText: {
    fontSize: fontSizes.FONT18,
    fontWeight: '700',
    color: '#fff',
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
});
