# AutoDash Sync Script
# Monitors for changes in __auto-dash and syncs to remote devices via SCP

$SourceDir = "d:\__GITHUB\__auto-dash"
$Remotes = @(
    "owner@192.168.1.230:/var/www/html/",
    "dietpi@192.168.1.97:/var/www/html/"
)

# Initial Sync function
function Sync-Files {
    param($File)
    foreach ($Remote in $Remotes) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Syncing $File to $Remote..." -ForegroundColor Cyan
        try {
            scp -o ConnectTimeout=5 "$SourceDir\$File" "$Remote"
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✔ Success" -ForegroundColor Green
            } else {
                Write-Host "  ✘ Failed (Exit Code: $LASTEXITCODE)" -ForegroundColor Red
            }
        } catch {
            Write-Host "  ✘ Error: $_" -ForegroundColor Red
        }
    }
}

# Watcher setup
$Watcher = New-Object System.IO.FileSystemWatcher
$Watcher.Path = $SourceDir
$Watcher.Filter = "*.html"
$Watcher.IncludeSubdirectories = $false
$Watcher.EnableRaisingEvents = $true

$Action = {
    $Path = $Event.SourceEventArgs.FullPath
    $Name = $Event.SourceEventArgs.Name
    $ChangeType = $Event.SourceEventArgs.ChangeType
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $ChangeType detected: $Name" -ForegroundColor Yellow
    
    # Simple debounce to prevent double-sync on rapid saves
    Start-Sleep -Milliseconds 500
    Sync-Files -File $Name
}

# Register events
Register-ObjectEvent $Watcher "Changed" -Action $Action
Register-ObjectEvent $Watcher "Created" -Action $Action

Write-Host "--- AutoDash Sync Active ---" -ForegroundColor Green
Write-Host "Watching: $SourceDir"
Write-Host "Targets: $($Remotes -join ', ')"
Write-Host "Press Ctrl+C to stop."

# Loop to keep script alive
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    $Watcher.EnableRaisingEvents = $false
    $Watcher.Dispose()
    Unregister-Event -SourceIdentifier *
    Write-Host "--- Sync Stopped ---" -ForegroundColor Yellow
}
