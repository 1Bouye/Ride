const path = require("path");
const envPath = path.resolve(__dirname, ".env");
console.log(`[dotenv] Loading .env from: ${envPath}`);
const result = require("dotenv").config({ path: envPath });
if (result.error) {
  console.error(`[dotenv] Error loading .env:`, result.error);
} else {
  console.log(`[dotenv] Loaded ${Object.keys(result.parsed || {}).length} variables from .env`);
}
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import userRouter from "./routes/user.route";
import Nylas from "nylas";
import driverRouter from "./routes/driver.route";
import adminRouter from "./routes/admin.route";

// Check Twilio configuration on startup
const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
const serviceSid = process.env.TWILIO_SERVICE_SID ?? "";

// Debug: Check for common typos
const allEnvKeys = Object.keys(process.env);
const twilioKeys = allEnvKeys.filter(key => key.includes("TWILIO"));
if (twilioKeys.length > 0) {
  console.log(`[Twilio Debug] Found ${twilioKeys.length} Twilio-related env vars:`, twilioKeys);
}

// Check for common typos
if (!accountSid) {
  if (process.env.TWILIO_ACCOOUNT_SID) {
    console.error(`[Twilio] ❌ TYPO FOUND: You have "TWILIO_ACCOOUNT_SID" (double O) but need "TWILIO_ACCOUNT_SID"`);
  }
  if (process.env["TWILIO_ACCOUNT_SID "]) {
    console.error(`[Twilio] ❌ TYPO FOUND: Variable has trailing space: "TWILIO_ACCOUNT_SID "`);
  }
}
if (!authToken) {
  if (process.env["TWILIO_AUTH-TOKEN"]) {
    console.error(`[Twilio] ❌ TYPO FOUND: You have "TWILIO_AUTH-TOKEN" (hyphen) but need "TWILIO_AUTH_TOKEN" (underscore)`);
  }
  if (process.env["TWILIO_AUTH_TOKEN "]) {
    console.error(`[Twilio] ❌ TYPO FOUND: Variable has trailing space: "TWILIO_AUTH_TOKEN "`);
  }
}
if (!serviceSid) {
  if (process.env["TWILIO_SERVICE_SID "]) {
    console.error(`[Twilio] ❌ TYPO FOUND: Variable has trailing space: "TWILIO_SERVICE_SID "`);
  }
}

const missing: string[] = [];
if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
if (!serviceSid) missing.push("TWILIO_SERVICE_SID");

if (missing.length) {
  console.warn(`[Twilio] ⚠️  OTP service disabled. Missing environment variables: ${missing.join(", ")}`);
  console.warn(`[Twilio] Add these to your .env file in Ridewave/server/.env`);
  console.warn(`[Twilio] Make sure there are NO spaces around the = sign and NO quotes around values`);
  console.warn(`[Twilio] Format: TWILIO_ACCOUNT_SID=your_value_here`);
} else {
  console.log(`[Twilio] ✅ OTP service configured (Service SID: ${serviceSid.substring(0, 10)}...)`);
}

// Check for development mode
const skipOtp = process.env.SKIP_OTP_VERIFICATION === "true";
if (skipOtp) {
  console.log(`[DEV MODE] 🧪 OTP verification is DISABLED. Test OTP code: 1234`);
  console.log(`[DEV MODE] To enable real OTP, set SKIP_OTP_VERIFICATION=false in .env`);
}

export const app = express();

export const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY!,
  apiUri: "https://api.eu.nylas.com",
});

// Request timeout middleware - prevent requests from hanging indefinitely
app.use((req: Request, res: Response, next: NextFunction) => {
  // Set a 30 second timeout for all requests
  const timeout = 30000; // 30 seconds
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[Request Timeout] ${req.method} ${req.path} exceeded ${timeout}ms`);
      res.status(504).json({
        success: false,
        message: "Request timeout. Please try again.",
      });
    }
  }, timeout);

  // Clear timeout when response is sent
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  
  next();
});

// Request logging middleware - log all incoming requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
  console.log(`[Request] Origin: ${req.headers.origin || 'none'}`);
  console.log(`[Request] User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'none'}`);
  console.log(`[Request] IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);
  
  // Log request body for POST/PUT requests (excluding sensitive data)
  if (req.method === 'POST' || req.method === 'PUT') {
    const bodyCopy = { ...req.body };
    if (bodyCopy.password) {
      bodyCopy.password = '[REDACTED]';
    }
    console.log(`[Request] Body keys:`, Object.keys(bodyCopy));
  }
  
  // Track response time
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusEmoji = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅';
    console.log(`${statusEmoji} [${timestamp}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// body parser
app.use(express.json({ limit: "50mb" }));

// cookie parserv
app.use(cookieParser());

// CORS configuration - Allow all origins for development (React Native apps)
// In production, restrict this to specific domains
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // List of allowed origins
      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:4000",
        "http://localhost:8081",
        "http://localhost:8083",
        "http://localhost:8084",
        // Allow any local IP for development
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
        /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
        /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/, // 172.16.0.0 - 172.31.255.255
      ];
      
      // Check if origin matches any allowed pattern
      const isAllowed = allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') {
          return origin === allowed;
        } else if (allowed instanceof RegExp) {
          return allowed.test(origin);
        }
        return false;
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        // For development, allow all origins (React Native apps)
        // In production, you should restrict this
        console.log(`[CORS] Allowing origin: ${origin} (development mode)`);
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// routes
app.use("/api/v1", userRouter);
app.use("/api/v1/driver", driverRouter);
app.use("/api/v1/admin", adminRouter);

// Error handling middleware - must be after routes
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Error Handler] Unhandled error for ${req.method} ${req.path}:`, err);
  
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      message: err?.message || "Internal server error",
    });
  }
});

// 404 handler - must be last
app.use((req: Request, res: Response) => {
  console.warn(`[404] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// testing api
app.get("/test", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    success: true,
    message: "API is working",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint for driver registration
app.get("/api/v1/driver/health", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Driver API is accessible",
    timestamp: new Date().toISOString(),
  });
});

// Test endpoint for supabase-login route
app.get("/api/v1/test-supabase-route", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Supabase route is accessible",
    timestamp: new Date().toISOString(),
  });
});

// debug endpoint to check Twilio env vars (remove in production)
app.get("/debug/twilio", (req: Request, res: Response) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_SERVICE_SID;
  
  res.status(200).json({
    TWILIO_ACCOUNT_SID: accountSid ? `${accountSid.substring(0, 4)}...` : "NOT SET",
    TWILIO_AUTH_TOKEN: authToken ? `${authToken.substring(0, 4)}...` : "NOT SET",
    TWILIO_SERVICE_SID: serviceSid ? `${serviceSid.substring(0, 4)}...` : "NOT SET",
    allSet: !!(accountSid && authToken && serviceSid),
  });
});
