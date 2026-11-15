# Third-party files in android/vendor

| File | Version | Source | Size (bytes) | SHA-256 |
|---|---|---|---|---|
| `nodejs-mobile/nodejs-mobile-v18.20.4-android.zip` | nodejs-mobile v18.20.4 (Node 18.20.4 for Android), released 2024-10-07 | https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip | 57287354 | `bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af` |
| `nodejs-mobile/...zip` > `bin/arm64-v8a/libnode.so` | (inside the zip) | build.ps1 extracts it | 62475584 | `7c907316beb6e78e34495926c9ac1befe079369b14650d508ea812929258250c` |
| `cloudflared/cloudflared-linux-arm64` | cloudflared 2026.11.0, released 2026-11-12 | https://github.com/cloudflare/cloudflared/releases/download/2026.11.0/cloudflared-linux-arm64 | 37668707 | `abe54a006acf9faf2d19ee9d953cb0d0804e92f59c5382a162e57b84d086f56f` |
| `gson.jar`, `robotservice.jar`, `tflite/*.aar` | see build.ps1 | (earlier) | | |

Downloaded 2026-11-14. cloudflared: the SHA-256 matches the digest GitHub publishes for the release asset.
nodejs-mobile: GitHub publishes no digest for this asset; the size matches the release page, the hash above
is the one measured after the download.

Used only for the robot head (Bellatrix.apk, HeadServer / NodeService), never in the tablet APK.
libnode.so needs `libc++_shared.so` and a small JNI glue (`android/jni/bellatrix-node.cpp`): both come from
the Android NDK at build time (not in this folder, not downloaded yet).

Licences: nodejs-mobile / Node.js MIT (with the bundled libraries' own licences); cloudflared Apache 2.0.
