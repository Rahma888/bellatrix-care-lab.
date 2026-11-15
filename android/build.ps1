<#
  Builds the two robot apps:
    android\Bellatrix.apk          "Bellatrix Care Team": both screens, everything bundled
    android\BellatrixPatient.apk   "Bellatrix Patient": its own icon, opens the patient screen
  No Gradle or Android Studio: javac, d8, aapt2, zipalign and apksigner from android\sdk.
  Needs a JDK (the one in Program Files is found by itself).
#>
$ErrorActionPreference = 'Stop'
$Here = $PSScriptRoot
$App = Split-Path -Parent $Here
$Bt = Join-Path $Here 'sdk\build-tools\android-14'
$Jar = Join-Path $Here 'sdk\platforms\android-9\android.jar'
$Out = Join-Path $Here 'build'
# Orionstar's RobotApi and Gson (needed by it): only the head apps (care, care-tablet) use them.
$Vendor = @((Join-Path $Here 'vendor\robotservice.jar'), (Join-Path $Here 'vendor\gson.jar'))
# TensorFlow Lite 2.16.1 (Maven Central .aar files in vendor\tflite): the app's own hand tracking
# (src\de\labland\bellatrix\hands). Each .aar gives its classes.jar (javac, d8) and its
# jni\arm64-v8a\*.so (lib/arm64-v8a in the APK). Extracted below into build\tflite.
$TfliteAars = @('tensorflow-lite', 'tensorflow-lite-api', 'tensorflow-lite-gpu', 'tensorflow-lite-gpu-api') |
  ForEach-Object { Join-Path $Here "vendor\tflite\$_-2.16.1.aar" }

$jdk = $env:JAVA_HOME
if (-not $jdk -or -not (Test-Path "$jdk\bin\javac.exe")) {
  $found = Get-ChildItem 'C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft' -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'bin\javac.exe') } | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $found) { throw 'No JDK found. Install one (winget install EclipseAdoptium.Temurin.17.JDK) and run this again.' }
  $jdk = $found.FullName
}
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

$version = (Select-String -Path (Join-Path $App 'js\core.js') -Pattern "var VERSION = '([0-9.]+)'").Matches[0].Groups[1].Value
$parts = $version.Split('.')
$code = [int]$parts[0] * 10000 + [int]$parts[1] * 100 + [int]$parts[2]
Write-Host "Building Bellatrix $version ($code) with $jdk"

if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$Out\assets\web" | Out-Null

# TensorFlow Lite out of its .aar files: classes.jar for the compiler, the arm64 .so for the APK.
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$TfliteJars = @()
$TfliteLib = Join-Path $Out 'tflite\lib'
New-Item -ItemType Directory -Force -Path "$TfliteLib\arm64-v8a" | Out-Null
foreach ($aar in $TfliteAars) {
  if (-not (Test-Path $aar)) { throw "Missing $aar (TensorFlow Lite 2.16.1 from Maven Central)" }
  $aarName = [System.IO.Path]::GetFileNameWithoutExtension($aar)
  $z = [System.IO.Compression.ZipFile]::OpenRead($aar)
  try {
    foreach ($e in $z.Entries) {
      if ($e.FullName -eq 'classes.jar') {
        $tjar = Join-Path $Out "tflite\$aarName.jar"
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $tjar, $true)
        $TfliteJars += $tjar
      } elseif ($e.FullName -like 'jni/arm64-v8a/*.so') {
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path "$TfliteLib\arm64-v8a" $e.Name), $true)
      }
    }
  } finally { $z.Dispose() }
}
$HeadJars = @($Vendor) + @($TfliteJars)
$HeadLibs = @((Join-Path $Here 'lib'), $TfliteLib)

# The hand models (palm detector and hand landmarks, lite): assets/models/ in the head apps.
New-Item -ItemType Directory -Force -Path "$Out\assets\models" | Out-Null
Copy-Item (Join-Path $Here 'models\palm_detection_lite.tflite'), (Join-Path $Here 'models\hand_landmark_lite.tflite') "$Out\assets\models\"

# The web app goes in as it is; tools, notes and results stay out.
foreach ($f in @('index.html', 'staff.html', 'patient.html', 'atelier.html', 'jeu.html', 'cuisine.html')) { Copy-Item (Join-Path $App $f) "$Out\assets\web\" }
foreach ($d in @('css', 'js', 'vendor', 'img', 'fonts')) { Copy-Item (Join-Path $App $d) "$Out\assets\web\" -Recurse }
# LabLand's signed Library files, so the robot installs its packs (Chess, Ludo) without a server.
# Only the public, signed catalog and packages: never labland\keys or labland\data.
$storeSrc = Join-Path $App 'labland\store'
if (Test-Path (Join-Path $storeSrc 'catalog.json')) {
  New-Item -ItemType Directory -Force -Path "$Out\assets\web\store\packages" | Out-Null
  Copy-Item (Join-Path $storeSrc 'catalog.json') "$Out\assets\web\store\"
  $catalog = (Get-Content (Join-Path $storeSrc 'catalog.json') -Raw -Encoding UTF8 | ConvertFrom-Json).catalog | ConvertFrom-Json
  foreach ($p in $catalog.packs) { if ($p.package) { Copy-Item (Join-Path $storeSrc $p.package.file) "$Out\assets\web\store\packages\" } }
}

# The whole server on the robot head (HeadServer, NodeService): only in Bellatrix.apk, never in the tablet APK.
# assets/server: what Node serves and the WebView copy above lacks (every page, the portal's manifest and
# service worker, icons, labland's modules, its signed store and pack sources; never labland\keys or
# labland\data), plus assets/server/index.txt: what HeadServer copies to the head's own folder (web/... first,
# then server/...). Folder and pattern copies, so new pages and modules go in by themselves.
$SrvAssets = Join-Path $Out 'server-assets'
$Srv = Join-Path $SrvAssets 'server'
New-Item -ItemType Directory -Force -Path "$Srv\labland" | Out-Null
Get-ChildItem $App -File | Where-Object { $_.Name -match '\.(html|webmanifest)$' -or $_.Name -match '^sw-[a-z0-9-]+\.js$' } | Copy-Item -Destination $Srv
if (Test-Path (Join-Path $App 'icons')) { Copy-Item (Join-Path $App 'icons') $Srv -Recurse }
Get-ChildItem (Join-Path $App 'labland') -File | Where-Object { $_.Name -match '\.mjs$' -or $_.Name -match '^admin\.(html|js|css)$' } | Copy-Item -Destination "$Srv\labland"
foreach ($d in @('store', 'packs')) { if (Test-Path (Join-Path $App "labland\$d")) { Copy-Item (Join-Path $App "labland\$d") "$Srv\labland" -Recurse } }
$index = New-Object System.Collections.Generic.List[string]
$webRoot = (Resolve-Path "$Out\assets\web").Path
foreach ($file in Get-ChildItem $webRoot -Recurse -File) {
  $rel = $file.FullName.Substring($webRoot.Length + 1).Replace('\', '/')
  if (-not ($rel.StartsWith('vendor/mediapipe/') -or $rel.StartsWith('store/'))) { $index.Add('web/' + $rel) }
}
$srvRoot = (Resolve-Path $Srv).Path
foreach ($file in Get-ChildItem $srvRoot -Recurse -File) { $index.Add('server/' + $file.FullName.Substring($srvRoot.Length + 1).Replace('\', '/')) }
[System.IO.File]::WriteAllText((Join-Path $Srv 'index.txt'), (($index -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))

# Node and cloudflared for the head, in lib/arm64-v8a (Android unpacks them at install, where they may run):
#   libnode.so           nodejs-mobile v18.20.4, Node for Android (vendor\nodejs-mobile, see vendor\SOURCES.md)
#   libc++_shared.so     the C++ library libnode.so is linked with, from the Android NDK
#   libbellatrixnode.so  the JNI glue (jni\bellatrix-node.cpp), built here with the NDK's clang
#   libcloudflared.so    cloudflared linux-arm64 (vendor\cloudflared): the public https address
# Without an Android NDK on this PC none of them goes in, and the head works as before (LinkServer only).
$NodeZip = Join-Path $Here 'vendor\nodejs-mobile\nodejs-mobile-v18.20.4-android.zip'
$CfBin = Join-Path $Here 'vendor\cloudflared\cloudflared-linux-arm64'
$ndkDirs = @($env:ANDROID_NDK_HOME, $env:ANDROID_NDK_ROOT, (Join-Path $Here 'ndk'))
$ndkDirs += @(Get-ChildItem (Join-Path $Here 'ndk'), "$env:LOCALAPPDATA\Android\Sdk\ndk" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object { $_.FullName })
$Ndk = $ndkDirs | Where-Object { $_ -and (Test-Path (Join-Path $_ 'toolchains\llvm\prebuilt\windows-x86_64\bin\clang++.exe')) } | Select-Object -First 1
$HeadServerLibs = @()
if (-not $Ndk) {
  Write-Host 'Head server: Node NOT in Bellatrix.apk (no Android NDK on this PC: ANDROID_NDK_HOME or android\ndk). The head keeps the link relay only.'
} elseif (-not (Test-Path $NodeZip) -or -not (Test-Path $CfBin)) {
  Write-Host "Head server: Node NOT in Bellatrix.apk (missing $NodeZip or $CfBin)."
} else {
  $ServerLib = Join-Path $Out 'server-lib'
  $abi = Join-Path $ServerLib 'arm64-v8a'
  New-Item -ItemType Directory -Force -Path $abi | Out-Null
  $z = [System.IO.Compression.ZipFile]::OpenRead($NodeZip)
  try {
    $e = $z.Entries | Where-Object { $_.FullName -eq 'bin/arm64-v8a/libnode.so' }
    if (-not $e) { throw "No bin/arm64-v8a/libnode.so in $NodeZip" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $abi 'libnode.so'), $true)
  } finally { $z.Dispose() }
  $tc = Join-Path $Ndk 'toolchains\llvm\prebuilt\windows-x86_64'
  Copy-Item (Join-Path $tc 'sysroot\usr\lib\aarch64-linux-android\libc++_shared.so') $abi
  & (Join-Path $tc 'bin\clang++.exe') --target=aarch64-linux-android26 "--sysroot=$tc\sysroot" -shared -fPIC -O2 -fno-exceptions -fno-rtti -nostdlib++ `
    -o (Join-Path $abi 'libbellatrixnode.so') (Join-Path $Here 'jni\bellatrix-node.cpp') "-L$abi" -lnode
  if ($LASTEXITCODE) { throw 'clang failed (jni\bellatrix-node.cpp)' }
  Copy-Item $CfBin (Join-Path $abi 'libcloudflared.so')
  $HeadServerLibs = @($ServerLib)
  Write-Host "Head server: Node and cloudflared go into Bellatrix.apk (NDK $Ndk)"
}

# A local signing key for the robot, made once and kept: an update must be signed with the same key.
$ks = Join-Path $Here 'bellatrix.keystore'
if (-not (Test-Path $ks)) {
  $ErrorActionPreference = 'Continue'   # keytool prints progress on stderr
  & keytool -genkeypair -keystore $ks -storepass bellatrix -keypass bellatrix -alias bellatrix -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Bellatrix Care Lab,O=Labland' 2>&1 | Out-Null
  $ErrorActionPreference = 'Stop'
  if (-not (Test-Path $ks)) { throw 'keytool failed' }
}

function Build-Apk($name, $manifest, $src, $res, $assets, $apk, $libs, $jars = @()) {
  $w = Join-Path $Out $name
  New-Item -ItemType Directory -Force -Path "$w\classes", "$w\dex" | Out-Null

  $sources = Get-ChildItem $src -Recurse -Filter *.java | ForEach-Object { $_.FullName }
  & javac --release 8 -Xlint:-options -encoding UTF-8 -classpath ((@($Jar) + @($jars)) -join ';') -d "$w\classes" $sources
  if ($LASTEXITCODE) { throw "javac failed ($name)" }
  # The classes go to d8 as one jar: listed one by one, the command line got too long for cmd.
  & jar cf "$w\app-classes.jar" -C "$w\classes" .
  if ($LASTEXITCODE) { throw "jar failed ($name)" }
  & "$Bt\d8.bat" --release --min-api 26 --lib $Jar --output "$w\dex" "$w\app-classes.jar" @jars
  if ($LASTEXITCODE) { throw "d8 failed ($name)" }

  # The icons (res\mipmap-*\ic_launcher.png).
  & "$Bt\aapt2.exe" compile --dir $res -o "$w\res.zip"
  if ($LASTEXITCODE) { throw "aapt2 compile failed ($name)" }
  & "$Bt\aapt2.exe" link -o "$w\unsigned.apk" -I $Jar --manifest $manifest -R "$w\res.zip" --auto-add-overlay `
    --min-sdk-version 26 --target-sdk-version 28 --version-code $code --version-name $version
  if ($LASTEXITCODE) { throw "aapt2 link failed ($name)" }
  Push-Location "$w\dex"
  & "$Bt\aapt.exe" add "$w\unsigned.apk" classes.dex | Out-Null
  Pop-Location

  if ($assets -or $libs) {
    # The pages go in with forward slashes (assets/web/js/core.js). aapt2 -A on Windows writes
    # backslashes, and then Android finds none of them ("Webpage not available").
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open("$w\unsigned.apk", 'Update')
    try {
      # One or more asset folders (the head adds build\server-assets: assets/server/...).
      foreach ($aroot in @($assets)) {
        if (-not $aroot) { continue }
        $root = (Resolve-Path $aroot).Path
        Get-ChildItem $root -Recurse -File | ForEach-Object {
          $entry = 'assets/' + $_.FullName.Substring($root.Length + 1).Replace('\', '/')
          [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry, 'Optimal') | Out-Null
        }
      }
      # The voice library (sherpa-onnx, android\lib\arm64-v8a): Bellatrix speaks three languages.
      # TensorFlow Lite (build\tflite\lib\arm64-v8a): the hand tracking.
      foreach ($ldir in @($libs)) {
        if (-not $ldir -or -not (Test-Path $ldir)) { continue }
        $lroot = (Resolve-Path $ldir).Path
        Get-ChildItem $lroot -Recurse -File -Filter *.so | ForEach-Object {
          $entry = 'lib/' + $_.FullName.Substring($lroot.Length + 1).Replace('\', '/')
          [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry, 'Optimal') | Out-Null
        }
      }
    } finally { $zip.Dispose() }
  }

  & "$Bt\zipalign.exe" -f -p 4 "$w\unsigned.apk" "$w\aligned.apk"
  if ($LASTEXITCODE) { throw "zipalign failed ($name)" }
  $ErrorActionPreference = 'Continue'   # apksigner prints warnings on stderr
  & "$Bt\apksigner.bat" sign --ks $ks --ks-pass pass:bellatrix --key-pass pass:bellatrix --out $apk "$w\aligned.apk" 2>&1 | Where-Object { $_ -notmatch 'WARNING' } | Out-Host
  $failed = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($failed) { throw "apksigner failed ($name)" }
  Write-Host ("Built {0} ({1:N1} MB)" -f $apk, ((Get-Item $apk).Length / 1MB))
}

Build-Apk 'care' (Join-Path $Here 'AndroidManifest.xml') (Join-Path $Here 'src') (Join-Path $Here 'res') @("$Out\assets", $SrvAssets) (Join-Path $Here 'Bellatrix.apk') (@($HeadLibs) + @($HeadServerLibs)) $HeadJars
Build-Apk 'patient' (Join-Path $Here 'launcher\AndroidManifest.xml') (Join-Path $Here 'launcher\src') (Join-Path $Here 'launcher\res') $null (Join-Path $Here 'BellatrixPatient.apk') $null

# Tablet variant (front display): same app, but no "Care Team" icon. The care team works on the head screen.
$tm = Get-Content (Join-Path $Here 'AndroidManifest.xml') -Raw
$tm = [regex]::Replace($tm, '\s*<intent-filter>\s*<action android:name="android.intent.action.MAIN" />\s*<category android:name="android.intent.category.LAUNCHER" />\s*</intent-filter>', '', 1)
$tmf = Join-Path $Out 'AndroidManifest-tablet.xml'
Set-Content -Path $tmf -Value $tm -Encoding UTF8
Build-Apk 'care-tablet' $tmf (Join-Path $Here 'src') (Join-Path $Here 'res') "$Out\assets" (Join-Path $Here 'BellatrixTablet.apk') $HeadLibs $HeadJars
