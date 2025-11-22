require("dotenv").config();
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";
import { sendToken } from "../utils/send-token";

const normalizeVehicleType = (vehicleType: string) => {
  const value = vehicleType?.toLowerCase();
  if (value === "car") return "Car";
  if (value === "motorcycle") return "Motorcycle";
  return "CNG";
};

const sanitizeDriver = (driver: any) => {
  if (!driver) return driver;
  const { password, ...rest } = driver;
  return rest;
};

/**
 * Truncates a money amount by dropping all decimal places (no rounding)
 * Examples:
 * - 250.5 → 250
 * - 250.9 → 250
 * - 251.3 → 251
 * - 25.1 → 25
 */
const truncateDecimal = (value: number): number => {
  return Math.floor(value); // Drops all decimals, keeps integer part only
};

export const registerDriver = async (req: Request, res: Response) => {
  try {
    console.log("[Driver Registration] Received registration request");
    console.log("[Driver Registration] Request body keys:", Object.keys(req.body));
    
    const {
      name,
      country,
      phone_number,
      email,
      password,
      vehicle_type,
      registration_number,
      registration_date,
      driving_license,
      vehicle_color,
      rate,
    } = req.body;

    // Log received data (without password)
    console.log("[Driver Registration] Received data:", {
      name: name ? `${name.substring(0, 10)}...` : 'missing',
      country: country || 'missing',
      phone_number: phone_number ? `${phone_number.substring(0, 5)}...` : 'missing',
      email: email ? `${email.substring(0, 10)}...` : 'not provided',
      vehicle_type: vehicle_type || 'missing',
      registration_number: registration_number ? `${registration_number.substring(0, 5)}...` : 'missing',
      registration_date: registration_date || 'missing',
      driving_license: driving_license ? `${driving_license.substring(0, 5)}...` : 'missing',
      vehicle_color: vehicle_color || 'missing',
      rate: rate || 'missing',
      hasPassword: !!password,
    });

    // Email is optional, so we don't check for it
    const missingFields: string[] = [];
    if (!name || !name.trim()) missingFields.push("name");
    if (!country || !country.trim()) missingFields.push("country");
    if (!phone_number || !phone_number.toString().trim()) missingFields.push("phone_number");
    if (!password) missingFields.push("password");
    if (!vehicle_type || !vehicle_type.trim()) missingFields.push("vehicle_type");
    if (!registration_number || !registration_number.toString().trim()) missingFields.push("registration_number");
    if (!registration_date || !registration_date.toString().trim()) missingFields.push("registration_date");
    if (!driving_license || !driving_license.toString().trim()) missingFields.push("driving_license");
    if (!rate || !rate.toString().trim()) missingFields.push("rate");

    if (missingFields.length > 0) {
      console.error(`[Driver Registration] ❌ Missing required fields: ${missingFields.join(", ")}`);
      return res.status(400).json({
        success: false,
        message: `Please provide all required fields. Missing: ${missingFields.join(", ")}`,
      });
    }

    const normalizedPhoneNumber = String(phone_number).trim();
    // Email is optional - normalize it, use null if empty
    const normalizedEmail = email && email.trim() ? String(email).trim().toLowerCase() : null;
    const normalizedRegistrationNumber = String(registration_number).trim();

    console.log(`[Driver Registration] Checking for duplicates:`, {
      phone: normalizedPhoneNumber,
      email: normalizedEmail || "(not provided)",
      registration: normalizedRegistrationNumber,
    });

    // Build OR conditions - only check email if it's provided and not empty
    const orConditions: any[] = [
      { phone_number: normalizedPhoneNumber },
      { registration_number: normalizedRegistrationNumber },
    ];

    // Only check email if it's provided and not empty (since email is optional)
    if (normalizedEmail && normalizedEmail.length > 0) {
      orConditions.push({ email: normalizedEmail });
    }

    const existingDriver = await prisma.driver.findFirst({
      where: {
        OR: orConditions,
      },
    });

    if (existingDriver) {
      // Log which field caused the duplicate for debugging
      let duplicateField = "unknown";
      if (existingDriver.phone_number === normalizedPhoneNumber) {
        duplicateField = "phone number";
      } else if (existingDriver.registration_number === normalizedRegistrationNumber) {
        duplicateField = "registration number";
      } else if (normalizedEmail && existingDriver.email === normalizedEmail) {
        duplicateField = "email";
      }

      console.log(`[Driver Registration] ❌ Duplicate detected - Field: ${duplicateField}`);
      console.log(`[Driver Registration] Existing driver:`, {
        id: existingDriver.id,
        phone: existingDriver.phone_number,
        email: existingDriver.email || "(empty)",
        registration: existingDriver.registration_number,
      });
      console.log(`[Driver Registration] New submission:`, {
        phone: normalizedPhoneNumber,
        email: normalizedEmail || "(not provided)",
        registration: normalizedRegistrationNumber,
      });

      return res.status(409).json({
        success: false,
        message:
          "An account with the provided email, phone number, or registration number already exists.",
      });
    }

    console.log(`[Driver Registration] ✅ No duplicates found, proceeding with registration`);

    const hashedPassword = await bcrypt.hash(password, 12);

    // For email, use a placeholder if empty to avoid unique constraint issues
    // Since email is @unique in schema, we can't use empty string for multiple drivers
    // Use a generated placeholder: "no-email-{timestamp}-{random}"
    const emailToSave = normalizedEmail || `no-email-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    console.log(`[Driver Registration] Creating driver with:`, {
      phone: normalizedPhoneNumber,
      email: normalizedEmail || "(using placeholder)",
      registration: normalizedRegistrationNumber,
    });

    console.log(`[Driver Registration] Attempting to create driver in database...`);
    const startTime = Date.now();
    
    // Add timeout wrapper for database operation
    const createDriverWithTimeout = async () => {
      return Promise.race([
        prisma.driver.create({
          data: {
            name,
            country,
            phone_number: normalizedPhoneNumber,
            email: emailToSave,
            password: hashedPassword,
            vehicle_type: normalizeVehicleType(vehicle_type),
            registration_number: normalizedRegistrationNumber,
            registration_date,
            driving_license,
            vehicle_color,
            rate,
            accountStatus: "pending",
            status: "inactive",
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database operation timeout after 25 seconds')), 25000)
        )
      ]) as Promise<any>;
    };
    
    try {
      const driver = await createDriverWithTimeout();

      const duration = Date.now() - startTime;
      console.log(`[Driver Registration] ✅ Driver created successfully in ${duration}ms`);
      console.log(`[Driver Registration] Driver ID: ${driver.id}, accountStatus: pending`);

      // Send response immediately
      if (!res.headersSent) {
        return res.status(201).json({
          success: true,
          message:
            "Application submitted successfully. An administrator will review your details soon.",
        });
      } else {
        console.error(`[Driver Registration] ⚠️ Response already sent, cannot send success response`);
      }
    } catch (dbError: any) {
      const duration = Date.now() - startTime;
      console.error(`[Driver Registration] ❌ Database error after ${duration}ms:`, dbError);
      
      // If it's a timeout error, send specific response
      if (dbError?.message?.includes('timeout')) {
        if (!res.headersSent) {
          return res.status(504).json({
            success: false,
            message: "Database operation timed out. Please try again.",
          });
        }
      }
      
      throw dbError; // Re-throw to be caught by outer catch
    }
  } catch (error: any) {
    console.error("[Driver Registration] ❌ Error during registration:", error);
    console.error("[Driver Registration] Error details:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack?.substring(0, 500), // Limit stack trace length
    });
    
    // Handle specific database errors
    if (error?.code === 'P2002') {
      // Prisma unique constraint violation
      const target = error?.meta?.target || [];
      let duplicateField = "information";
      if (target.includes('phone_number')) duplicateField = "phone number";
      else if (target.includes('email')) duplicateField = "email";
      else if (target.includes('registration_number')) duplicateField = "registration number";
      
      return res.status(409).json({
        success: false,
        message: `An account with this ${duplicateField} already exists.`,
      });
    }
    
    // Handle Prisma connection errors
    if (error?.code === 'P1001' || error?.message?.includes('Can\'t reach database server')) {
      console.error("[Driver Registration] ❌ Database connection error");
      return res.status(503).json({
        success: false,
        message: "Database connection error. Please try again later.",
      });
    }
    
    // Ensure response is sent even if there's an error
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: error?.message || "Unable to submit application. Please try again later.",
      });
    } else {
      console.error("[Driver Registration] ⚠️ Response already sent, cannot send error response");
    }
  }
};

export const loginDriver = async (req: Request, res: Response) => {
  try {
    const { phone_number, password } = req.body as {
      phone_number: string;
      password: string;
    };

    if (!phone_number || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password are required.",
      });
    }

    const normalizedPhoneNumber = phone_number.trim();

    const driver = await prisma.driver.findUnique({
      where: {
        phone_number: normalizedPhoneNumber,
      },
    });

    if (!driver) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    if (driver.accountStatus !== "approved") {
      return res.status(403).json({
        success: false,
        message:
          driver.accountStatus === "declined"
            ? driver.rejectionReason ??
              "Your application was declined. Please contact support."
            : driver.accountStatus === "blocked"
            ? "Your account is currently blocked. Please contact support."
            : "Your application is still under review.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, driver.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    const sanitizedDriver = sanitizeDriver(driver);
    sendToken(sanitizedDriver, res);
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Unable to sign in. Please try again later.",
    });
  }
};

export const getLoggedInDriverData = async (req: any, res: Response) => {
  try {
    if (!req.driver) {
      console.error("[getLoggedInDriverData] Driver data not found in request");
      return res.status(404).json({
        success: false,
        message: "Driver data not found. Please log in again.",
        driver: null,
      });
    }

    console.log(`[getLoggedInDriverData] Fetching driver data for: ${req.driver.id}`);
    const driver = sanitizeDriver(req.driver);

    if (!driver) {
      console.error("[getLoggedInDriverData] Failed to sanitize driver data");
      return res.status(500).json({
        success: false,
        message: "Failed to process driver data.",
        driver: null,
      });
    }

    console.log(`[getLoggedInDriverData] Successfully returning driver data:`, {
      id: driver.id,
      name: driver.name,
      phone: driver.phone_number,
      accountStatus: driver.accountStatus,
    });

    return res.status(200).json({
      success: true,
      driver,
    });
  } catch (error: any) {
    console.error("[getLoggedInDriverData] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch driver data. Please try again.",
      driver: null,
      error: error?.message || "Unknown error",
    });
  }
};

// updating driver status
export const updateDriverStatus = async (req: any, res: Response) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status value is required.",
      });
    }

    console.log(
      `[DriverStatus] ${req.driver?.id ?? "unknown"} requested status -> ${status}`
    );

    // Check if driver is blocked - blocked drivers cannot go "active"
    const currentDriver = await prisma.driver.findUnique({
      where: {
        id: req.driver.id!,
      },
    });

    if (!currentDriver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }

    // If driver is blocked and trying to go active, prevent it
    if ((currentDriver as any).accountStatus === "blocked" && status === "active") {
      console.log(
        `[DriverStatus] Blocked driver ${req.driver.id} attempted to go active - prevented`
      );
      return res.status(403).json({
        success: false,
        message: "Your account is blocked. You cannot go online.",
      });
    }

    // If driver is blocked, force status to inactive
    const finalStatus = (currentDriver as any).accountStatus === "blocked" 
      ? "inactive" 
      : status;

    const driver = await prisma.driver.update({
      where: {
        id: req.driver.id!,
      },
      data: {
        status: finalStatus,
      },
    });

    console.log(
      `[DriverStatus] ${driver.id} status updated to ${driver.status}`
    );

    const sanitizedDriver = sanitizeDriver(driver);
    console.log("[DriverStatus] Returning driver data:", {
      id: sanitizedDriver.id,
      status: sanitizedDriver.status,
      accountStatus: sanitizedDriver.accountStatus,
    });

    return res.status(200).json({
      success: true,
      driver: sanitizedDriver,
    });
  } catch (error: any) {
    console.error("[DriverStatus] Failed to update status:", error);
    console.error("[DriverStatus] Error details:", {
      message: error?.message,
      stack: error?.stack,
    });
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to update driver status. Please try again.",
    });
  }
};

// get drivers data with id
export const getDriversById = async (req: Request, res: Response) => {
  try {
    const { ids } = req.query as any;
    if (!ids) {
      return res.status(400).json({ message: "No driver IDs provided" });
    }

    const driverIds = ids.split(",");

    // Fetch drivers from database
    const drivers = await prisma.driver.findMany({
      where: {
        id: { in: driverIds },
      },
    });

    res.json(drivers.map(sanitizeDriver));
  } catch (error) {
    console.error("Error fetching driver data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// creating new ride
export const newRide = async (req: any, res: Response) => {
  try {
    const {
      userId,
      charge,
      status,
      currentLocationName,
      destinationLocationName,
      distance,
    } = req.body;

    // OPTIMIZED: Fast race condition check with indexed query
    // Only check for VERY recent rides (last 5 minutes) to prevent false positives
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    console.log(`🔍 [newRide] Fast check for recent rides (last 5 min) for user ${userId}, driver ${req.driver.id}...`);
    
    // OPTIMIZED QUERY: Only select needed fields, remove orderBy (not needed for existence check)
    // Uses composite index on [userId, status, cratedAt] for fast lookup
    const existingRide = await prisma.rides.findFirst({
      where: {
        userId,
        status: {
          in: ["Accepted", "Processing", "On the way", "Picked up"], // "Accepted" is the primary status now
        },
        cratedAt: {
          gte: fiveMinutesAgo, // Only check rides created in last 5 minutes
        },
      },
      select: {
        id: true,
        driverId: true,
        status: true,
        cratedAt: true,
      },
      // Removed orderBy - not needed for existence check, saves query time
    });

    if (existingRide) {
      console.log(`⚠️ [newRide] Recent ride found for user ${userId}. Ride ID: ${existingRide.id}, Driver: ${existingRide.driverId}, Created: ${existingRide.cratedAt}, Status: ${existingRide.status}`);
      
      // If the existing ride is from a different driver, reject this request
      if (existingRide.driverId !== req.driver.id) {
        console.log(`❌ [newRide] Driver ${req.driver.id} tried to create ride, but recent ride exists for driver ${existingRide.driverId}`);
        return res.status(409).json({
          success: false,
          message: "This ride request was already accepted by another driver.",
        });
      }
      
      // If it's the same driver, return the existing ride (idempotency - allows retries)
      console.log(`ℹ️ [newRide] Same driver ${req.driver.id} attempting to create duplicate ride, returning existing ride (idempotency)`);
      return res.status(200).json({ success: true, newRide: existingRide });
    }
    
    console.log(`✅ [newRide] No recent ride found, creating new ride for user ${userId} by driver ${req.driver.id}`);

    // Truncate charge (drop all decimals)
    const truncatedCharge = truncateDecimal(parseFloat(charge));

    const newRide = await prisma.rides.create({
      data: {
        userId,
        driverId: req.driver.id,
        charge: truncatedCharge,
        status,
        currentLocationName,
        destinationLocationName,
        distance,
      },
    });
    
    console.log(`✅ Created new ride ${newRide.id} for user ${userId} by driver ${req.driver.id}`);
    res.status(201).json({ success: true, newRide });
  } catch (error: any) {
    console.error("[newRide] Error:", error);
    
    // Handle duplicate key errors (if database has unique constraints)
    if (error?.code === 11000 || error?.message?.includes("duplicate")) {
      return res.status(409).json({
        success: false,
        message: "This ride request was already accepted by another driver.",
      });
    }
    
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// updating ride status
export const updatingRideStatus = async (req: any, res: Response) => {
  try {
    const { rideId, rideStatus } = req.body;

    console.log(`[updateRideStatus] Request received:`, {
      rideId,
      rideStatus,
      driverId: req.driver?.id,
      hasRideId: !!rideId,
      hasRideStatus: !!rideStatus,
    });

    // Validate input
    if (!rideId || !rideStatus) {
      console.error(`[updateRideStatus] Invalid input:`, { rideId, rideStatus });
      return res
        .status(400)
        .json({ success: false, message: "Invalid input data. Ride ID and status are required." });
    }

    const driverId = req.driver?.id;
    if (!driverId) {
      console.error(`[updateRideStatus] No driver ID in request`);
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Fetch the ride data to get the rideCharge
    const ride = await prisma.rides.findUnique({
      where: {
        id: String(rideId), // Ensure it's a string
      },
    });

    if (!ride) {
      console.error(`[updateRideStatus] Ride not found:`, { rideId, driverId });
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });
    }
    
    console.log(`[updateRideStatus] Ride found:`, {
      rideId: ride.id,
      currentStatus: ride.status,
      requestedStatus: rideStatus,
      rideDriverId: ride.driverId,
      requestDriverId: driverId,
      driverMatches: ride.driverId === driverId,
    });

    const rideCharge = ride.charge;

    // Verify the ride belongs to this driver before updating
    if (ride.driverId !== driverId) {
      console.log(`[updateRideStatus] Driver ${driverId} tried to update ride ${rideId} owned by driver ${ride.driverId}`);
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this ride",
      });
    }
    
    // Update ride status
    const updatedRide = await prisma.rides.update({
      where: {
        id: rideId,
        driverId, // Ensure driver owns this ride
      },
      data: {
        status: rideStatus,
      },
    });
    
    console.log(`[updateRideStatus] Ride ${rideId} status updated from ${ride.status} to ${rideStatus} by driver ${driverId}`);

    if (rideStatus === "Completed") {
      // Get current driver data to check wallet status
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
      });

      if (!driver) {
        return res.status(404).json({
          success: false,
          message: "Driver not found",
        });
      }

      // Calculate 10% commission from ride charge and truncate (drop decimals)
      const commission = truncateDecimal(rideCharge * 0.1);
      
      // Check if wallet has already gone negative
      const walletAlreadyNegative = (driver as any).walletHasGoneNegative || false;
      const currentWalletBalance = ((driver as any).walletBalance as number) || 0;
      
      // Truncate ride charge (ensure no decimals)
      const truncatedRideCharge = truncateDecimal(rideCharge);
      
      // Calculate new totalEarning and truncate it (to ensure no decimals in final value)
      const currentTotalEarning = ((driver as any).totalEarning as number) || 0;
      const newTotalEarning = truncateDecimal(currentTotalEarning + truncatedRideCharge);
      
      // Prepare update data
      const updateData: any = {
        totalEarning: newTotalEarning, // Set directly (truncated) instead of increment
        totalRides: {
          increment: 1,
        },
      };

      // Deduct commission from wallet only if it hasn't gone negative before
      if (!walletAlreadyNegative) {
        const newWalletBalance = truncateDecimal(currentWalletBalance - commission);
        updateData.walletBalance = newWalletBalance;
        
        // Mark as gone negative if balance becomes negative
        if (newWalletBalance < 0) {
          updateData.walletHasGoneNegative = true;
        }

        // Record commission deduction in transaction history
        try {
          const WalletTransaction = (prisma as any).walletTransaction;
          if (WalletTransaction) {
            await WalletTransaction.create({
              data: {
                driverId,
                adminId: null, // System transaction
                amount: -commission, // Negative amount for deduction
                balanceBefore: currentWalletBalance,
                balanceAfter: newWalletBalance,
              },
            });
            console.log(`[Driver] Commission ${commission} MRU deducted from driver ${driverId} wallet`);
          }
        } catch (transactionError: any) {
          console.error("[Driver] Error recording commission transaction:", transactionError?.message || transactionError);
          // Don't fail the request if transaction history fails
        }
      } else {
        console.log(`[Driver] Wallet already negative for driver ${driverId}, skipping commission deduction`);
      }

      // Update driver stats
      await prisma.driver.update({
        where: {
          id: driverId,
        },
        data: updateData,
      });
    }

    res.status(201).json({
      success: true,
      updatedRide,
    });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// getting drivers rides
export const getAllRides = async (req: any, res: Response) => {
  try {
    const driverId = req.driver?.id;
    
    if (!driverId) {
      console.error("[getAllRides] Driver ID not found in request");
      return res.status(401).json({
        success: false,
        message: "Driver not authenticated",
        rides: [],
      });
    }

    console.log(`[getAllRides] Fetching rides for driver: ${driverId}`);
    
    const rides = await prisma.rides.findMany({
      where: {
        driverId: driverId,
      },
      include: {
        driver: true,
        user: true,
      },
      orderBy: {
        cratedAt: "desc",
      },
    });

    console.log(`[getAllRides] Found ${rides.length} rides for driver ${driverId}`);
    
    res.status(200).json({
      success: true,
      rides: rides.map((ride) => ({
        ...ride,
        driver: sanitizeDriver(ride.driver),
      })),
    });
  } catch (error: any) {
    console.error("[getAllRides] Error fetching rides:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch rides",
      rides: [],
      error: error?.message || "Unknown error",
    });
  }
};

// Upload driver profile picture
export const uploadProfilePicture = async (req: any, res: Response) => {
  try {
    const driverId = req.driver?.id;
    
    if (!driverId) {
      console.error("[uploadProfilePicture] Driver ID not found in request");
      return res.status(401).json({
        success: false,
        message: "Driver not authenticated",
      });
    }

    const { avatar } = req.body as { avatar: string };

    if (!avatar) {
      return res.status(400).json({
        success: false,
        message: "Avatar image is required",
      });
    }

    // Validate base64 image format
    if (!avatar.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        message: "Invalid image format. Please provide a valid image.",
      });
    }

    console.log(`[uploadProfilePicture] Updating profile picture for driver: ${driverId}`);

    const updatedDriver = await prisma.driver.update({
      where: {
        id: driverId,
      },
      data: {
        avatar: avatar,
      },
    });

    const sanitizedDriver = sanitizeDriver(updatedDriver);

    console.log(`[uploadProfilePicture] Profile picture updated successfully for driver: ${driverId}`);

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      driver: sanitizedDriver,
    });
  } catch (error: any) {
    console.error("[uploadProfilePicture] Error updating profile picture:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to update profile picture. Please try again.",
    });
  }
};
