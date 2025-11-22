# Network Error Troubleshooting Guide

## 🔴 Current Error

You're seeing this error in your React Native app:
```
[AxiosError: Network Error]
ERR_NETWORK
```

This means your mobile app cannot connect to your backend server.

---

## ✅ Quick Fixes (Try These First)

### 1. **Check if Server is Running**

Make sure your backend server is running:

```bash
cd Ridewave/server
npm start
# or
npm run dev
```

You should see something like:
```
Server running on port 3000
```

---

### 2. **Verify EXPO_PUBLIC_SERVER_URI is Set**

Check your `.env` file in `Ridewave/driver/`:

```env
EXPO_PUBLIC_SERVER_URI=http://your-server-url:3000
```

**Common Issues:**
- ❌ Variable not set at all
- ❌ Using `localhost` or `127.0.0.1` (doesn't work on physical devices)
- ❌ Missing `http://` or `https://` prefix
- ❌ Wrong port number

---

### 3. **Fix localhost Issue (Physical Devices)**

If you're testing on a **physical device** (phone), `localhost` won't work. You need to use your computer's **LAN IP address**.

#### Find Your Computer's IP Address:

**Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your active network adapter
# Example: 192.168.1.100
```

**Mac/Linux:**
```bash
ifconfig | grep "inet "
# Look for IP starting with 192.168.x.x or 10.x.x.x
```

#### Update .env:
```env
# ❌ WRONG (won't work on physical device)
EXPO_PUBLIC_SERVER_URI=http://localhost:3000

# ✅ CORRECT (use your computer's IP)
EXPO_PUBLIC_SERVER_URI=http://192.168.1.100:3000
```

**Important:** Make sure your phone and computer are on the **same Wi-Fi network**.

---

### 4. **For Android Emulator**

If using Android emulator, you can use:
```env
EXPO_PUBLIC_SERVER_URI=http://10.0.2.2:3000
```

`10.0.2.2` is a special IP that Android emulator uses to access the host machine's localhost.

---

### 5. **Restart Expo After Changing .env**

After updating `.env`, you **must** restart Expo:

```bash
# Stop Expo (Ctrl+C)
# Then restart with cache clear
npx expo start --clear
```

Environment variables are loaded at startup, so changes won't take effect until you restart.

---

## 🔧 Advanced Troubleshooting

### Test Server Connection Manually

1. **From your computer's browser:**
   ```
   http://localhost:3000/driver/me
   ```
   (You'll get 401, but that means server is running)

2. **From your phone's browser (same Wi-Fi):**
   ```
   http://192.168.1.100:3000/driver/me
   ```
   (Replace with your computer's IP)

If this doesn't work, check:
- Server is actually running
- Firewall isn't blocking port 3000
- Phone and computer are on same network

---

### Check Server Logs

Look at your server console for errors:
- Connection attempts should appear in logs
- If nothing appears, the request isn't reaching the server

---

### Network Configuration Checklist

- [ ] Server is running (`npm start` in `Ridewave/server`)
- [ ] `.env` file exists in `Ridewave/driver/`
- [ ] `EXPO_PUBLIC_SERVER_URI` is set correctly
- [ ] Not using `localhost` on physical device
- [ ] Phone and computer on same Wi-Fi network
- [ ] Firewall allows connections on port 3000
- [ ] Expo restarted after `.env` changes

---

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ERR_NETWORK` | Can't reach server | Check server is running, URL is correct |
| `ECONNREFUSED` | Server not running | Start server with `npm start` |
| `ETIMEDOUT` | Server too slow or unreachable | Check network, increase timeout |
| `ENOTFOUND` | Invalid URL | Check `EXPO_PUBLIC_SERVER_URI` format |

---

## 🚨 Still Not Working?

### Option 1: Use ngrok (For Testing)

If you need to test from anywhere (not just same network):

1. **Install ngrok:**
   ```bash
   npm install -g ngrok
   ```

2. **Start your server:**
   ```bash
   cd Ridewave/server
   npm start
   ```

3. **In another terminal, start ngrok:**
   ```bash
   ngrok http 3000
   ```

4. **Copy the ngrok URL** (e.g., `https://abc123.ngrok.io`)

5. **Update .env:**
   ```env
   EXPO_PUBLIC_SERVER_URI=https://abc123.ngrok.io
   ```

6. **Restart Expo**

---

### Option 2: Check CORS Settings

If server is running but still getting errors, check CORS in your server:

```typescript
// server/app.ts or server.ts
app.use(cors({
  origin: '*', // For development only
  credentials: true
}));
```

---

### Option 3: Verify Environment Variables

Add this to your app to debug:

```typescript
console.log('Server URI:', process.env.EXPO_PUBLIC_SERVER_URI);
```

If it shows `undefined`, the variable isn't being loaded.

---

## ✅ Verification

Once fixed, you should see:
- No network errors in console
- API calls succeed
- Driver data loads
- WebSocket connects successfully

---

## 📝 Code Improvements Made

The code has been updated with:

1. **Automatic Retry Logic:** Network requests retry up to 3 times
2. **Better Error Messages:** Clear diagnostics about what's wrong
3. **Server URI Validation:** Checks for common configuration mistakes
4. **Timeout Handling:** Increased timeout to 15 seconds
5. **Error Categorization:** Distinguishes network errors from other errors

---

## 💡 Pro Tips

1. **Use a static IP** for your development machine (or use ngrok)
2. **Keep server running** while developing
3. **Check server logs** when debugging network issues
4. **Test with Postman/curl** first to verify server works
5. **Use environment-specific configs** (dev vs production)

