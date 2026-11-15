<#
  Bellatrix Care Lab: put the app on the robot's screen, collect results, log power.
  Started by the .bat files next to index.html:
    "Deploy to robot.bat"             -Mode deploy
    "Collect results from robot.bat"  -Mode collect
    "Power log.bat"                   -Mode power
  The laptop serves the app. "adb reverse" makes it http://localhost:8765 on the robot's screen,
  so Chrome there allows the camera and the microphone, and the screen keeps its data under one address.
#>
param(
  [ValidateSet('deploy', 'install', 'collect', 'power')] [string]$Mode = 'deploy',
  [string]$Device = '',
  [int]$Minutes = 30,
  [switch]$NoPrompt
)
$ErrorActionPreference = 'Continue'
$Port = 8765
$App = Split-Path -Parent $PSScriptRoot
$AddressFile = Join-Path $PSScriptRoot 'robot-address.txt'
$HeadFile = Join-Path $PSScriptRoot 'robot-head-address.txt'

function Title($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "   OK  $t" -ForegroundColor Green }
function Info($t) { Write-Host "       $t" }
function Warn($t) { Write-Host "   !!  $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host "   XX  $t" -ForegroundColor Red }
function Ask($q, $default) {
  if ($NoPrompt) { return $default }
  $a = Read-Host "   ?   $q"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a.Trim()
}

function Find-Adb {
  $c = Get-Command adb -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $list = @("$env:LOCALAPPDATA\Microsoft\WinGet\Links\adb.exe", "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", 'C:\platform-tools\adb.exe')
  $pkg = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter adb.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pkg) { $list = @($pkg.FullName) + $list }
  foreach ($p in $list) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}
function Find-Python {
  foreach ($n in @('python', 'py')) { $c = Get-Command $n -ErrorAction SilentlyContinue; if ($c) { return $c.Source } }
  return $null
}
function Get-Devices {
  $out = @()
  & $script:adb devices 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match '\S' } | ForEach-Object {
    $p = $_ -split '\s+'
    $out += [pscustomobject]@{ Serial = $p[0]; State = $p[1] }
  }
  return $out
}
function Get-State($serial) { $s = & $script:adb -s $serial get-state 2>$null; if ($s) { return "$s".Trim() } else { return 'none' } }
function Sh($serial, $cmd) { return (& $script:adb -s $serial shell $cmd 2>$null) }

<# Waits until a screen accepts this laptop. Over Wi-Fi a fresh connection is needed after "Allow". #>
function Wait-Authorized($serial, $wifi) {
  for ($i = 0; $i -lt 20; $i++) {
    $st = Get-State $serial
    if ($st -eq 'device') { return $true }
    <# Nothing answers at that address: waiting longer will not help. #>
    if ($st -eq 'none' -and $i -ge 2) { return $false }
    if ($i -eq 0) { Warn 'On the robot screen: if it asks "Allow USB debugging?", tick "Always allow" and tap Allow.' }
    Start-Sleep -Seconds 3
    if ($wifi) { & $script:adb disconnect $serial *> $null; & $script:adb connect $serial *> $null }
  }
  return $false
}

<# Finds the robot screen: USB first, then the saved Wi-Fi address, then asks. #>
function Connect-Screen {
  & $script:adb start-server *> $null
  if ($Device) { $target = $Device }
  else {
    $all = @(Get-Devices)
    $ready = @($all | Where-Object { $_.State -eq 'device' })
    $waiting = @($all | Where-Object { $_.State -eq 'unauthorized' })
    if ($ready.Count -eq 1) { Ok "Screen found: $($ready[0].Serial)"; return $ready[0].Serial }
    if ($ready.Count -gt 1) {
      for ($i = 0; $i -lt $ready.Count; $i++) { Info "$($i + 1)  $($ready[$i].Serial)  $(Sh $ready[$i].Serial 'getprop ro.product.model')" }
      $n = [int](Ask 'Which screen? (number)' '1')
      return $ready[[Math]::Max(0, [Math]::Min($ready.Count - 1, $n - 1))].Serial
    }
    if ($waiting.Count -ge 1) {
      $s = $waiting[0].Serial
      if (Wait-Authorized $s ($s -match ':')) { Ok "Screen found: $s"; return $s }
      Fail "The screen $s did not accept this laptop."; return $null
    }
    $saved = ''
    if (Test-Path $AddressFile) { $saved = (Get-Content $AddressFile -Raw).Trim() }
    Info 'No screen connected by USB. Plug in the USB cable (easiest), or connect over Wi-Fi.'
    $hint = 'Address of the robot screen (IP or IP:port), P = pair first (Android 11+)'
    if ($saved) { $hint += ", Enter = $saved" }
    $target = Ask $hint $saved
    if ($target -match '^[pP]$') {
      Info 'On the robot screen: Settings > Developer options > Wireless debugging > "Pair device with pairing code".'
      $pairAt = Ask 'IP:port shown under the pairing code' ''
      $code = Ask 'Pairing code (6 digits)' ''
      & $script:adb pair $pairAt $code | ForEach-Object { Info $_ }
      $target = Ask 'IP:port shown at the top of the Wireless debugging screen (not the pairing one)' ''
    }
  }
  if (-not $target) { Fail 'No screen and no address.'; return $null }
  if ($target -notmatch ':\d+$') { $target = "${target}:5555" }
  & $script:adb connect $target 2>&1 | ForEach-Object { Info $_ }
  if (Wait-Authorized $target $true) {
    Set-Content -Path $AddressFile -Value $target
    Ok "Connected: $target"
    return $target
  }
  Fail "Could not connect to $target."
  Info 'Check: laptop and robot on the same Wi-Fi, Developer options and USB debugging switched on.'
  Info 'On Android 11 or newer use "Wireless debugging" and pair first (answer P), or use the USB cable.'
  return $null
}

<# The app is served from this folder on port 8765. The robot screen keeps its data (patients, results)
   under that address, so the port never changes. #>
function Ensure-Server {
  $tmp = Join-Path $env:TEMP 'bellatrix-check.html'
  $here = (Get-FileHash (Join-Path $App 'index.html')).Hash
  $served = $null
  try { Invoke-WebRequest "http://127.0.0.1:$Port/index.html" -UseBasicParsing -TimeoutSec 3 -OutFile $tmp; $served = (Get-FileHash $tmp).Hash } catch { $served = $null }
  if ($served -eq $here) { Ok "This folder is already served on port $Port."; return $true }
  if ($served) {
    Warn "Port $Port is used by another server (another copy of the app?)."
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)"; if ($p) { Info "It is: $($p.CommandLine)" } }
    $a = Ask 'Stop it and serve this folder instead? (y/n)' 'n'
    if ($conn -and $a -match '^[yYoO]') { Stop-Process -Id $conn.OwningProcess -Force; Start-Sleep -Seconds 1 }
    else { Fail 'Close that server first, then run this again.'; return $false }
  }
  $py = Find-Python
  if (-not $py) { Fail 'Python was not found. It is needed to serve the app (winget install Python.Python.3.12).'; return $false }
  Start-Process -FilePath $py -ArgumentList @('-m', 'http.server', "$Port", '--bind', '127.0.0.1', '--directory', "`"$App`"") -WindowStyle Minimized
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-WebRequest "http://127.0.0.1:$Port/index.html" -UseBasicParsing -TimeoutSec 2 -OutFile $tmp; if ((Get-FileHash $tmp).Hash -eq $here) { Ok "Serving the app on port $Port (minimised Python window: keep it open)."; return $true } } catch { }
  }
  Fail 'The local server did not start.'
  return $false
}

<# The newest "Export all patients" file from Downloads goes where the robot screen offers it. #>
function Copy-Patients {
  $dl = Join-Path $env:USERPROFILE 'Downloads'
  $f = Get-ChildItem $dl -Filter 'bellatrix-patients-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $dir = Join-Path $App 'transfer'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $dest = Join-Path $dir 'patients.json'
  if ($f) {
    Copy-Item $f.FullName $dest -Force
    Ok "Patients ready for the robot: $($f.Name) ($([Math]::Round($f.Length / 1MB, 1)) MB, exported $($f.LastWriteTime.ToString('dd.MM. HH:mm')))."
  } elseif (Test-Path $dest) {
    Ok 'No new export in Downloads; the robot gets the patients prepared last time.'
  } else {
    Info 'The robot keeps its own patients (they are prepared on the robot).'
  }
}

function Deploy {
  Title 'Bellatrix Care Lab  ->  robot screen'
  Title '1. Tools'
  if (-not $script:adb) { Fail 'adb not found. Install it once: winget install Google.PlatformTools'; return }
  Ok "adb: $script:adb"
  Title '2. Patients prepared on the laptop'
  Copy-Patients
  Title '3. Local server'
  if (-not (Ensure-Server)) { return }
  Title '4. Robot screen'
  $dev = Connect-Screen
  if (-not $dev) { return }
  $model = "$(Sh $dev 'getprop ro.product.model')".Trim()
  $android = "$(Sh $dev 'getprop ro.build.version.release')".Trim()
  $size = "$(Sh $dev 'wm size')" -replace '\s+', ' '
  Info "Screen: $model, Android $android, $size"
  if ($size -match '(\d+)x(\d+)\s*$') { if ([int]$Matches[1] -gt [int]$Matches[2]) { Warn 'This screen is in landscape. The app is made for the portrait front display (1080 x 1920) and shows smaller here.' } }
  Title '5. Link the robot screen to this laptop'
  & $script:adb -s $dev reverse "tcp:$Port" "tcp:$Port" *> $null
  $rev = "$(& $script:adb -s $dev reverse --list 2>$null)"
  if ($rev -match "tcp:$Port") { Ok "On the robot screen, http://localhost:$Port now opens the app from this laptop." }
  else { Fail 'The link (adb reverse) did not work.'; return }
  Title '6. Open the app'
  Sh $dev 'input keyevent KEYCODE_WAKEUP' | Out-Null
  $url = "http://localhost:$Port/?robot=1"
  $chrome = "$(Sh $dev 'pm list packages com.android.chrome')" -match 'com.android.chrome'
  if ($chrome) { & $script:adb -s $dev shell am start -a android.intent.action.VIEW -n com.android.chrome/com.google.android.apps.chrome.Main -d "'$url'" *> $null; Ok 'Opened in Chrome.' }
  else { & $script:adb -s $dev shell am start -a android.intent.action.VIEW -d "'$url'" *> $null; Warn 'Chrome is not installed here: opened in the default browser. Voice answers need Chrome.' }
  Title 'Ready'
  Info 'On the robot screen:'
  Info '  1. If a blue bar says patients are ready, tap "Load them".'
  Info '  2. Allow the camera and the microphone when Chrome asks.'
  Info '  3. Choose the patient and the activity, then "Start session" (it goes full screen).'
  Info 'Keep this laptop on, with the USB cable or the Wi-Fi connection, during the tests.'
  Info 'If the cable was unplugged: run "Deploy to robot" again; nothing on the robot is lost.'
}

<# The robot apps over Wi-Fi: android\Bellatrix.apk ("Bellatrix Care Team", both screens), android\BellatrixPatient.apk
   ("Bellatrix Patient", its own icon) and the offline voice in android\voice (the robot has no speech engine).
   Rebuilt first when a web or Java file is newer than the app. Works on screens without Chrome. #>
function Install {
  Title 'Bellatrix Care Lab  ->  Android app on the robot'
  if (-not $script:adb) { Fail 'adb not found. Install it once: winget install Google.PlatformTools'; return }
  $apk = Join-Path $App 'android\Bellatrix.apk'
  $apkPatient = Join-Path $App 'android\BellatrixPatient.apk'
  $newest = Get-ChildItem (Join-Path $App 'js'), (Join-Path $App 'css'), (Join-Path $App 'android\src'), (Join-Path $App 'android\res'), (Join-Path $App 'android\launcher'), (Join-Path $App 'android\AndroidManifest.xml') -Recurse -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $pages = Get-ChildItem $App -Filter *.html | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($pages.LastWriteTime -gt $newest.LastWriteTime) { $newest = $pages }
  Title '1. The app'
  if (-not (Test-Path $apk) -or -not (Test-Path $apkPatient) -or $newest.LastWriteTime -gt (Get-Item $apk).LastWriteTime) {
    Info "Building, because $($newest.Name) changed…"
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $App 'android\build.ps1')
    if ($LASTEXITCODE -or -not (Test-Path $apk)) { Fail 'The build failed (see above).'; return }
  }
  Ok ("App ready: {0:N1} MB" -f ((Get-Item $apk).Length / 1MB))
  Title '2. Robot screen'
  if (-not $Device -and -not (Test-Path $AddressFile)) { Set-Content -Path $AddressFile -Value '192.168.69.157:5555' }
  $dev = Connect-Screen
  if (-not $dev) { return }
  Info "Screen: $("$(Sh $dev 'getprop ro.product.model')".Trim()), Android $("$(Sh $dev 'getprop ro.build.version.release')".Trim())"
  Title '3. Install'
  $res = "$(& $script:adb -s $dev install -r $apk 2>&1)"
  if ($res -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') {
    Warn 'An older Bellatrix with another signature is on the robot.'
    if ((Ask 'Remove it and install this one? Patients and results stored on the robot are lost. (y/n)' 'n') -match '^[yYoO]') {
      & $script:adb -s $dev uninstall de.labland.bellatrix *> $null
      $res = "$(& $script:adb -s $dev install -r $apk 2>&1)"
    }
  }
  if ($res -notmatch 'Success') { Fail "Install failed: $res"; return }
  $res = "$(& $script:adb -s $dev install -r $apkPatient 2>&1)"
  if ($res -notmatch 'Success') { Fail "Install of Bellatrix Patient failed: $res"; return }
  Ok 'Installed: "Bellatrix Care Team" (teal icon) and "Bellatrix Patient" (pink heart).'
  # The robot has no speech engine of its own: the offline English voice goes on once.
  $engine = 'com.k2fsa.sherpa.onnx.tts.engine'
  if ("$(Sh $dev "pm list packages $engine")" -match [regex]::Escape($engine)) { Ok 'Voice: already on the robot.' }
  else {
    $voiceApk = Get-ChildItem (Join-Path $App 'android\voice') -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $voiceApk) { Warn 'No voice engine in android\voice: Bellatrix shows subtitles instead of speaking.' }
    else {
      Info "Installing the voice ($([math]::Round($voiceApk.Length / 1MB)) MB, about a minute over Wi-Fi)…"
      $res = "$(& $script:adb -s $dev install -r $voiceApk.FullName 2>&1)"
      if ($res -match 'Success') { Ok 'Voice installed: Bellatrix speaks English, without internet.' } else { Warn "The voice did not install ($res). Bellatrix shows subtitles." }
    }
  }
  # Bellatrix's own voices (English, French, German), read by the app from its folder on the robot.
  # Copied once (about 250 MB), then only when a file has changed.
  $voices = Join-Path $App 'android\voices'
  $remote = '/sdcard/Android/data/de.labland.bellatrix/files/voices'
  if (Test-Path $voices) {
    & $script:adb -s $dev shell "mkdir -p $remote" *> $null
    $count = "$(Sh $dev "ls $remote/espeak-ng-data 2>/dev/null | wc -l")".Trim()
    if ([int]("0$count") -lt 100) {
      Info 'Copying the pronunciation data (18 MB)…'
      & $script:adb -s $dev push (Join-Path $voices 'espeak-ng-data') "$remote/" *> $null
    }
    foreach ($lang in @('en', 'fr', 'de')) {
      $model = Join-Path $voices "$lang\model.onnx"
      if (-not (Test-Path $model)) { continue }
      $size = "$(Sh $dev "stat -c %s $remote/$lang/model.onnx 2>/dev/null")".Trim()
      if ($size -ne "$((Get-Item $model).Length)") {
        Info "Copying the $lang voice ($([math]::Round((Get-Item $model).Length / 1MB)) MB)…"
        & $script:adb -s $dev push $model "$remote/$lang/model.onnx" *> $null
      }
      & $script:adb -s $dev push (Join-Path $voices "$lang\tokens.txt") "$remote/$lang/tokens.txt" *> $null
    }
    $have = @('en', 'fr', 'de') | Where-Object { "$(Sh $dev "stat -c %s $remote/$_/model.onnx 2>/dev/null")".Trim() -match '^\d+$' }
    Ok "Voices on the robot: $($have -join ', ') (Bellatrix speaks these languages without internet)."
  }
  foreach ($p in @('android.permission.CAMERA', 'android.permission.RECORD_AUDIO')) { & $script:adb -s $dev shell pm grant de.labland.bellatrix $p *> $null }
  Ok 'Camera and microphone allowed for the app (the patient is still asked before use).'
  Title '4. Patients prepared on the laptop'
  Copy-Patients
  $pj = Join-Path $App 'transfer\patients.json'
  if (Test-Path $pj) {
    & $script:adb -s $dev push $pj '/sdcard/Android/data/de.labland.bellatrix/files/patients.json' *> $null
    Ok 'Copied to the robot: the care-team app offers them with "Load them".'
  }
  Title '5. Open'
  & $script:adb -s $dev shell am start -n de.labland.bellatrix/.StaffActivity *> $null
  Ok 'The care-team app is open on the robot screen.'
  Title 'Ready'
  Info 'On the robot screen:'
  Info '  1. If a blue bar says patients are ready, tap "Load them".'
  Info '  2. Choose the patient and the activity, then "Start on the patient screen".'
  Info '  3. "Bellatrix Patient" opens with "Ready when you are": the participant taps Begin.'
  Info '  4. Back to the care team: three taps in the top left corner (when no session runs).'
  Info 'The app works without this laptop. Run this again after any change to update it.'
}

function Collect {
  Title 'Bellatrix Care Lab  <-  robot screen: results'
  if (-not $script:adb) { Fail 'adb not found.'; return }
  $dev = Connect-Screen
  if (-not $dev) { return }
  # The robot app saves into its own folder; Chrome (on the 32" screen) into Download.
  $found = @()
  foreach ($dir in @('/sdcard/Android/data/de.labland.bellatrix/files/reports/', '/sdcard/Download/')) {
    $found += @(Sh $dev "ls $dir 2>/dev/null" | ForEach-Object { "$_".Trim() } | Where-Object { $_ -match '^bellatrix-' } | ForEach-Object { $dir + $_ })
  }
  if (-not $found.Count) {
    Warn 'No Bellatrix files on the robot screen yet.'
    Info 'On the robot, care-team app: Results tab > "Download all as one report" and "Download the summary table", then run this again.'
    return
  }
  $out = Join-Path $App ('from-robot\' + (Get-Date -Format 'yyyy-MM-dd_HHmm'))
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  foreach ($f in $found) { & $script:adb -s $dev pull $f "$out" *> $null }
  Ok "Copied $($found.Count) files to $out"
  Start-Process explorer.exe $out
}

<# Brief 7.3: a reading every 30 minutes. Values the device does not report are written as "not available". #>
function Read-Power($serial) {
  $bat = @(Sh $serial 'dumpsys battery')
  function Pick($lines, $key) { $l = $lines | Where-Object { $_ -match "^\s*$key\s*:" } | Select-Object -First 1; if ($l) { return ($l -split ':', 2)[1].Trim() } else { return $null } }
  $level = Pick $bat 'level'
  $temp = Pick $bat 'temperature'
  $ac = Pick $bat 'AC powered'; $usb = Pick $bat 'USB powered'; $wl = Pick $bat 'Wireless powered'
  $charging = 'not available'
  if ($ac -or $usb) { if ($ac -eq 'true' -or $usb -eq 'true' -or $wl -eq 'true') { $charging = 'yes' } else { $charging = 'no' } }
  $bright = "$(Sh $serial 'settings get system screen_brightness')".Trim()
  $wifi = "$(Sh $serial 'dumpsys wifi | grep -m1 mWifiInfo')"
  $rssi = 'not available'; if ($wifi -match 'RSSI: (-?\d+)') { $rssi = $Matches[1] }
  $focus = "$(Sh $serial 'dumpsys window | grep -m1 mCurrentFocus')"
  $app = 'not available'; if ($focus -match 'u0 ([^ /}]+)') { $app = $Matches[1] }
  if (-not $level) { $level = 'not available' }
  if ($temp -and $temp -match '^\d+$') { $temp = [Math]::Round([int]$temp / 10, 1) } else { $temp = 'not available' }
  if (-not $bright) { $bright = 'not available' }
  return @($level, $charging, $temp, $bright, $rssi, $app)
}
function Power {
  Title "Bellatrix Care Lab: power log every $Minutes minutes (Ctrl+C to stop)"
  if (-not $script:adb) { Fail 'adb not found.'; return }
  $dev = Connect-Screen
  if (-not $dev) { return }
  $targets = @($dev)
  $head = '192.168.69.157:5555'
  if (Test-Path $HeadFile) { $head = (Get-Content $HeadFile -Raw).Trim() }
  $h = Ask "Also log the robot's own head screen (robot battery)? Address, Enter = $head, - = no" $head
  if ($h -and $h -ne '-' -and $h -ne $dev) {
    if ($h -notmatch ':\d+$') { $h = "${h}:5555" }
    & $script:adb connect $h *> $null
    if ((Get-State $h) -eq 'device') { $targets += $h; Set-Content -Path $HeadFile -Value $h; Ok "Also logging $h" } else { Warn "Could not reach $h; logging only the front screen." }
  }
  $dir = Join-Path $App 'from-robot'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $csv = Join-Path $dir ('power-' + (Get-Date -Format 'yyyy-MM-dd') + '.csv')
  if (-not (Test-Path $csv)) { 'time,device,model,battery %,charging,temperature C,screen brightness,wifi signal dBm,app in front' | Set-Content -Path $csv -Encoding UTF8 }
  Ok "Writing to $csv"
  while ($true) {
    foreach ($t in $targets) {
      $model = "$(Sh $t 'getprop ro.product.model')".Trim()
      if ((Get-State $t) -ne 'device') { $line = "$(Get-Date -Format 'HH:mm'),$t,,not available (not connected),,,,,"; Warn "$t is not connected right now." }
      else { $v = Read-Power $t; $line = (@((Get-Date -Format 'HH:mm'), $t, $model) + $v) -join ','; Info ("{0}  {1}  battery {2}%  charging {3}  {4} C  brightness {5}  wifi {6}  {7}" -f (Get-Date -Format 'HH:mm'), $model, $v[0], $v[1], $v[2], $v[3], $v[4], $v[5]) }
      Add-Content -Path $csv -Value $line -Encoding UTF8
    }
    Info "Next reading at $((Get-Date).AddMinutes($Minutes).ToString('HH:mm')). Also add what you see in the app's Power log tab."
    Start-Sleep -Seconds ($Minutes * 60)
  }
}

$script:adb = Find-Adb
switch ($Mode) {
  'deploy' { Deploy }
  'install' { Install }
  'collect' { Collect }
  'power' { Power }
}
