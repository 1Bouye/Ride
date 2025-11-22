# Fix Prisma Generation on Windows
# This script handles the EPERM error when generating Prisma client on Windows

Write-Host "🔧 Fixing Prisma generation issue..." -ForegroundColor Cyan

# Step 1: Kill any Node processes that might be locking the file
Write-Host "`n📋 Checking for running Node processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "⚠️  Found $($nodeProcesses.Count) Node process(es). Stopping them..." -ForegroundColor Yellow
    $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    Write-Host "✅ No Node processes found" -ForegroundColor Green
}

# Step 2: Remove the .prisma folder
Write-Host "`n🗑️  Removing .prisma folder..." -ForegroundColor Yellow
$prismaPath = "node_modules\.prisma"
if (Test-Path $prismaPath) {
    try {
        Remove-Item -Recurse -Force $prismaPath -ErrorAction Stop
        Write-Host "✅ Removed .prisma folder" -ForegroundColor Green
    } catch {
        Write-Host "❌ Could not remove .prisma folder: $_" -ForegroundColor Red
        Write-Host "`n💡 Try these solutions:" -ForegroundColor Cyan
        Write-Host "   1. Close all terminals and IDEs (VS Code, etc.)" -ForegroundColor White
        Write-Host "   2. Run PowerShell as Administrator" -ForegroundColor White
        Write-Host "   3. Temporarily disable antivirus/Windows Defender" -ForegroundColor White
        Write-Host "   4. Manually delete: $((Get-Location).Path)\$prismaPath" -ForegroundColor White
        exit 1
    }
} else {
    Write-Host "✅ .prisma folder doesn't exist" -ForegroundColor Green
}

# Step 3: Generate Prisma client
Write-Host "`n⚙️  Generating Prisma client..." -ForegroundColor Yellow
try {
    npx prisma generate
    Write-Host "`n✅ Prisma client generated successfully!" -ForegroundColor Green
} catch {
    Write-Host "`n❌ Prisma generation failed: $_" -ForegroundColor Red
    Write-Host "`n💡 If you still see EPERM error:" -ForegroundColor Cyan
    Write-Host "   1. Restart your computer" -ForegroundColor White
    Write-Host "   2. Run this script as Administrator" -ForegroundColor White
    Write-Host "   3. Add an exception in Windows Defender for this folder" -ForegroundColor White
    exit 1
}

