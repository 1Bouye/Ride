import { NextFunction, Response } from "express";
import prisma, { isConnectionError, retryDatabaseOperation } from "../utils/prisma";
import jwt from "jsonwebtoken";

export const isAuthenticated = (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Please Log in to access this content!" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    // Verify the token
    jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET!,
      async (err: any, decoded: any) => {
        if (err) {
          console.error("[isAuthenticated] Token verification failed:", err.message);
          return res.status(401).json({ 
            success: false,
            message: "Invalid token" 
          });
        }

        if (!decoded?.id) {
          console.error("[isAuthenticated] Token missing user ID");
          return res.status(401).json({ 
            success: false,
            message: "Invalid token format" 
          });
        }

        try {
          console.log(`[isAuthenticated] Fetching user data for ID: ${decoded.id}`);
          const userData = await retryDatabaseOperation(
            () => prisma.user.findUnique({
              where: {
                id: decoded.id,
              },
            }),
            2, // 2 retries for auth operations
            500 // 500ms delay
          );

          if (!userData) {
            console.error(`[isAuthenticated] User not found in database: ${decoded.id}`);
            return res.status(404).json({ 
              success: false,
              message: "User not found. Please log in again." 
            });
          }

          console.log(`[isAuthenticated] User found: ${userData.email || userData.phone_number || userData.id}`);
          // Attach the user data to the request object
          req.user = userData;
          next();
        } catch (dbError: any) {
          console.error("[isAuthenticated] Database error:", dbError);
          
          if (isConnectionError(dbError)) {
            return res.status(503).json({ 
              success: false,
              message: "Database connection unavailable. Please try again in a moment." 
            });
          }
          
          return res.status(500).json({ 
            success: false,
            message: "Database error. Please try again." 
          });
        }
      }
    );
  } catch (error: any) {
    console.error("[isAuthenticated] Unexpected error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Authentication error. Please try again." 
    });
  }
};

export const isAuthenticatedDriver = (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Please Log in to access this content!" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    // Verify the token
    jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET!,
      async (err: any, decoded: any) => {
        if (err) {
          console.error("[isAuthenticatedDriver] Token verification failed:", err.message);
          return res.status(401).json({ 
            success: false,
            message: "Invalid token" 
          });
        }

        if (!decoded?.id) {
          console.error("[isAuthenticatedDriver] Token missing driver ID");
          return res.status(401).json({ 
            success: false,
            message: "Invalid token format" 
          });
        }

        try {
          console.log(`[isAuthenticatedDriver] Fetching driver data for ID: ${decoded.id}`);
          const driverData = await retryDatabaseOperation(
            () => prisma.driver.findUnique({
              where: {
                id: decoded.id,
              },
            }),
            2, // 2 retries for auth operations
            500 // 500ms delay
          );

          if (!driverData) {
            console.error(`[isAuthenticatedDriver] Driver not found in database: ${decoded.id}`);
            return res.status(404).json({ 
              success: false,
              message: "Driver not found. Please log in again." 
            });
          }

          console.log(`[isAuthenticatedDriver] Driver found: ${driverData.name || driverData.phone_number || driverData.id}`);
          // Attach the driver data to the request object
          req.driver = driverData;
          next();
        } catch (dbError: any) {
          console.error("[isAuthenticatedDriver] Database error:", dbError);
          
          if (isConnectionError(dbError)) {
            return res.status(503).json({ 
              success: false,
              message: "Database connection unavailable. Please try again in a moment." 
            });
          }
          
          return res.status(500).json({ 
            success: false,
            message: "Database error. Please try again." 
          });
        }
      }
    );
  } catch (error: any) {
    console.error("[isAuthenticatedDriver] Unexpected error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Authentication error. Please try again." 
    });
  }
};

export const isAuthenticatedAdmin = (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Please log in to access this content!" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET!,
      async (err: any, decoded: any) => {
        if (err || decoded?.role !== "admin") {
          return res.status(401).json({ message: "Invalid token" });
        }

        // Try to find admin in database if ID is available
        let adminData = null;
        if (decoded.id) {
          try {
            adminData = await retryDatabaseOperation(
              () => prisma.admin.findUnique({
                where: { id: decoded.id },
              }),
              2,
              500
            );
          } catch (error) {
            if (isConnectionError(error)) {
              console.warn("[Auth] Admin lookup failed due to connection error, using token data only");
            } else {
              console.log("[Auth] Admin lookup failed, using token data only");
            }
          }
        }
        
        req.admin = { 
          role: decoded.role,
          id: decoded.id || adminData?.id || null,
        };
        next();
      }
    );
  } catch (error) {
    console.log(error);
  }
};