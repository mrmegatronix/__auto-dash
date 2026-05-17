# AutoDash Sync Script
# Monitors for changes in __auto-dash and syncs to remote devices via SCP/PSCP

$SourceDir = "d:\__GITHUB\__auto-dash"
$Remotes = @(
    [PSCustomObject]@{
        Target   = "owner@192.168.1.230:/var/www/html/"
        Type     = "pscp"
        Password = "123qaz"
        HostKey  = "SHA256:29K297dlhwRARDvtdEvvvf06sgOYgLiIud+AWhoowAY"
    },
    [PSCustomObject]@{
        Target   = "dietpi@192.168.1.97:/var/www/html/"
        Type     = "scp"
    }
)

# Initial Sync function
function Sync-Files {
    param($File)
    foreach ($Remote in $Remotes) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Syncing $File to $($Remote.Target)..." -ForegroundColor Cyan
        try {
            if ($Remote.Type -eq "pscp") {
                # Use PuTTY Secure Copy with password and hostkey
                $args = @()
                if ($Remote.Password) {
                    $args += @("-pw", $Remote.Password)
                }
                $args += @("-batch")
                if ($Remote.HostKey) {
                    $args += @("-hostkey", $Remote.HostKey)
                }
                $args += @("$SourceDir\$File", $Remote.Target)
                
                & pscp.exe $args
            } else {
                # Use standard OpenSSH SCP
                scp -q -o ConnectTimeout=5 -o BatchMode=yes "$SourceDir\$File" "$($Remote.Target)"
            }

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
$Watcher.Filter = "*.*" # Watch all files (HTML, CSV, JSON)
$Watcher.IncludeSubdirectories = $false
$Watcher.EnableRaisingEvents = $true

$Action = {
    $Path = $Event.SourceEventArgs.FullPath
    $Name = $Event.SourceEventArgs.Name
    $ChangeType = $Event.SourceEventArgs.ChangeType
    
    # Only sync relevant web files
    if ($Name -match "\.(html|csv|json|css|js)$") {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $ChangeType detected: $Name" -ForegroundColor Yellow
        Start-Sleep -Milliseconds 500
        Sync-Files -File $Name
    }
}

# Register events
$ChangedEvent = Register-ObjectEvent $Watcher "Changed" -Action $Action
$CreatedEvent = Register-ObjectEvent $Watcher "Created" -Action $Action

Write-Host "--- AutoDash Sync Active ---" -ForegroundColor Green
Write-Host "Watching: $SourceDir"
Write-Host "Targets: $(($Remotes | ForEach-Object { $_.Target }) -join ', ')"
Write-Host "Syncing all current files now..." -ForegroundColor Gray

# Initial full sync
$Files = Get-ChildItem -Path "$SourceDir\*" -Include *.html, *.csv, *.json
foreach ($f in $Files) { Sync-Files -File $f.Name }

Write-Host "Ready. Press Ctrl+C to stop."

# Loop to keep script alive
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    $Watcher.EnableRaisingEvents = $false
    $Watcher.Dispose()
    Unregister-Event -SourceIdentifier *
    Write-Host "--- Sync Stopped ---" -ForegroundColor Yellow
}
