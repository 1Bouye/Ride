# MongoDB Atlas Connection Troubleshooting Guide

## 🔴 Current Error

You're experiencing this error:
```
Server selection timeout: No available servers
ReplicaSetNoPrimary
fatal alert: InternalError
```

This indicates your application cannot connect to MongoDB Atlas.

---

## ✅ Quick Fixes (Try These First)

### 1. **Check MongoDB Atlas Cluster Status**
- Go to [MongoDB Atlas Dashboard](https://cloud.mongodb.com)
- Check if your cluster is **paused** (free tier clusters auto-pause after inactivity)
- If paused, click **"Resume"** and wait 2-3 minutes

### 2. **Verify IP Whitelist**
- In MongoDB Atlas: **Network Access** → **IP Access List**
- Ensure your current IP address is whitelisted
- For development, you can temporarily add `0.0.0.0/0` (allows all IPs - **only for testing!**)
- Click **"Add IP Address"** if needed

### 3. **Check Connection String**
- In MongoDB Atlas: **Database** → **Connect** → **Connect your application**
- Verify your `DATABASE_URL` in `.env` matches the connection string
- Ensure the connection string includes:
  - Correct username and password
  - Correct cluster name
  - `?retryWrites=true&w=majority` at the end

### 4. **Verify Database User**
- In MongoDB Atlas: **Database Access** → Check your database user exists
- Ensure the user has proper permissions
- Try resetting the password if needed

---

## 🔧 Connection String Format

Your `DATABASE_URL` should look like:
```
mongodb+srv://<username>:<password>@cluster-name.xxxxx.mongodb.net/<database-name>?retryWrites=true&w=majority
```

**Common Issues:**
- ❌ Special characters in password not URL-encoded (use `%40` for `@`, `%23` for `#`, etc.)
- ❌ Missing `?retryWrites=true&w=majority` at the end
- ❌ Wrong cluster name or database name

---

## 🛠️ Advanced Troubleshooting

### Test Connection Manually

1. **Using MongoDB Compass:**
   - Download [MongoDB Compass](https://www.mongodb.com/products/compass)
   - Try connecting with your connection string
   - If it fails, the issue is with the connection string or network

2. **Using Node.js:**
```bash
node -e "require('mongodb').MongoClient.connect(process.env.DATABASE_URL).then(() => console.log('Connected!')).catch(e => console.error('Failed:', e))"
```

### Network Issues

- **Firewall/VPN:** Disable VPN or firewall temporarily to test
- **Corporate Network:** Some corporate networks block MongoDB Atlas
- **ISP Issues:** Try from a different network (mobile hotspot)

### SSL/TLS Issues

If you see SSL errors:
- Ensure your connection string uses `mongodb+srv://` (not `mongodb://`)
- Check if your system time is correct (SSL certificates are time-sensitive)
- Try adding `&tls=true` to connection string

---

## 📝 Code Improvements Made

The code has been updated with:

1. **Automatic Retry Logic:** Database operations will retry up to 3 times on connection errors
2. **Better Error Messages:** Distinguishes between connection errors and other database errors
3. **Connection Testing:** Tests connection on startup with helpful error messages
4. **Graceful Degradation:** Returns appropriate HTTP status codes (503 for connection issues)

---

## 🚨 Still Not Working?

If none of the above fixes work:

1. **Create a New Cluster:**
   - Sometimes clusters get into a bad state
   - Create a new free tier cluster and update your connection string

2. **Check MongoDB Atlas Status:**
   - Visit [MongoDB Atlas Status Page](https://status.mongodb.com)
   - Check if there are any ongoing incidents

3. **Contact Support:**
   - MongoDB Atlas has community support forums
   - Check error logs in MongoDB Atlas dashboard

---

## ✅ Verification

Once fixed, you should see:
```
[Prisma] ✅ Database connection established
```

Instead of connection errors.

