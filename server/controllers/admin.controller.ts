import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";

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

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;

export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password.",
      });
    }

    // Try to find admin in database first
    let admin = null;
    try {
      admin = await prisma.admin.findUnique({
        where: { email },
      });
    } catch (dbError) {
      console.log("[Admin Login] Database check failed, falling back to .env:", dbError);
    }

    // If admin exists in database, use database authentication
    if (admin) {
      // Verify password from database
      const isPasswordValid = await bcrypt.compare(password, admin.password);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid administrator credentials.",
        });
      }

      // Generate JWT token
      const token = jwt.sign({ role: "admin", id: admin.id }, ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });

      return res.status(200).json({
        success: true,
        token,
      });
    }

    // Fallback to .env-based authentication if no admin in database
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.FLASHRIDE_ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.FLASHRIDE_ADMIN_PASSWORD;

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return res.status(500).json({
        success: false,
        message: "Admin credentials are not configured.",
      });
    }

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: "Invalid administrator credentials.",
      });
    }

    // Generate JWT token for .env-based auth
    const token = jwt.sign({ role: "admin" }, ACCESS_TOKEN_SECRET, {
      expiresIn: "1d",
    });

    return res.status(200).json({
      success: true,
      token,
    });
  } catch (error) {
    console.error("[Admin Login] Error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during login.",
    });
  }
};

export const getDriversForReview = async (req: Request, res: Response) => {
  try {
    const { status } = req.query as { status?: string };

    console.log("[Admin] Fetching drivers with status:", status || "all");

    const drivers = await prisma.driver.findMany({
      where:
        status && status !== "all"
          ? {
              accountStatus: status,
            }
          : undefined,
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log("[Admin] Found", drivers.length, "drivers");

    return res.status(200).json({
      success: true,
      drivers: drivers.map((driver) => ({
        ...sanitizeDriver(driver),
        submittedAt: driver.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Admin] Error fetching drivers:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch drivers",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateDriverReviewStatus = async (req: Request, res: Response) => {
  const { decision, rejectionReason } = req.body as {
    decision: "approved" | "declined" | "blocked" | "reinstate";
    rejectionReason?: string;
  };
  const { driverId } = req.params;

  if (!["approved", "declined", "blocked", "reinstate"].includes(decision)) {
    return res.status(400).json({
      success: false,
      message:
        "Decision must be one of 'approved', 'declined', 'blocked', or 'reinstate'.",
    });
  }

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
  });

  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found.",
    });
  }

  if (decision === "declined" && !rejectionReason) {
    return res.status(400).json({
      success: false,
      message: "Please include a rejection reason.",
    });
  }

  const dataToUpdate: any = {
    reviewedAt: new Date(),
  };

  if (decision === "approved") {
    dataToUpdate.accountStatus = "approved";
    dataToUpdate.rejectionReason = null;
    dataToUpdate.status = "inactive";
  }

  if (decision === "declined") {
    dataToUpdate.accountStatus = "declined";
    dataToUpdate.rejectionReason = rejectionReason ?? null;
    dataToUpdate.status = "inactive";
  }

  if (decision === "blocked") {
    dataToUpdate.accountStatus = "blocked";
    dataToUpdate.rejectionReason = null;
    dataToUpdate.status = "inactive";
  }

  if (decision === "reinstate") {
    dataToUpdate.accountStatus = "approved";
    dataToUpdate.rejectionReason = null;
  }

  const updatedDriver = await prisma.driver.update({
    where: { id: driverId },
    data: dataToUpdate,
  });

  return res.status(200).json({
    success: true,
    driver: sanitizeDriver(updatedDriver),
  });
};

// Update driver wallet balance
export const updateDriverWalletBalance = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;
    const { walletBalance } = req.body as { walletBalance: number };

    if (walletBalance === undefined || walletBalance === null) {
      return res.status(400).json({
        success: false,
        message: "Wallet balance is required.",
      });
    }

    if (typeof walletBalance !== "number" || walletBalance < 0) {
      return res.status(400).json({
        success: false,
        message: "Wallet balance must be a positive number.",
      });
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }

    const balanceBefore = ((driver as any).walletBalance as number) || 0;
    
    // Truncate wallet balance (drop all decimals)
    const truncatedWalletBalance = truncateDecimal(walletBalance);
    const amountAdded = truncatedWalletBalance - balanceBefore;

    // Update driver wallet balance
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        walletBalance: truncatedWalletBalance as any,
      } as any,
    });

    // Create transaction history record
    try {
      const adminId = (req as any).admin?.id || null;
      // Use dynamic access to walletTransaction model
      const WalletTransaction = (prisma as any).walletTransaction;
      if (WalletTransaction) {
        await WalletTransaction.create({
          data: {
            driverId,
            adminId,
            amount: amountAdded,
            balanceBefore,
            balanceAfter: truncatedWalletBalance,
          },
        });
        console.log(`[Admin] Transaction recorded: ${amountAdded} MRU added to driver ${driverId}`);
      } else {
        console.warn("[Admin] walletTransaction model not available. Run 'npx prisma generate' to update Prisma client.");
      }
    } catch (transactionError: any) {
      console.error("[Admin] Error creating wallet transaction record:", transactionError?.message || transactionError);
      // Don't fail the request if transaction history fails, but log it
    }

    return res.status(200).json({
      success: true,
      driver: sanitizeDriver(updatedDriver),
      message: "Driver wallet balance updated successfully.",
    });
  } catch (error: any) {
    console.error("[Admin] Error updating driver wallet balance:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update driver wallet balance.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get wallet transaction history for a driver
export const getDriverWalletHistory = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;

    // Use dynamic access to walletTransaction model
    const WalletTransaction = (prisma as any).walletTransaction;
    
    if (!WalletTransaction) {
      console.error("[Admin] walletTransaction model not available. Prisma client needs to be regenerated.");
      return res.status(500).json({
        success: false,
        message: "Transaction history feature not available. Please run 'npx prisma generate' on the server.",
      });
    }

    const transactions = await WalletTransaction.findMany({
      where: {
        driverId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      transactions: transactions.map((tx: any) => ({
        id: tx.id,
        amount: tx.amount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        createdAt: tx.createdAt,
        admin: tx.admin ? {
          email: tx.admin.email,
          name: tx.admin.name,
        } : null,
      })),
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching wallet history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch wallet transaction history.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get driver ride history for admin
export const getDriverRides = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;

    const rides = await prisma.rides.findMany({
      where: {
        driverId: driverId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone_number: true,
          },
        },
      },
      orderBy: {
        cratedAt: "desc",
      },
    });

    // Calculate commission and net amount for each completed ride
    const ridesWithDetails = rides.map((ride) => {
      const tripCost = Math.floor(ride.charge); // Truncate (drop decimals)
      const commission = Math.floor(ride.charge * 0.1); // 10% commission, truncated
      const netAmount = tripCost - commission; // What driver actually received

      return {
        id: ride.id,
        userId: ride.userId,
        driverId: ride.driverId,
        charge: tripCost,
        commission: commission,
        netAmount: netAmount,
        status: ride.status,
        currentLocationName: ride.currentLocationName,
        destinationLocationName: ride.destinationLocationName,
        distance: ride.distance,
        rating: ride.rating,
        cratedAt: ride.cratedAt,
        updatedAt: ride.updatedAt,
        user: ride.user,
      };
    });

    return res.status(200).json({
      success: true,
      rides: ridesWithDetails,
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching driver rides:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch driver ride history.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Delete driver completely from database
export const deleteDriver = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;

    // Check if driver exists
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }

    // Only allow deletion of declined drivers
    if ((driver as any).accountStatus !== "declined") {
      return res.status(400).json({
        success: false,
        message: "Only declined drivers can be deleted.",
      });
    }

    console.log(`[Admin] Deleting driver: ${driverId} (${(driver as any).name})`);

    // Delete wallet transactions first (if they exist)
    try {
      const WalletTransaction = (prisma as any).walletTransaction;
      if (WalletTransaction) {
        await WalletTransaction.deleteMany({
          where: { driverId },
        });
        console.log(`[Admin] Deleted wallet transactions for driver ${driverId}`);
      }
    } catch (transactionError: any) {
      console.warn("[Admin] Error deleting wallet transactions (continuing anyway):", transactionError?.message || transactionError);
    }

    // Delete rides associated with this driver (if any)
    try {
      await prisma.rides.deleteMany({
        where: { driverId },
      });
      console.log(`[Admin] Deleted rides for driver ${driverId}`);
    } catch (ridesError: any) {
      console.warn("[Admin] Error deleting rides (continuing anyway):", ridesError?.message || ridesError);
    }

    // Finally, delete the driver
    await prisma.driver.delete({
      where: { id: driverId },
    });

    console.log(`[Admin] ✅ Driver ${driverId} deleted successfully`);

    return res.status(200).json({
      success: true,
      message: "Driver deleted successfully. All credentials and data have been removed from the database.",
    });
  } catch (error: any) {
    console.error("[Admin] Error deleting driver:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete driver.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

