# Fixing Prisma EPERM Error on Windows

## 🔴 Error

```
EPERM: operation not permitted, rename 'query_engine-windows.dll.node.tmp...' -> 'query_engine-windows.dll.node'
```

This is a common Windows issue where the Prisma query engine file is locked.

---

## ✅ Quick Fixes (Try in Order)

### Solution 1: Use the Fix Script (Recommended)

```powershell
npm run prisma:fix
```

This script will:
- Stop any running Node processes
- Remove the locked `.prisma` folder
- Regenerate Prisma client

---

### Solution 2: Manual Steps

1. **Stop all Node processes:**
   ```powershell
   Get-Process -Name "node" | Stop-Process -Force
   ```

2. **Close all terminals and IDEs** (VS Code, WebStorm, etc.)

3. **Delete the .prisma folder:**
   ```powershell
   Remove-Item -Recurse -Force "node_modules\.prisma"
   ```

4. **Regenerate:**
   ```powershell
   npx prisma generate
   ```

---

### Solution 3: Run as Administrator

1. **Right-click PowerShell** → **Run as Administrator**
2. Navigate to your project:
   ```powershell
   cd C:\Users\dell\Desktop\fffffff\Ridewave\server
   ```
3. Run the fix script:
   ```powershell
   npm run prisma:fix
   ```

---

### Solution 4: Disable Antivirus Temporarily

Windows Defender or other antivirus software may be locking the file:

1. **Temporarily disable Windows Defender:**
   - Open Windows Security
   - Virus & threat protection → Manage settings
   - Turn off "Real-time protection" temporarily

2. **Or add an exception:**
   - Windows Security → Virus & threat protection → Manage settings
   - Exclusions → Add or remove exclusions
   - Add folder: `C:\Users\dell\Desktop\fffffff\Ridewave\server\node_modules\.prisma`

3. **Try generating again:**
   ```powershell
   npx prisma generate
   ```

---

### Solution 5: Restart Computer

Sometimes Windows keeps files locked even after processes are closed:

1. **Save all your work**
2. **Restart your computer**
3. **After restart, run:**
   ```powershell
   cd Ridewave/server
   npm run prisma:fix
   ```

---

### Solution 6: Use WSL (Windows Subsystem for Linux)

If you have WSL installed, you can generate Prisma from there:

```bash
cd /mnt/c/Users/dell/Desktop/fffffff/Ridewave/server
npx prisma generate
```

This avoids Windows file locking issues entirely.

---

## 🔧 Prevention

To avoid this issue in the future:

1. **Always stop the server** before running `prisma generate`:
   ```powershell
   # Press Ctrl+C to stop the server first
   ```

2. **Use the fix script** when you encounter the error:
   ```powershell
   npm run prisma:fix
   ```

3. **Add antivirus exception** for the `.prisma` folder

4. **Use WSL** for development if possible

---

## 📝 Available Scripts

After adding the scripts to `package.json`, you can use:

- `npm run prisma:generate` - Generate Prisma client (normal)
- `npm run prisma:fix` - Fix and generate (handles Windows issues)

---

## 🚨 Still Not Working?

If none of the above work:

1. **Check what's locking the file:**
   - Download [Process Explorer](https://docs.microsoft.com/en-us/sysinternals/downloads/process-explorer)
   - Find the process locking `query_engine-windows.dll.node`
   - Kill that process

2. **Check file permissions:**
   ```powershell
   icacls "node_modules\.prisma\client\query_engine-windows.dll.node"
   ```

3. **Try deleting manually:**
   - Close all programs
   - Navigate to `node_modules\.prisma\client\`
   - Try deleting `query_engine-windows.dll.node` manually
   - If it says "in use", restart your computer

4. **Reinstall Prisma:**
   ```powershell
   npm uninstall prisma @prisma/client
   npm install prisma @prisma/client --save-dev
   npx prisma generate
   ```

---

## ✅ Verification

After successful generation, you should see:

```
✔ Generated Prisma Client (5.19.2) to .\node_modules\@prisma\client in XXXms
```

And the file should exist at:
```
node_modules\.prisma\client\query_engine-windows.dll.node
```

