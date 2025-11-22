# Prisma Generate Script
# This script stops Node.js processes, generates Prisma, and optionally restarts servers

param(
    [switch]$RestartServers
)

Write-Host "`n=== Prisma Generate Script ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop Node.js processes
Write-Host "Step 1: Stopping Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -notlike "*cursor*" -and 
    $_.Path -notlike "*Code*" -and
    $_.Path -notlike "*Visual Studio*"
}

if ($nodeProcesses) {
    $nodeProcesses | ForEach-Object {
        Write-Host "  Stopping process $($_.Id) ($($_.ProcessName))..." -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  Stopped $($nodeProcesses.Count) process(es)" -ForegroundColor Green
} else {
    Write-Host "  No Node.js processes found" -ForegroundColor Gray
}

# Step 2: Wait for file locks to release
Write-Host "`nStep 2: Waiting for file locks to release..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Step 3: Generate Prisma
Write-Host "`nStep 3: Generating Prisma client..." -ForegroundColor Yellow
try {
    npx prisma generate
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Prisma client generated successfully!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ Prisma generation failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "`n❌ Error generating Prisma: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Restart servers if requested
if ($RestartServers) {
    Write-Host "`nStep 4: Restarting servers..." -ForegroundColor Yellow
    
    # Start HTTP server
    Write-Host "  Starting HTTP server..." -ForegroundColor Gray
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" -WindowStyle Minimized
    
    # Start WebSocket server
    Write-Host "  Starting WebSocket server..." -ForegroundColor Gray
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\socket'; npm run dev" -WindowStyle Minimized
    
    Write-Host "`n✅ Servers restarted!" -ForegroundColor Green
    Write-Host "  HTTP Server: http://localhost:4000" -ForegroundColor Cyan
    Write-Host "  WebSocket Server: ws://localhost:8080" -ForegroundColor Cyan
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
Write-Host ""

