const express = require("express");
const { WebSocketServer } = require("ws");
const geolib = require("geolib");
const path = require("path");

// Load environment variables - try server directory first, then current directory
const serverEnvPath = path.join(__dirname, "../server/.env");
const localEnvPath = path.join(__dirname, ".env");
require("dotenv").config({ path: serverEnvPath }); // Try server .env first
require("dotenv").config({ path: localEnvPath }); // Then try local .env (will override if exists)

// Try to load Prisma client from server's node_modules first, fallback to local
let PrismaClient;
try {
  // Try server's generated client first
  const serverPrismaPath = path.join(__dirname, "../server/node_modules/@prisma/client");
  PrismaClient = require(serverPrismaPath).PrismaClient;
} catch (err) {
  // Fallback to local @prisma/client
  try {
    PrismaClient = require("@prisma/client").PrismaClient;
  } catch (err2) {
    console.error("❌ Failed to load Prisma Client. Make sure Prisma is generated in server directory.");
    console.error("   Run: cd ../server && npx prisma generate");
    throw err2;
  }
}

// Initialize Prisma client for database checks
const prisma = new PrismaClient();

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
// Track active ride requests: { requestId: { userId, status: 'pending'|'processing'|'accepted', notifiedDrivers: [driverIds], processingBy: driverId, acceptedBy: driverId, payload: {...}, createdAt: timestamp } }
const activeRideRequests = {};

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
  
  // Display status every 30 seconds
  setInterval(() => {
    displayServerStatus();
  }, 30000);
  
  // Display initial status
  setTimeout(() => {
    displayServerStatus();
  }, 5000); // Show status after 5 seconds
  
  // Periodic connection health check - clean up stale entries every 60 seconds
  setInterval(() => {
    // Clean up stale driver entries
    Object.keys(driverIdToSocket).forEach(id => {
      const socket = driverIdToSocket[id];
      if (!socket || socket.readyState !== 1) {
        console.log(`🧹 Removing stale driver entry: ${id}`);
        delete driverIdToSocket[id];
      }
    });
    
    // Clean up stale user entries
    Object.keys(userIdToSocket).forEach(id => {
      const socket = userIdToSocket[id];
      if (!socket || socket.readyState !== 1) {
        console.log(`🧹 Removing stale user entry: ${id}`);
        delete userIdToSocket[id];
      }
    });
  }, 60000); // Every 60 seconds
});

// Function to display server status
function displayServerStatus() {
  const totalConnections = wss.clients.size;
  
  // Get all active driver IDs with open sockets
  const activeDrivers = Object.keys(driverIdToSocket).filter(id => {
    const socket = driverIdToSocket[id];
    return socket && socket.readyState === 1; // OPEN
  });
  
  // Get all active user IDs with open sockets
  const activeUsers = Object.keys(userIdToSocket).filter(id => {
    const socket = userIdToSocket[id];
    return socket && socket.readyState === 1; // OPEN
  });
  
  // Check for stale entries (sockets that are closed but still in mapping)
  const staleDrivers = Object.keys(driverIdToSocket).filter(id => {
    const socket = driverIdToSocket[id];
    return socket && socket.readyState !== 1;
  });
  
  const staleUsers = Object.keys(userIdToSocket).filter(id => {
    const socket = userIdToSocket[id];
    return socket && socket.readyState !== 1;
  });
  
  // Clean up stale entries
  if (staleDrivers.length > 0) {
    console.log(`🧹 Cleaning up ${staleDrivers.length} stale driver entries...`);
    staleDrivers.forEach(id => {
      delete driverIdToSocket[id];
    });
  }
  
  if (staleUsers.length > 0) {
    console.log(`🧹 Cleaning up ${staleUsers.length} stale user entries...`);
    staleUsers.forEach(id => {
      delete userIdToSocket[id];
    });
  }
  
  // Check for unidentified connections
  const allIdentifiedSockets = new Set();
  activeDrivers.forEach(id => {
    if (driverIdToSocket[id]) allIdentifiedSockets.add(driverIdToSocket[id]);
  });
  activeUsers.forEach(id => {
    if (userIdToSocket[id]) allIdentifiedSockets.add(userIdToSocket[id]);
  });
  
  const unidentifiedConnections = Array.from(wss.clients).filter(ws => 
    ws.readyState === 1 && !allIdentifiedSockets.has(ws)
  );
  
  const driversWithLocation = Object.keys(drivers).filter(id => !drivers[id].stale).length;
  const activeRideRequestsCount = Object.keys(activeRideRequests).length;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 WEBSOCKET SERVER STATUS');
  console.log('='.repeat(60));
  console.log(`🔌 Total Active Connections: ${totalConnections}`);
  console.log(`🚗 Active Drivers (identified): ${activeDrivers.length}`);
  console.log(`👤 Active Users (identified): ${activeUsers.length}`);
  console.log(`❓ Unidentified Connections: ${unidentifiedConnections.length}`);
  console.log(`📍 Drivers with Location Data: ${driversWithLocation}`);
  console.log(`🚕 Active Ride Requests: ${activeRideRequestsCount}`);
  
  if (activeDrivers > 0) {
    console.log(`\n🚗 Active Driver IDs:`);
    Object.keys(driverIdToSocket).forEach(id => {
      const socket = driverIdToSocket[id];
      if (socket && socket.readyState === 1) {
        const hasLocation = drivers[id] && !drivers[id].stale;
        const locationInfo = hasLocation 
          ? `📍 (${drivers[id].latitude.toFixed(4)}, ${drivers[id].longitude.toFixed(4)})`
          : '❌ (no location)';
        console.log(`   - ${id} ${locationInfo}`);
      }
    });
  }
  
  if (activeUsers > 0) {
    console.log(`\n👤 Active User IDs:`);
    Object.keys(userIdToSocket).forEach(id => {
      const socket = userIdToSocket[id];
      if (socket && socket.readyState === 1) {
        const connectedAt = socket.connectedAt || 'unknown';
        console.log(`   - ${id} (connected at: ${connectedAt})`);
      } else if (socket) {
        console.log(`   - ${id} ❌ (socket state: ${socket.readyState === 0 ? 'CONNECTING' : socket.readyState === 1 ? 'OPEN' : socket.readyState === 2 ? 'CLOSING' : 'CLOSED'})`);
      }
    });
  } else {
    console.log(`\n👤 No active users identified`);
  }
  
  // Show unidentified connections with details
  if (unidentifiedConnections.length > 0) {
    console.log(`\n❓ Unidentified Connections (${unidentifiedConnections.length}):`);
    unidentifiedConnections.forEach((ws, index) => {
      const connectedAt = ws.connectedAt || 'unknown';
      const lastMessage = ws.lastMessageTime ? `(last message: ${ws.lastMessageTime})` : '(no messages yet)';
      console.log(`   ${index + 1}. Connected at: ${connectedAt} ${lastMessage}`);
    });
    console.log(`   💡 These connections should send an "identify" message with their userId/driverId`);
  }
  
  if (totalConnections === 0) {
    console.log(`\n⚠️  No active connections. Waiting for clients to connect...`);
  } else if (totalConnections > 0 && activeDrivers === 0 && activeUsers === 0) {
    console.log(`\n⚠️  ${totalConnections} connection(s) exist but none are identified yet.`);
    console.log(`   💡 Clients should send an "identify" message after connecting.`);
  }
  
  console.log('='.repeat(60) + '\n');
}

wss.on("error", (error) => {
  console.error("❌ WebSocket Server Error:", error);
});

wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`\n✅ New WebSocket connection from: ${clientIP}`);
  console.log(`📊 Total active connections: ${wss.clients.size}`);
  console.log(`🔗 Connection details:`, {
    remoteAddress: clientIP,
    remotePort: req.socket.remotePort,
    localPort: req.socket.localPort,
    protocol: req.headers['sec-websocket-protocol'] || 'none',
    userAgent: req.headers['user-agent'] || 'unknown'
  });
  
  // Track connection time for debugging
  ws.connectedAt = new Date().toISOString();
  
  // Display updated status after new connection
  setTimeout(() => {
    const activeDrivers = Object.keys(driverIdToSocket).filter(id => {
      const socket = driverIdToSocket[id];
      return socket && socket.readyState === 1;
    }).length;
    const activeUsers = Object.keys(userIdToSocket).filter(id => {
      const socket = userIdToSocket[id];
      return socket && socket.readyState === 1;
    }).length;
    const unidentifiedConnections = wss.clients.size - activeDrivers - activeUsers;
    console.log(`📊 Current status - Drivers: ${activeDrivers}, Users: ${activeUsers}, Unidentified: ${unidentifiedConnections}, Total Connections: ${wss.clients.size}`);
    
    if (unidentifiedConnections > 0) {
      console.log(`⚠️  ${unidentifiedConnections} connection(s) not yet identified. Waiting for identify message...`);
    }
  }, 1000);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      ws.lastMessageTime = new Date().toISOString();
      console.log(`📨 Received message from ${clientIP}:`, data.type);
      
      // Log full message for identify messages to debug
      if (data.type === "identify") {
        console.log(`   📋 Identify message details:`, {
          role: data.role,
          userId: data.userId || 'missing',
          driverId: data.driverId || 'missing',
          hasUserId: !!data.userId,
          hasDriverId: !!data.driverId,
        });
      }
      
      // Log if this is from an unidentified connection
      if (!ws.userId && !ws.driverId && data.type !== "identify") {
        console.log(`   ⚠️  Message from unidentified connection. Type: ${data.type}`);
      }

      // Driver self-identification (so we can notify even before movement/location updates)
      if (data.type === "identify" && data.role === "driver") {
        if (!data.driverId) {
          console.error(`❌ Driver identify message missing driverId:`, data);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Driver identification failed: driverId is missing"
            }));
          }
          return;
        }
        
        ws.driverId = data.driverId;
        driverIdToSocket[data.driverId] = ws;
        console.log(`🪪 Driver identified on WS: ${data.driverId}`);
        console.log(`📊 Active drivers: ${Object.keys(driverIdToSocket).filter(id => driverIdToSocket[id]?.readyState === 1).length}`);
        console.log(`📋 All driver IDs in mapping:`, Object.keys(driverIdToSocket));
        
        // Send confirmation back to driver
        if (ws.readyState === 1 /* OPEN */) {
          ws.send(JSON.stringify({
            type: "identified",
            role: "driver",
            driverId: data.driverId,
            message: "Successfully identified as driver"
          }));
        }
        return;
      }

      // User self-identification (so server can forward driver accept)
      if (data.type === "identify" && data.role === "user") {
        console.log(`🔍 Processing user identify message:`, {
          hasUserId: !!data.userId,
          userId: data.userId || 'MISSING',
          socketState: ws.readyState === 1 ? 'OPEN' : ws.readyState === 0 ? 'CONNECTING' : ws.readyState === 2 ? 'CLOSING' : 'CLOSED',
          clientIP: clientIP,
        });
        
        if (!data.userId) {
          console.error(`❌ User identify message missing userId:`, data);
          console.error(`   Full message data:`, JSON.stringify(data, null, 2));
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User identification failed: userId is missing"
            }));
          }
          return;
        }
        
        // Check if this user ID is already mapped to a different socket
        const existingSocket = userIdToSocket[data.userId];
        if (existingSocket && existingSocket !== ws) {
          // Close the old connection if it's different
          if (existingSocket.readyState === 1) {
            console.log(`🔄 User ${data.userId} reconnecting. Closing old connection.`);
            try {
              existingSocket.close();
            } catch (e) {
              console.warn(`⚠️  Error closing old socket:`, e);
            }
          }
          delete userIdToSocket[data.userId];
        }
        
        ws.userId = data.userId;
        userIdToSocket[data.userId] = ws;
        console.log(`🪪 ✅ User identified on WS: ${data.userId}`);
        console.log(`   Connection details:`, {
          connectedAt: ws.connectedAt,
          readyState: ws.readyState === 1 ? 'OPEN' : ws.readyState === 0 ? 'CONNECTING' : ws.readyState === 2 ? 'CLOSING' : 'CLOSED',
          clientIP: clientIP,
          lastMessageTime: ws.lastMessageTime,
        });
        
        const activeUsersCount = Object.keys(userIdToSocket).filter(id => userIdToSocket[id]?.readyState === 1).length;
        console.log(`📊 Active users: ${activeUsersCount}`);
        console.log(`📋 All user IDs in mapping:`, Object.keys(userIdToSocket));
        
        // Verify the mapping was successful
        if (userIdToSocket[data.userId] === ws) {
          console.log(`✅ User ${data.userId} successfully mapped to socket`);
        } else {
          console.error(`❌ ERROR: User ${data.userId} mapping failed!`);
        }
        
        // Send confirmation back to user
        if (ws.readyState === 1 /* OPEN */) {
          try {
            ws.send(JSON.stringify({
              type: "identified",
              role: "user",
              userId: data.userId,
              message: "Successfully identified as user"
            }));
            console.log(`✅ Sent identification confirmation to user ${data.userId}`);
          } catch (error) {
            console.error(`❌ Failed to send confirmation to user ${data.userId}:`, error);
          }
        } else {
          console.warn(`⚠️  Could not send confirmation - socket state: ${ws.readyState}`);
        }
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
        // Validate required data
        if (!data.latitude || !data.longitude) {
          console.error(`❌ Invalid ride request: missing location data`);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid ride request: location data is missing"
            }));
          }
          return;
        }

        if (!data.userId && !ws.userId) {
          console.error(`❌ Invalid ride request: missing user ID`);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid ride request: user ID is missing. Please identify yourself first."
            }));
          }
          return;
        }

        if (!data.marker && !data.destination) {
          console.error(`❌ Invalid ride request: missing destination`);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid ride request: destination is missing"
            }));
          }
          return;
        }

        console.log(`🚗 Ride request from user at (${data.latitude}, ${data.longitude})`);
        console.log(`📊 Total drivers in memory: ${Object.keys(drivers).length}`);
        console.log(`👤 User ID: ${data.userId || ws.userId}`);
        
        // Generate unique request ID
        const requestId = `ride_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const userId = data.userId || ws.userId;
        
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
        
        const nearbyDrivers = await findNearbyDrivers(data.latitude, data.longitude);
        console.log(`👥 Found ${nearbyDrivers.length} active nearby drivers (within 5km)`);
        
        // Log detailed info about nearby drivers
        if (nearbyDrivers.length > 0) {
          console.log(`📋 Nearby drivers list:`);
          nearbyDrivers.forEach((driver) => {
            const hasSocket = driverIdToSocket[driver.id] ? true : false;
            const socketState = driverIdToSocket[driver.id]?.readyState;
            const socketOpen = socketState === 1;
            console.log(`  - Driver ${driver.id}: socket=${hasSocket ? 'yes' : 'NO'}, state=${socketState}, open=${socketOpen}`);
          });
        }
        
        if (nearbyDrivers.length === 0 && Object.keys(drivers).length > 0) {
          console.log(`💡 All drivers are too far away (>5km). Consider increasing search radius.`);
        }
        
        // Store ride request
        const rideRequestPayload = {
          requestId,
          user: data.user || data.userData,
          currentLocation: { latitude: data.latitude, longitude: data.longitude },
          marker: data.marker || data.destination,
          distance: data.distance,
          currentLocationName: data.currentLocationName,
          destinationLocation: data.destinationLocation || data.destinationLocationName,
          vehicleType: data.vehicleType,
        };
        
        activeRideRequests[requestId] = {
          userId,
          status: 'pending',
          notifiedDrivers: [],
          acceptedBy: null,
          payload: rideRequestPayload,
          createdAt: new Date().toISOString(),
        };
        
        // Broadcast ride request to ALL nearby drivers simultaneously
        const notifiedDriverIds = [];
        const failedDriverIds = [];
        
        nearbyDrivers.forEach((driver) => {
          const driverSocket = driverIdToSocket[driver.id];
          
          // Check if driver has an open socket connection
          if (driverSocket && driverSocket.readyState === 1 /* OPEN */) {
            try {
              driverSocket.send(JSON.stringify({
                type: "rideRequest",
                requestId,
                payload: rideRequestPayload,
              }));
              notifiedDriverIds.push(driver.id);
              console.log(`✅ Sent ride request ${requestId} to driver ${driver.id}`);
            } catch (err) {
              console.error(`❌ Failed to notify driver ${driver.id}:`, err);
              failedDriverIds.push(driver.id);
            }
          } else {
            const reason = !driverSocket 
              ? "no socket mapping" 
              : driverSocket.readyState === 0 
                ? "connecting" 
                : driverSocket.readyState === 2 
                  ? "closing" 
                  : driverSocket.readyState === 3 
                    ? "closed" 
                    : "unknown state";
            console.log(`⚠️ Driver ${driver.id} not available (${reason}), skipping notification`);
            failedDriverIds.push(driver.id);
          }
        });
        
        // Update request with notified drivers
        activeRideRequests[requestId].notifiedDrivers = notifiedDriverIds;
        
        console.log(`📊 Broadcast summary for request ${requestId}:`);
        console.log(`   ✅ Successfully notified: ${notifiedDriverIds.length} drivers`);
        console.log(`   ❌ Failed to notify: ${failedDriverIds.length} drivers`);
        console.log(`   📋 Notified driver IDs:`, notifiedDriverIds);
        
        if (failedDriverIds.length > 0) {
          console.log(`   ⚠️ Failed driver IDs:`, failedDriverIds);
        }
        
        // Also send nearby drivers list to user (for UI display)
        ws.send(
          JSON.stringify({ type: "nearbyDrivers", drivers: nearbyDrivers })
        );
        
        // Auto-cleanup request after 5 minutes if not accepted
        setTimeout(() => {
          if (activeRideRequests[requestId] && activeRideRequests[requestId].status === 'pending') {
            console.log(`⏰ Ride request ${requestId} expired (5 minutes), cleaning up`);
            delete activeRideRequests[requestId];
          }
        }, 5 * 60 * 1000); // 5 minutes
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

      // Driver accepted ride: ATOMIC ACCEPTANCE PATTERN (like Uber)
      // Based on example.md - database enforces the rule atomically
      if (data.type === "driverAccept" && data.role === "driver") {
        const { userId, payload, requestId } = data;
        const driverId = data.driverId || ws.driverId;
        
        if (!requestId) {
          console.error(`❌ Driver accept missing requestId`);
          return;
        }
        
        if (!userId) {
          console.error(`❌ Driver accept missing userId`);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Invalid request data",
            }));
          }
          return;
        }
        
        // Check if request exists
        const rideRequest = activeRideRequests[requestId];
        if (!rideRequest) {
          console.log(`⚠️ Ride request ${requestId} not found or already processed`);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Request already accepted by another driver",
            }));
          }
          return;
        }
        
        // ATOMIC LOCK: Check and set status atomically (first driver wins)
        // This prevents race conditions - only ONE driver can set status to "processing"
        let acquiredLock = false;
        if (rideRequest.status === 'pending') {
          // ATOMIC OPERATION: Set status to "processing" - only first driver can do this
          rideRequest.status = 'processing';
          rideRequest.processingBy = driverId;
          acquiredLock = true;
          console.log(`🔒 [Server] Driver ${driverId} acquired processing lock for request ${requestId}`);
        } else if (rideRequest.status === 'processing' || rideRequest.status === 'accepted') {
          // Another driver is already processing or has accepted
          const otherDriver = rideRequest.processingBy || rideRequest.acceptedBy;
          console.log(`❌ [Server] Request ${requestId} already ${rideRequest.status} by driver ${otherDriver}, rejecting driver ${driverId}`);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Request already accepted by another driver",
            }));
          }
          return;
        }
        
        // If we didn't acquire the lock, we shouldn't proceed
        if (!acquiredLock) {
          console.error(`❌ [Server] Failed to acquire lock for request ${requestId}, driver ${driverId}`);
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Request already accepted by another driver",
            }));
          }
          return;
        }
        
        // IMMEDIATELY notify all other drivers that this request is being processed
        // Don't wait for database operation - send cancellation right away
        console.log(`📢 [Server] Immediately broadcasting cancellation to ${rideRequest.notifiedDrivers.length} other drivers...`);
        rideRequest.notifiedDrivers.forEach((notifiedDriverId) => {
          if (notifiedDriverId !== driverId) {
            const otherDriverSocket = driverIdToSocket[notifiedDriverId];
            if (otherDriverSocket && otherDriverSocket.readyState === 1 /* OPEN */) {
              try {
                otherDriverSocket.send(JSON.stringify({
                  type: "rideRequestCancelled",
                  requestId,
                  reason: "Request accepted by another driver",
                }));
                console.log(`✅ [Server] Sent immediate cancellation to driver ${notifiedDriverId}`);
              } catch (err) {
                console.error(`❌ [Server] Failed to notify driver ${notifiedDriverId}:`, err);
              }
            }
          }
        });
        
        // ATOMIC DATABASE OPERATION: Try to create ride atomically
        // Only proceed if we acquired the lock
        // This is the REAL protection - database enforces the rule
        // Only ONE driver can successfully create a ride for this user
        let createdRide = null;
        try {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          
          // Check if ride already exists (very recent only)
          const existingRide = await prisma.rides.findFirst({
            where: {
              userId: userId,
              status: {
                in: ["Accepted", "Processing", "On the way", "Picked up"],
              },
              cratedAt: {
                gte: fiveMinutesAgo,
              },
            },
            orderBy: {
              cratedAt: "desc",
            },
          });

          if (existingRide) {
            // Ride already exists
            if (existingRide.driverId !== driverId) {
              console.log(`❌ [Server] Driver ${driverId} tried to accept, but ride ${existingRide.id} already exists for driver ${existingRide.driverId}`);
              // Mark request as accepted by the other driver
              rideRequest.status = 'accepted';
              rideRequest.acceptedBy = existingRide.driverId;
              
              if (ws.readyState === 1 /* OPEN */) {
                ws.send(JSON.stringify({
                  type: "rideRequestCancelled",
                  requestId,
                  reason: "Request already accepted by another driver",
                }));
              }
              return;
            } else {
              // Same driver - idempotency (allow retry)
              console.log(`ℹ️ [Server] Same driver ${driverId} attempting to accept again, using existing ride (idempotency)`);
              createdRide = existingRide;
            }
          } else {
            // No ride exists - create it atomically
            // Extract ride data from payload or rideRequest
            const rideData = payload || rideRequest.payload;
            const distance = rideData?.distance || rideRequest.payload?.distance || "0";
            const driverRate = rideData?.driver?.rate || rideRequest.payload?.driver?.rate || "0";
            
            // Calculate charge and truncate (drop all decimals)
            const calculateCharge = (dist, rate) => {
              const calculated = parseFloat(dist) * parseFloat(rate);
              return Math.floor(calculated); // Drop all decimals, keep integer part only
            };
            const charge = calculateCharge(distance, driverRate);
            
            console.log(`🔨 [Server] Creating ride atomically for user ${userId} by driver ${driverId}...`, {
              distance,
              driverRate,
              charge,
              hasPayload: !!payload,
              hasRideRequestPayload: !!rideRequest.payload,
            });
            
            try {
              createdRide = await prisma.rides.create({
                data: {
                  userId: userId,
                  driverId: driverId,
                  charge: charge, // Already a number (even integer)
                  status: "Accepted", // Directly accepted - no pending
                  currentLocationName: rideData?.currentLocationName || rideRequest.payload?.currentLocationName || "",
                  destinationLocationName: rideData?.destinationLocationName || rideData?.destinationLocation || rideRequest.payload?.destinationLocationName || rideRequest.payload?.destinationLocation || "",
                  distance: String(distance),
                },
              });
              
              console.log(`✅ [Server] Ride created atomically: ${createdRide.id} for user ${userId} by driver ${driverId}`, {
                rideId: createdRide.id,
                status: createdRide.status,
                userId: createdRide.userId,
                driverId: createdRide.driverId,
              });
            } catch (createError) {
              console.error(`❌ [Server] Failed to create ride:`, createError);
              // Re-throw to be caught by outer try-catch
              throw createError;
            }
          }
          
          // Ensure we have a valid ride before proceeding
          if (!createdRide || !createdRide.id) {
            console.error(`❌ [Server] Created ride is invalid:`, createdRide);
            if (ws.readyState === 1 /* OPEN */) {
              ws.send(JSON.stringify({
                type: "rideRequestCancelled",
                requestId,
                reason: "Failed to create ride. Please try again.",
              }));
            }
            return;
          }
        } catch (dbError) {
          console.error(`❌ [Server] Database error creating ride:`, dbError);
          
          // Release the lock on error
          rideRequest.status = 'pending';
          delete rideRequest.processingBy;
          
          // Check if it's a duplicate error (another driver created it between our check and create)
          if (dbError?.code === 11000 || dbError?.message?.includes("duplicate") || dbError?.message?.includes("E11000")) {
            console.log(`❌ [Server] Duplicate ride detected - another driver already created it`);
            // Mark as accepted by unknown driver
            rideRequest.status = 'accepted';
            rideRequest.acceptedBy = 'unknown';
            
            if (ws.readyState === 1 /* OPEN */) {
              ws.send(JSON.stringify({
                type: "rideRequestCancelled",
                requestId,
                reason: "Request already accepted by another driver",
              }));
            }
            return;
          }
          
          // Other database errors - release lock and reject
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Failed to create ride. Please try again.",
            }));
          }
          return;
        }
        
        // Ensure we have a valid ride before proceeding
        if (!createdRide || !createdRide.id) {
          console.error(`❌ [Server] Created ride is invalid:`, createdRide);
          // Release the lock
          rideRequest.status = 'pending';
          delete rideRequest.processingBy;
          
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Failed to create ride. Please try again.",
            }));
          }
          return;
        }
        
        // SUCCESS: This driver won! Mark request as accepted (upgrade from "processing")
        rideRequest.status = 'accepted';
        rideRequest.acceptedBy = driverId;
        delete rideRequest.processingBy; // Clean up processing flag
        console.log(`✅ [Server] Driver ${driverId} WON the race! Ride ${createdRide.id} created atomically`);
        
        // Convert Prisma object to plain object for JSON serialization
        // Handle null/undefined values safely
        const rideData = {
          id: String(createdRide.id || ''),
          userId: String(createdRide.userId || ''),
          driverId: String(createdRide.driverId || ''),
          charge: createdRide.charge || 0,
          status: String(createdRide.status || 'Accepted'),
          currentLocationName: String(createdRide.currentLocationName || ''),
          destinationLocationName: String(createdRide.destinationLocationName || ''),
          distance: String(createdRide.distance || '0'),
          rating: createdRide.rating || null,
          cratedAt: createdRide.cratedAt ? new Date(createdRide.cratedAt).toISOString() : new Date().toISOString(),
          updatedAt: createdRide.updatedAt ? new Date(createdRide.updatedAt).toISOString() : new Date().toISOString(),
        };
        
        console.log(`📦 [Server] Prepared ride data for WebSocket:`, {
          id: rideData.id,
          status: rideData.status,
          userId: rideData.userId,
          driverId: rideData.driverId,
          hasAllFields: !!(rideData.id && rideData.userId && rideData.driverId),
        });
        
        // Send SUCCESS confirmation to the winning driver with ride data
        if (ws.readyState === 1 /* OPEN */) {
          try {
            // Ensure rideData is valid before sending
            if (!rideData || !rideData.id) {
              console.error(`❌ [Server] Cannot send confirmation - invalid ride data:`, rideData);
              ws.send(JSON.stringify({
                type: "rideRequestCancelled",
                requestId,
                reason: "Failed to create ride. Please try again.",
              }));
              return;
            }
            
            const confirmationMessage = {
              type: "rideAcceptedConfirmation",
              requestId: String(requestId),
              ride: rideData, // Send plain object (not Prisma object)
              message: "Ride accepted successfully! Opening map to pickup location.",
            };
            
            // Log before sending to verify structure
            console.log(`📤 [Server] Sending confirmation message:`, {
              type: confirmationMessage.type,
              requestId: confirmationMessage.requestId,
              hasRide: !!confirmationMessage.ride,
              rideId: confirmationMessage.ride?.id,
              rideStatus: confirmationMessage.ride?.status,
              rideKeys: confirmationMessage.ride ? Object.keys(confirmationMessage.ride) : [],
            });
            
            const messageString = JSON.stringify(confirmationMessage);
            
            // Verify the stringified message contains ride data
            const testParse = JSON.parse(messageString);
            if (!testParse.ride || !testParse.ride.id) {
              console.error(`❌ [Server] Ride data missing in serialized message!`, {
                hasRide: !!testParse.ride,
                messageKeys: Object.keys(testParse),
              });
            }
            
            ws.send(messageString);
            
            // Verify what was sent
            console.log(`✅ [Server] Sent acceptance confirmation to driver ${driverId}`, {
              requestId: testParse.requestId,
              rideId: testParse.ride?.id,
              status: testParse.ride?.status,
              messageLength: messageString.length,
              rideIncluded: !!testParse.ride,
            });
          } catch (err) {
            console.error(`❌ [Server] Failed to send confirmation to driver ${driverId}:`, err);
            console.error(`❌ [Server] Error details:`, {
              message: err.message,
              stack: err.stack,
              rideData: rideData ? { id: rideData.id, status: rideData.status } : null,
            });
            
            // Send cancellation on error
            if (ws.readyState === 1 /* OPEN */) {
              ws.send(JSON.stringify({
                type: "rideRequestCancelled",
                requestId,
                reason: "Failed to send confirmation. Please try again.",
              }));
            }
          }
        } else {
          console.error(`❌ [Server] WebSocket not open, cannot send confirmation to driver ${driverId}`);
        }
        
        // Note: Cancellation was already sent immediately when lock was acquired (line ~330)
        // This ensures other drivers get notified as fast as possible, before database operation completes
        console.log(`✅ [Server] Ride acceptance complete. Cancellation was already sent to other drivers when lock was acquired.`);
        
        // Fetch complete driver information from database to send to user
        let driverInfo = null;
        try {
          const driverData = await prisma.driver.findUnique({
            where: { id: driverId },
            select: {
              id: true,
              name: true,
              phone_number: true,
              email: true,
              avatar: true,
              vehicle_type: true,
              registration_number: true,
              vehicle_color: true,
              rate: true,
              ratings: true,
            },
          });
          
          if (driverData) {
            driverInfo = {
              id: driverData.id,
              name: driverData.name,
              phone_number: driverData.phone_number,
              email: driverData.email,
              avatar: driverData.avatar || null,
              vehicle_type: driverData.vehicle_type,
              registration_number: driverData.registration_number,
              vehicle_color: driverData.vehicle_color || null,
              rate: driverData.rate,
              ratings: driverData.ratings || 0,
            };
            console.log(`✅ [Server] Fetched driver info for user notification:`, {
              driverId: driverInfo.id,
              name: driverInfo.name,
              hasAvatar: !!driverInfo.avatar,
              vehicleType: driverInfo.vehicle_type,
              registrationNumber: driverInfo.registration_number,
            });
          } else {
            console.error(`❌ [Server] Driver ${driverId} not found in database`);
          }
        } catch (driverFetchError) {
          console.error(`❌ [Server] Failed to fetch driver info:`, driverFetchError);
          // Continue anyway - user will get basic info from payload
        }
        
        // Prepare enhanced payload with complete driver information
        const enhancedPayload = {
          ...payload,
          driver: driverInfo || payload.driver || null,
          ride: rideData,
        };
        
        // Forward acceptance to user with complete driver information
        const uSocket = userIdToSocket[userId];
        if (uSocket && uSocket.readyState === 1 /* OPEN */) {
          console.log(`✅ Forwarding driver accept to user ${userId} with driver info`);
          uSocket.send(JSON.stringify({ 
            type: "rideAccepted", 
            payload: enhancedPayload, 
            requestId,
            driver: driverInfo, // Include driver info at top level for easy access
          }));
        } else {
          console.log(`⚠️ Unable to notify user ${userId}: not connected`);
        }
        
        // Fallback: broadcast to all clients; user app will ignore if not matching
        wss.clients.forEach((client) => {
          try {
            if (client.readyState === 1 /* OPEN */) {
              client.send(JSON.stringify({ 
                type: "rideAccepted", 
                payload: enhancedPayload, 
                requestId,
                driver: driverInfo,
              }));
            }
          } catch {}
        });
        
        // Clean up request after a short delay (give time for notifications to be sent)
        setTimeout(() => {
          if (activeRideRequests[requestId]) {
            delete activeRideRequests[requestId];
            console.log(`🗑️ Cleaned up ride request ${requestId}`);
          }
        }, 10000); // 10 seconds
      }
    } catch (error) {
      console.error("❌ Failed to parse WebSocket message:", error);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`🔌 WebSocket connection closed from ${clientIP}. Code: ${code}, Reason: ${reason || 'None'}`);
    if (ws.userId) {
      console.log(`   👤 User ID: ${ws.userId}`);
    }
    if (ws.driverId) {
      console.log(`   🚗 Driver ID: ${ws.driverId}`);
    }
    console.log(`📊 Remaining active connections: ${wss.clients.size}`);
    
    // Update status after disconnect
    const activeDrivers = Object.keys(driverIdToSocket).filter(id => {
      const socket = driverIdToSocket[id];
      return socket && socket.readyState === 1;
    }).length;
    const activeUsers = Object.keys(userIdToSocket).filter(id => {
      const socket = userIdToSocket[id];
      return socket && socket.readyState === 1;
    }).length;
    console.log(`📊 Active drivers: ${activeDrivers}, Active users: ${activeUsers}`);
    
    // Cleanup user mapping if present
    if (ws.userId) {
      if (userIdToSocket[ws.userId] === ws) {
        delete userIdToSocket[ws.userId];
        console.log(`🗑️  Removed user ${ws.userId} from mapping`);
      } else if (userIdToSocket[ws.userId]) {
        console.log(`⚠️  User ${ws.userId} mapping exists but points to different socket (reconnected?)`);
        // Don't delete - the new connection is using it
      }
    }
    
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
      if (driverIdToSocket[driverId] === ws) {
        delete driverIdToSocket[driverId];
        console.log(`🗑️  Removed driver ${driverId} from mapping`);
      } else if (driverIdToSocket[driverId]) {
        console.log(`⚠️  Driver ${driverId} mapping exists but points to different socket (reconnected?)`);
        // Don't delete - the new connection is using it
      }
    }

    // Cleanup user mapping if present
    if (ws.userId) {
      if (userIdToSocket[ws.userId] === ws) {
        delete userIdToSocket[ws.userId];
        console.log(`🗑️  Removed user ${ws.userId} from mapping`);
      } else if (userIdToSocket[ws.userId]) {
        console.log(`⚠️  User ${ws.userId} mapping exists but points to different socket (reconnected?)`);
        // Don't delete - the new connection is using it
      }
    }
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error from ${clientIP}:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: "connected", message: "Welcome to Flashride WebSocket Server" }));
});

const findNearbyDrivers = async (userLat, userLon) => {
  // Filter drivers stored in memory
  // Include both active and recently disconnected drivers (stale but within 30 seconds)
  const allDrivers = Object.entries(drivers);
  console.log(`🔍 Checking ${allDrivers.length} total drivers in memory for nearby matches...`);
  
  // First filter by distance
  const nearbyByDistance = allDrivers
    .filter(([id, location]) => {
      // Skip if location data is invalid
      if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
        console.log(`⚠️ Driver ${id} has invalid location data, skipping`);
        return false;
      }
      
      // Skip stale drivers (disconnected for more than 30 seconds)
      if (location.stale) {
        console.log(`⚠️ Driver ${id} is stale (disconnected), skipping`);
        return false;
      }
      
      const distance = geolib.getDistance(
        { latitude: userLat, longitude: userLon },
        { latitude: location.latitude, longitude: location.longitude }
      );
      const distanceKm = distance / 1000;
      
      // Include drivers within 5km
      const isWithinRange = distance <= 5000; // 5 kilometers
      
      if (isWithinRange) {
        console.log(`   ✓ Driver ${id}: ${distanceKm.toFixed(2)}km away (distance OK)`);
      } else {
        console.log(`   ✗ Driver ${id}: ${distanceKm.toFixed(2)}km away (too far)`);
      }
      
      return isWithinRange;
    })
    .map(([id, location]) => ({ 
      id, 
      latitude: location.latitude, 
      longitude: location.longitude,
      lastUpdate: location.lastUpdate 
    }));
  
  console.log(`📊 Found ${nearbyByDistance.length} drivers within 5km (before status check)`);
  
  // Now verify drivers are active in database and have open WebSocket connections
  const activeNearbyDrivers = [];
  
  for (const driver of nearbyByDistance) {
    try {
      // Check if driver has an open WebSocket connection
      const driverSocket = driverIdToSocket[driver.id];
      if (!driverSocket || driverSocket.readyState !== 1 /* OPEN */) {
        console.log(`   ✗ Driver ${driver.id}: WebSocket not open, skipping`);
        continue;
      }
      
      // Check driver status in database (only if we have Prisma available)
      try {
        const dbDriver = await prisma.driver.findUnique({
          where: { id: driver.id },
          select: { id: true, status: true, accountStatus: true }
        });
        
        if (!dbDriver) {
          console.log(`   ✗ Driver ${driver.id}: Not found in database, skipping`);
          continue;
        }
        
        if (dbDriver.status !== "active") {
          console.log(`   ✗ Driver ${driver.id}: Status is "${dbDriver.status}" (not active), skipping`);
          continue;
        }
        
        if (dbDriver.accountStatus !== "approved") {
          console.log(`   ✗ Driver ${driver.id}: Account status is "${dbDriver.accountStatus}" (not approved), skipping`);
          continue;
        }
        
        console.log(`   ✅ Driver ${driver.id}: Active and approved, INCLUDED`);
        activeNearbyDrivers.push(driver);
      } catch (dbError) {
        // If database check fails, still include driver if WebSocket is open (fallback)
        console.warn(`   ⚠️ Driver ${driver.id}: Database check failed, but WebSocket is open - including anyway:`, dbError.message);
        activeNearbyDrivers.push(driver);
      }
    } catch (error) {
      console.error(`   ❌ Error checking driver ${driver.id}:`, error);
    }
  }
  
  console.log(`📊 Found ${activeNearbyDrivers.length} active drivers within 5km out of ${nearbyByDistance.length} nearby drivers`);
  return activeNearbyDrivers;
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

// Add command to manually display status (for debugging)
// You can trigger this by sending SIGUSR1 signal: kill -USR1 <pid>
// On Windows, you can use: node -e "process.kill(<pid>, 'SIGUSR1')"
if (process.platform !== 'win32') {
  process.on('SIGUSR1', () => {
    console.log('\n📊 Manual status request received...');
    displayServerStatus();
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  displayServerStatus(); // Show final status before shutdown
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  displayServerStatus(); // Show final status before shutdown
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});
