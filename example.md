/* 
EXAMPLE — COMPLETE SOLUTION FOR “FIRST DRIVER WINS” USING PURE WEBSOCKETS

This example shows you (the developer) exactly how to build an Uber-style 
ride acceptance system using ONLY WebSocket (no Socket.IO) with:

- React Native (WebSocket client)
- Node.js + ws library (WebSocket server)
- MongoDB (atomic update)

The goal: 
Only the FIRST driver who accepts a ride gets it.
All other drivers must be rejected and must remove the request.

IMPORTANT:
WebSocket alone cannot protect you.  
The database must enforce the rule using an atomic update:
Ride.findOneAndUpdate({ pending }, { accepted })

This guarantees:
- First driver wins
- Others fail automatically
*/

/* ===========================
   NODE.JS WEBSOCKET SERVER
   =========================== */

const WebSocket = require("ws");
const mongoose = require("mongoose");

// === MongoDB Ride Model ===
const RideSchema = new mongoose.Schema({
  pickup: Object,
  destination: Object,
  status: { type: String, default: "pending" },
  assignedDriver: { type: String, default: null }
});
const Ride = mongoose.model("Ride", RideSchema);

const wss = new WebSocket.Server({ port: 8080 });

// Store driver sockets
const driverSockets = new Map();

wss.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw);

    // Driver registers itself
    if (msg.type === "register_driver") {
      driverSockets.set(msg.driverId, ws);
      return;
    }

    // Driver tries to accept a ride
    if (msg.type === "accept_ride") {
      const { rideId, driverId } = msg;

      // ATOMIC UPDATE — first driver wins
      const ride = await Ride.findOneAndUpdate(
        {
          _id: rideId,
          status: "pending",
          assignedDriver: null
        },
        {
          status: "accepted",
          assignedDriver: driverId
        },
        { new: true }
      );

      // If update failed → someone already accepted
      if (!ride) {
        ws.send(JSON.stringify({
          type: "ride_failed",
          rideId
        }));
        return;
      }

      // SUCCESS → this driver gets the ride
      ws.send(JSON.stringify({
        type: "ride_accepted",
        ride
      }));

      // Notify all other drivers to remove ride request
      for (const [id, socket] of driverSockets.entries()) {
        if (id !== driverId && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "ride_taken",
            rideId
          }));
        }
      }
    }
  });
});


/* ===========================
   REACT NATIVE DRIVER CLIENT
   =========================== */

import React, { useEffect, useRef } from "react";
import { View, Text, Button } from "react-native";

export default function DriverScreen() {
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket("ws://YOUR_SERVER_IP:8080");

    ws.current.onopen = () => {
      // Register driver
      ws.current.send(JSON.stringify({
        type: "register_driver",
        driverId: "driver123"
      }));
    };

    ws.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "ride_taken") {
        console.log("Another driver accepted this ride. Remove it from UI.");
      }

      if (msg.type === "ride_accepted") {
        console.log("You accepted the ride successfully!");
      }

      if (msg.type === "ride_failed") {
        console.log("Ride already taken by another driver.");
      }
    };
  }, []);

  const acceptRide = () => {
    ws.current.send(JSON.stringify({
      type: "accept_ride",
      rideId: "abc123",
      driverId: "driver123"
    }));
  };

  return (
    <View>
      <Text>Driver App</Text>
      <Button title="Accept Ride" onPress={acceptRide} />
    </View>
  );
}


/* ===========================
   IMPORTANT NOTES FOR YOU
   ===========================

1. The ATOMIC MongoDB update is the real protection.
   Without it, two drivers CAN accept the same ride.

2. WebSocket only sends:
   - "ride_accepted" to the winner
   - "ride_failed" to drivers who tried too late
   - "ride_taken" to remove the ride from others

3. Every driver must listen for "ride_taken" to hide the ride request.

4. The example is complete. You can copy/paste this entire block and send it 
   directly to another developer.

*/