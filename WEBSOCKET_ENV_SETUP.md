# WebSocket Environment Variable Setup

## Where to Add `EXPO_PUBLIC_WEBSOCKET_URL`

Add the WebSocket URL to the `.env` file in each app directory:

### 1. User App
**File location:** `Ridewave/user/.env`

Add this line to your existing `.env` file:
```env
EXPO_PUBLIC_WEBSOCKET_URL=ws://YOUR_IP:8080
```

**Example:**
```env
EXPO_PUBLIC_WEBSOCKET_URL=ws://192.168.43.219:8080
```

### 2. Driver App
**File location:** `Ridewave/driver/.env`

If the file doesn't exist, create it. Then add:
```env
EXPO_PUBLIC_WEBSOCKET_URL=ws://YOUR_IP:8080
```

**Example:**
```env
EXPO_PUBLIC_WEBSOCKET_URL=ws://192.168.43.219:8080
```

## How to Find Your IP Address

### Windows:
1. Open Command Prompt or PowerShell
2. Run: `ipconfig`
3. Look for "IPv4 Address" under your active network adapter (usually `192.168.x.x` or `10.x.x.x`)

### macOS/Linux:
1. Open Terminal
2. Run: `ifconfig` or `ip addr`
3. Look for your local network IP address

## Important Notes

1. **Replace `YOUR_IP`** with your actual local network IP address (the same IP used in `EXPO_PUBLIC_SERVER_URI`)

2. **For Android Emulator:** The code automatically uses `10.0.2.2:8080` when running in an emulator, so you don't need to change anything for emulator testing.

3. **For Physical Devices:** Use your computer's local network IP address (e.g., `192.168.43.219:8080`)

4. **After adding the variable:**
   - Restart your Expo development server
   - Clear cache: `npx expo start --clear`

## Example Complete .env File (User App)

```env
EXPO_PUBLIC_SERVER_URI=http://192.168.43.219:4000/api/v1
EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY=AIzaSyCVw0ihvlljHcLYjuGAJvI7965lOM5Qmks
EXPO_GOOGLE_MAPS_ANDROID_KEY=AIzaSyCvW0ihvIjjHcLJyuGAJvI7965lOM5Qmks
EXPO_GOOGLE_MAPS_IOS_KEY=AIzaSyCvW0ihvIjjHcLJyuGAJvI7965lOM5Qmks

EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=1079236247674-b6ip8b3u4dfs7mgeattpavotfbptkoad.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1079236247674-cpter6idrlgmtbo4tt7giu715r0q44o8.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=1079236247674-pofkgu9ipal5sck3ltf8bf2eaucsline.apps.googleusercontent.com

# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://agdsaednqpvegcgtnrxk.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# WebSocket Configuration
EXPO_PUBLIC_WEBSOCKET_URL=ws://192.168.43.219:8080
```

## Troubleshooting

- **WebSocket still not connecting?** Make sure your WebSocket server is running on port 8080
- **Connection refused?** Check that your firewall allows connections on port 8080
- **Still using wrong IP?** Restart Expo with `--clear` flag: `npx expo start --clear`

