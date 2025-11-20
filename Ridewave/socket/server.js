const express = require("express");
const { WebSocketServer } = require("ws");
const geolib = require("geolib");

// Express app is not currently used, but kept for future HTTP endpoints
const app = express();
const PORT = 3000; // HTTP server port (optional, not currently used)
const WS_PORT = 8080; // WebSocket server port (REQUIRED)

// Store driver locations in memory
// ⚠️ NOTE: This data is lost when server restarts
// For production, consider using Redis or a database for persistent storage
let drivers = {};
// Track driver sockets for direct messaging
const driverIdToSocket = {};
// Track user sockets for forwarding accept events
const userIdToSocket = {};

// Create WebSocket server - bind to all interfaces (0.0.0.0) to accept network connections
const wss = new WebSocketServer({ 
  port: WS_PORT,
  host: '0.0.0.0' // Allow connections from any IP address
});

console.log(`🚀 WebSocket Server starting on ws://0.0.0.0:${WS_PORT}`);
console.log(`📡 Listening for connections from network...`);

wss.on("listening", () => {
  console.log(`✅ WebSocket Server is running on port ${WS_PORT}`);
  console.log(`🌐 Accepting connections from: ws://localhost:${WS_PORT} or ws://YOUR_IP:${WS_PORT}`);
  console.log(`⚠️  Driver locations stored in memory (will be lost on server restart)`);
  console.log(`💡 For production, consider using Redis for persistent storage`);
});

wss.on("error", (error) => {
  console.error("❌ WebSocket Server Error:", error);
});

wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`✅ New WebSocket connection from: ${clientIP}`);
  console.log(`📊 Total active connections: ${wss.clients.size}`);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 Received message from ${clientIP}:`, data.type);

      // Driver self-identification (so we can notify even before movement/location updates)
      if (data.type === "identify" && data.role === "driver" && data.driverId) {
        ws.driverId = data.driverId;
        driverIdToSocket[data.driverId] = ws;
        console.log(`🪪 Driver identified on WS: ${data.driverId}`);
        return;
      }

      // User self-identification (so server can forward driver accept)
      if (data.type === "identify" && data.role === "user" && data.userId) {
        ws.userId = data.userId;
        userIdToSocket[data.userId] = ws;
        console.log(`🪪 User identified on WS: ${data.userId}`);
        return;
      }

      if (data.type === "locationUpdate" && data.role === "driver") {
        // Store driver location in memory (lost on server restart)
        const wasStale = drivers[data.driver]?.stale;
        drivers[data.driver] = {
          latitude: data.data.latitude,
          longitude: data.data.longitude,
          lastUpdate: new Date().toISOString(), // Track when location was last updated
          stale: false, // Mark as active/fresh
        };
        // Store driver ID on WebSocket connection for cleanup on disconnect
        ws.driverId = data.driver;
        // Track this socket to message the driver later
        driverIdToSocket[data.driver] = ws;
        
        if (wasStale) {
          console.log(`🔄 Driver ${data.driver} reconnected, location refreshed`);
        }
        console.log(`📍 Updated driver location (${data.driver}):`, {
          latitude: drivers[data.driver].latitude,
          longitude: drivers[data.driver].longitude,
          lastUpdate: drivers[data.driver].lastUpdate
        });
        console.log(`📊 Total drivers tracked in memory: ${Object.keys(drivers).length}`);
      }

      if (data.type === "requestRide" && data.role === "user") {
        console.log(`🚗 Ride request from user at (${data.latitude}, ${data.longitude})`);
        console.log(`📊 Total drivers in memory: ${Object.keys(drivers).length}`);
        
        // Log all drivers and their distances for debugging
        if (Object.keys(drivers).length > 0) {
          console.log(`🔍 Checking ${Object.keys(drivers).length} drivers:`);
          Object.entries(drivers).forEach(([id, location]) => {
            const distance = geolib.getDistance(
              { latitude: data.latitude, longitude: data.longitude },
              { latitude: location.latitude, longitude: location.longitude }
            );
            const distanceKm = (distance / 1000).toFixed(2);
            console.log(`  - Driver ${id}: ${distanceKm}km away at (${location.latitude}, ${location.longitude})`);
          });
        } else {
          console.log(`⚠️  No drivers in memory! Driver may have disconnected.`);
        }
        
        const nearbyDrivers = findNearbyDrivers(data.latitude, data.longitude);
        console.log(`👥 Found ${nearbyDrivers.length} nearby drivers (within 5km)`);
        
        if (nearbyDrivers.length === 0 && Object.keys(drivers).length > 0) {
          console.log(`💡 All drivers are too far away (>5km). Consider increasing search radius.`);
        }
        
        ws.send(
          JSON.stringify({ type: "nearbyDrivers", drivers: nearbyDrivers })
        );
      }
      
      // Directly notify a specific driver via websocket (bypass push)
      if (data.type === "notifyDriver" && data.role === "user") {
        const { driverId, payload } = data;
        const targetSocket = driverIdToSocket[driverId];
        if (targetSocket && targetSocket.readyState === 1 /* OPEN */) {
          console.log(`📣 Notifying driver ${driverId} via WS`);
          targetSocket.send(JSON.stringify({ type: "rideRequest", payload }));
        } else {
          console.log(`⚠️ Unable to notify driver ${driverId} via WS: not connected`);
        }
      }

      // Driver accepted ride: forward to that user if online
      if (data.type === "driverAccept" && data.role === "driver") {
        const { userId, payload } = data;
        const uSocket = userIdToSocket[userId];
        if (uSocket && uSocket.readyState === 1 /* OPEN */) {
          console.log(`✅ Forwarding driver accept to user ${userId}`);
          uSocket.send(JSON.stringify({ type: "rideAccepted", payload }));
        } else {
          console.log(`⚠️ Unable to notify user ${userId}: not connected`);
        }
        // Fallback: broadcast to all clients; user app will ignore if not matching
        wss.clients.forEach((client) => {
          try {
            if (client.readyState === 1 /* OPEN */) {
              client.send(JSON.stringify({ type: "rideAccepted", payload }));
            }
          } catch {}
        });
      }
    } catch (error) {
      console.error("❌ Failed to parse WebSocket message:", error);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`🔌 WebSocket connection closed from ${clientIP}. Code: ${code}, Reason: ${reason || 'None'}`);
    console.log(`📊 Remaining active connections: ${wss.clients.size}`);
    
    // For drivers: Don't immediately remove location on disconnect
    // Keep it for a short time in case they reconnect quickly
    // This helps with brief connection drops
    const driverId = ws.driverId;
    if (driverId && drivers[driverId]) {
      // Mark location as stale but keep it for 30 seconds
      // This allows drivers who briefly disconnect to still be found
      console.log(`⏳ Driver ${driverId} disconnected, keeping location for 30 seconds...`);
      
      setTimeout(() => {
        // Only remove if still disconnected after 30 seconds
        if (drivers[driverId] && drivers[driverId].stale) {
          delete drivers[driverId];
          console.log(`🗑️ Removed stale driver location from memory: ${driverId}`);
          console.log(`📊 Active drivers in memory: ${Object.keys(drivers).length}`);
        }
      }, 30000); // 30 seconds
      
      // Mark as stale
      drivers[driverId].stale = true;
      drivers[driverId].disconnectedAt = new Date().toISOString();
      // Remove socket mapping immediately
      if (driverIdToSocket[driverId]) {
        delete driverIdToSocket[driverId];
      }
    }

    // Cleanup user mapping if present
    if (ws.userId && userIdToSocket[ws.userId]) {
      delete userIdToSocket[ws.userId];
    }
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error from ${clientIP}:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: "connected", message: "Welcome to Flashride WebSocket Server" }));
});

const findNearbyDrivers = (userLat, userLon) => {
  // Filter drivers stored in memory
  // Include both active and recently disconnected drivers (stale but within 30 seconds)
  return Object.entries(drivers)
    .filter(([id, location]) => {
      const distance = geolib.getDistance(
        { latitude: userLat, longitude: userLon },
        { latitude: location.latitude, longitude: location.longitude }
      );
      // Include drivers within 5km, whether active or recently disconnected
      return distance <= 5000; // 5 kilometers
    })
    .map(([id, location]) => ({ 
      id, 
      latitude: location.latitude, 
      longitude: location.longitude,
      lastUpdate: location.lastUpdate 
    }));
};

// HTTP server is optional - only WebSocket server (port 8080) is required
// Uncomment below if you need HTTP endpoints in the future
/*
app.listen(PORT, (error) => {
  if (error) {
    console.warn(`⚠️  HTTP Server port ${PORT} is already in use (this is optional)`);
    console.log(`✅ WebSocket server on port ${WS_PORT} is still running`);
  } else {
    console.log(`🌐 HTTP Server is running on port ${PORT}`);
  }
});
*/

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});
