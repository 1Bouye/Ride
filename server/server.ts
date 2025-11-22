import http from "http";
import { app } from "./app";
const server = http.createServer(app);

// Get port from environment or default to 4000
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all interfaces to accept network connections

// create server - bind to 0.0.0.0 to accept connections from any network interface
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server is running on http://${HOST}:${PORT}`);
  console.log(`📡 Server is accessible from network at http://YOUR_IP:${PORT}`);
  console.log(`🌐 Local access: http://localhost:${PORT}`);
});
