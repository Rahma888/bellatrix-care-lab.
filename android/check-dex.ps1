<#
  Off-robot check (installs nothing): the head APKs carry Gson and Orionstar's RobotApi in their dex,
  the bridge is there, the manifest asks for the SDK permission, and the patient APK stays small.
  Run after build.ps1:  powershell -NoProfile -ExecutionPolicy Bypass -File android\check-dex.ps1
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Here = $PSScriptRoot
$bad = 0
function Check($ok, $msg) { if ($ok) { Write-Host "ok    $msg" } else { Write-Host "FAIL  $msg"; $script:bad++ } }
foreach ($apk in 'Bellatrix.apk', 'BellatrixTablet.apk') {
  $zip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $Here $apk))
  try {
    $ms = New-Object System.IO.MemoryStream
    $s = ($zip.Entries | Where-Object { $_.FullName -eq 'classes.dex' }).Open(); $s.CopyTo($ms); $s.Dispose()
    $text = [System.Text.Encoding]::GetEncoding(28591).GetString($ms.ToArray())
    foreach ($c in 'Lcom/google/gson/Gson;', 'Lcom/ainirobot/coreservice/client/RobotApi;', 'Lde/labland/bellatrix/RobotBridge;',
        'Lorg/tensorflow/lite/Interpreter;', 'Lorg/tensorflow/lite/NativeInterpreterWrapper;', 'Lorg/tensorflow/lite/gpu/GpuDelegate;',
        'Lorg/tensorflow/lite/gpu/GpuDelegateFactory$Options;', 'Lde/labland/bellatrix/hands/Hands;', 'Lde/labland/bellatrix/hands/HandsCamera;') {
      Check ($text.Contains($c)) "$apk dex contains $c"
    }
    # Only one dex goes into the APK (build.ps1 adds classes.dex): a second one would be lost.
    Check (-not ($zip.Entries | Where-Object { $_.FullName -eq 'classes2.dex' })) "$apk has a single dex"
    # The hand tracking: TensorFlow Lite's native parts and the two lite hand models.
    foreach ($e in 'lib/arm64-v8a/libtensorflowlite_jni.so', 'lib/arm64-v8a/libtensorflowlite_gpu_jni.so',
        'assets/models/palm_detection_lite.tflite', 'assets/models/hand_landmark_lite.tflite') {
      $entry = $zip.Entries | Where-Object { $_.FullName -eq $e }
      Check ($entry -and $entry.Length -gt 100000) "$apk has $e"
    }
    $m = ($zip.Entries | Where-Object { $_.FullName -eq 'AndroidManifest.xml' }).Open(); $ms2 = New-Object System.IO.MemoryStream; $m.CopyTo($ms2); $m.Dispose()
    $mt = [System.Text.Encoding]::Unicode.GetString($ms2.ToArray()) + [System.Text.Encoding]::GetEncoding(28591).GetString($ms2.ToArray())
    Check ($mt.Contains('com.ainirobot.coreservice.robotSettingProvider')) "$apk manifest has the robotSettingProvider permission"
  } finally { $zip.Dispose() }
}
# The whole server on the head (HeadServer): its files only in Bellatrix.apk, never in the tablet APK, and never
# LabLand's key or data. Node and cloudflared are in only when the build found an Android NDK (all four or none).
$runtime = @('lib/arm64-v8a/libnode.so', 'lib/arm64-v8a/libc++_shared.so', 'lib/arm64-v8a/libbellatrixnode.so', 'lib/arm64-v8a/libcloudflared.so')
foreach ($apk in 'Bellatrix.apk', 'BellatrixTablet.apk') {
  $zip = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $Here $apk))
  try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName })
    $head = $apk -eq 'Bellatrix.apk'
    $ms = New-Object System.IO.MemoryStream
    $s = ($zip.Entries | Where-Object { $_.FullName -eq 'classes.dex' }).Open(); $s.CopyTo($ms); $s.Dispose()
    $text = [System.Text.Encoding]::GetEncoding(28591).GetString($ms.ToArray())
    foreach ($c in 'Lde/labland/bellatrix/HeadServer;', 'Lde/labland/bellatrix/NodeService;') { Check ($text.Contains($c)) "$apk dex contains $c" }
    foreach ($e in 'assets/server/index.txt', 'assets/server/labland/store-server.mjs', 'assets/server/portail.html') {
      if ($head) { Check ($names -contains $e) "$apk has $e" } else { Check (-not ($names -contains $e)) "$apk has no $e" }
    }
    Check (-not ($names | Where-Object { $_ -match '^assets/.*labland/(keys|data)/' })) "$apk has no labland/keys or labland/data"
    $have = @($runtime | Where-Object { $names -contains $_ })
    if ($head) {
      Check ($have.Count -eq 0 -or $have.Count -eq 4) "$apk has all of the Node runtime or none of it ($($have.Count) of 4)"
      if ($have.Count -eq 0) { Write-Host "note  $apk carries no Node runtime (built without an Android NDK): the head keeps the link relay only" }
    } else {
      Check ($have.Count -eq 0) "$apk has no Node runtime"
    }
  } finally { $zip.Dispose() }
}
$p = (Get-Item (Join-Path $Here 'BellatrixPatient.apk')).Length
Check ($p -lt 60000) ("BellatrixPatient.apk stays small ({0:N0} bytes)" -f $p)
if ($bad) { Write-Host "$bad check(s) failed"; exit 1 } else { Write-Host 'all checks passed' }
