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

export const registerDriver = async (req: Request, res: Response) => {
  try {
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

    // Email is optional, so we don't check for it
    if (
      !name ||
      !country ||
      !phone_number ||
      !password ||
      !vehicle_type ||
      !registration_number ||
      !registration_date ||
      !driving_license ||
      !rate
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
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

    await prisma.driver.create({
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
    });

    console.log(`[Driver Registration] ✅ Driver created successfully`);

    return res.status(201).json({
      success: true,
      message:
        "Application submitted successfully. An administrator will review your details soon.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Unable to submit application. Please try again later.",
    });
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
    const driver = sanitizeDriver(req.driver);

    res.status(200).json({
      success: true,
      driver,
    });
  } catch (error) {
    console.log(error);
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

    res.status(201).json({
      success: true,
      driver: sanitizeDriver(driver),
    });
  } catch (error: any) {
    console.log("[DriverStatus] Failed to update status", error);
    res.status(500).json({
      success: false,
      message: error.message,
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

    // SILICON VALLEY APPROACH: Only check for VERY recent rides (last 5 minutes)
    // This prevents false positives from old/completed rides that weren't cleaned up
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    console.log(`🔍 [newRide] Checking for recent rides (last 5 min) for user ${userId}, driver ${req.driver.id}...`);
    
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
      orderBy: {
        cratedAt: "desc",
      },
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

    const newRide = await prisma.rides.create({
      data: {
        userId,
        driverId: req.driver.id,
        charge: parseFloat(charge),
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

      // Calculate 10% commission from ride charge
      const commission = rideCharge * 0.1;
      
      // Check if wallet has already gone negative
      const walletAlreadyNegative = (driver as any).walletHasGoneNegative || false;
      const currentWalletBalance = ((driver as any).walletBalance as number) || 0;
      
      // Prepare update data
      const updateData: any = {
        totalEarning: {
          increment: rideCharge,
        },
        totalRides: {
          increment: 1,
        },
      };

      // Deduct commission from wallet only if it hasn't gone negative before
      if (!walletAlreadyNegative) {
        const newWalletBalance = currentWalletBalance - commission;
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
  const rides = await prisma.rides.findMany({
    where: {
      driverId: req.driver?.id,
    },
    include: {
      driver: true,
      user: true,
    },
  });
  res.status(201).json({
    rides: rides.map((ride) => ({
      ...ride,
      driver: sanitizeDriver(ride.driver),
    })),
  });
};
