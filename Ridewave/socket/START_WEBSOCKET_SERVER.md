# How to Start the WebSocket Server

## Quick Start

1. **Open a new terminal/command prompt**

2. **Navigate to the socket directory:**
   ```bash
   cd Ridewave/socket
   ```

3. **Install dependencies (if not already installed):**
   ```bash
   npm install
   ```

4. **Start the WebSocket server:**
   ```bash
   npm start
   ```

   Or directly:
   ```bash
   node server.js
   ```

5. **You should see:**
   ```
   🚀 WebSocket Server starting on ws://0.0.0.0:8080
   📡 Listening for connections from network...
   ✅ WebSocket Server is running on port 8080
   🌐 Accepting connections from: ws://localhost:8080 or ws://YOUR_IP:8080
   ```

## Keep the Server Running

**IMPORTANT:** Keep this terminal window open while testing your app. The WebSocket server must be running for the app to connect.

## Troubleshooting

### Port Already in Use
If you see an error like "Port 8080 is already in use":
- Find and close the process using port 8080
- Or change the port in `server.js` (line 7: `const WS_PORT = 8080;`)

### Firewall Issues
If connections are being blocked:
- Windows: Allow Node.js through Windows Firewall
- Make sure port 8080 is not blocked by your firewall

### Connection Still Failing
1. Make sure the server is running (check the terminal output)
2. Verify your IP address matches `EXPO_PUBLIC_WEBSOCKET_URL` in `.env`
3. For Android emulator, the code automatically uses `10.0.2.2:8080`
4. For physical devices, use your computer's local IP address

## Running in Background (Optional)

### Windows (PowerShell):
```powershell
Start-Process node -ArgumentList "server.js" -WindowStyle Hidden
```

### macOS/Linux:
```bash
nohup node server.js > websocket.log 2>&1 &
```

## Check if Server is Running

You can test the WebSocket server by opening:
```
ws://localhost:8080
```
in a WebSocket client tool, or check the terminal for connection logs.

