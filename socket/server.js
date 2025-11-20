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
// Track active ride requests: { requestId: { userId, status: 'pending'|'accepted', notifiedDrivers: [driverIds], acceptedBy: driverId, payload: {...}, createdAt: timestamp } }
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
        
        const nearbyDrivers = findNearbyDrivers(data.latitude, data.longitude);
        console.log(`👥 Found ${nearbyDrivers.length} nearby drivers (within 5km)`);
        
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

      // Driver accepted ride: forward to that user if online
      if (data.type === "driverAccept" && data.role === "driver") {
        const { userId, payload, requestId } = data;
        const driverId = data.driverId || ws.driverId;
        
        if (!requestId) {
          console.error(`❌ Driver accept missing requestId`);
          return;
        }
        
        // Check if request exists and is still pending (race condition prevention)
        const rideRequest = activeRideRequests[requestId];
        if (!rideRequest) {
          console.log(`⚠️ Ride request ${requestId} not found or already processed`);
          // Notify driver that request is no longer available
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Request already accepted by another driver",
            }));
          }
          return;
        }
        
        if (rideRequest.status !== 'pending') {
          console.log(`⚠️ Ride request ${requestId} already accepted by driver ${rideRequest.acceptedBy}`);
          // Notify driver that request is no longer available
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify({
              type: "rideRequestCancelled",
              requestId,
              reason: "Request already accepted by another driver",
            }));
          }
          return;
        }
        
        // Mark request as accepted (atomic operation - first driver wins)
        rideRequest.status = 'accepted';
        rideRequest.acceptedBy = driverId;
        console.log(`✅ Driver ${driverId} accepted ride request ${requestId}`);
        
        // Send confirmation to the accepting driver FIRST (before notifying others)
        if (ws.readyState === 1 /* OPEN */) {
          try {
            ws.send(JSON.stringify({
              type: "rideAcceptedConfirmation",
              requestId,
              message: "Ride request accepted successfully. You can proceed to create the ride.",
            }));
            console.log(`✅ Sent acceptance confirmation to driver ${driverId} for request ${requestId}`);
          } catch (err) {
            console.error(`❌ Failed to send confirmation to driver ${driverId}:`, err);
          }
        }
        
        // Notify all other drivers that this request is no longer available
        console.log(`📢 Broadcasting cancellation to ${rideRequest.notifiedDrivers.length} other drivers...`);
        let cancellationSent = 0;
        let cancellationFailed = 0;
        
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
                cancellationSent++;
                console.log(`✅ Sent cancellation to driver ${notifiedDriverId} for request ${requestId}`);
              } catch (err) {
                cancellationFailed++;
                console.error(`❌ Failed to notify driver ${notifiedDriverId}:`, err);
              }
            } else {
              cancellationFailed++;
              const reason = !otherDriverSocket ? "no socket" : `socket state ${otherDriverSocket.readyState}`;
              console.log(`⚠️ Driver ${notifiedDriverId} not available (${reason}), cannot send cancellation`);
            }
          }
        });
        
        console.log(`📊 Cancellation summary: ${cancellationSent} sent, ${cancellationFailed} failed`);
        
        // Forward acceptance to user
        const uSocket = userIdToSocket[userId];
        if (uSocket && uSocket.readyState === 1 /* OPEN */) {
          console.log(`✅ Forwarding driver accept to user ${userId}`);
          uSocket.send(JSON.stringify({ type: "rideAccepted", payload, requestId }));
        } else {
          console.log(`⚠️ Unable to notify user ${userId}: not connected`);
        }
        
        // Fallback: broadcast to all clients; user app will ignore if not matching
        wss.clients.forEach((client) => {
          try {
            if (client.readyState === 1 /* OPEN */) {
              client.send(JSON.stringify({ type: "rideAccepted", payload, requestId }));
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
  const allDrivers = Object.entries(drivers);
  console.log(`🔍 Checking ${allDrivers.length} total drivers in memory for nearby matches...`);
  
  const nearby = allDrivers
    .filter(([id, location]) => {
      // Skip if location data is invalid
      if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
        console.log(`⚠️ Driver ${id} has invalid location data, skipping`);
        return false;
      }
      
      const distance = geolib.getDistance(
        { latitude: userLat, longitude: userLon },
        { latitude: location.latitude, longitude: location.longitude }
      );
      const distanceKm = distance / 1000;
      
      // Include drivers within 5km, whether active or recently disconnected (but not stale for too long)
      const isWithinRange = distance <= 5000; // 5 kilometers
      
      if (isWithinRange) {
        console.log(`   ✓ Driver ${id}: ${distanceKm.toFixed(2)}km away (INCLUDED)`);
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
  
  console.log(`📊 Found ${nearby.length} drivers within 5km out of ${allDrivers.length} total drivers`);
  return nearby;
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
