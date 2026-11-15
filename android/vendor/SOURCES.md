# Third-party files in android/vendor

| File | Version | Source | Size (bytes) | SHA-256 |
|---|---|---|---|---|
| `nodejs-mobile/nodejs-mobile-v18.20.4-android.zip` | nodejs-mobile v18.20.4 (Node 18.20.4 for Android), released 2024-10-07 | https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip | 57287354 | `bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af` |
| `nodejs-mobile/...zip` > `bin/arm64-v8a/libnode.so` | (inside the zip) | build.ps1 extracts it | 62475584 | `7c907316beb6e78e34495926c9ac1befe079369b14650d508ea812929258250c` |
| `cloudflared/cloudflared-linux-arm64` | cloudflared 2026.11.0, released 2026-11-12 | https://github.com/cloudflare/cloudflared/releases/download/2026.11.0/cloudflared-linux-arm64 | 37668707 | `abe54a006acf9faf2d19ee9d953cb0d0804e92f59c5382a162e57b84d086f56f` |
| `vergil-navigation.jar` | LabLand Vergil route planner (`PgmMap`, `OccupancyGrid`, `GridPathfinder`, `PathSimplifier`, `RoutePlanner`, `NavLog`): the Kotlin sources of Vergil `robot/navigation` at commit `e371cab` (branch `master`), unchanged, compiled to Java 8 class files. Source, tests and build files in `vergil-navigation-src/` | from LabLand (Sebastian), 2026-11-15, `NAV-PACKAGE.md` | 53513 | `f931c57b3e209f76d500b3c829e13978516e500781693f99218291951fb96910` |
| `kotlin-stdlib-2.0.20.jar` | `org.jetbrains.kotlin:kotlin-stdlib:2.0.20`, the Kotlin runtime the planner needs | Maven Central | 1747659 | `fb169596659a518357c4b2c16f43dc75ab1c4980565ed4b4a317a050e5e39006` |
| `gson.jar`, `robotservice.jar`, `tflite/*.aar` | see build.ps1 | (earlier) | | |

Downloaded 2026-11-14. cloudflared: the SHA-256 matches the digest GitHub publishes for the release asset.
nodejs-mobile: GitHub publishes no digest for this asset; the size matches the release page, the hash above
is the one measured after the download.

Used only for the robot head (Bellatrix.apk, HeadServer / NodeService), never in the tablet APK.
libnode.so needs `libc++_shared.so` and a small JNI glue (`android/jni/bellatrix-node.cpp`): both come from
the Android NDK at build time (not in this folder, not downloaded yet).

The planner and the Kotlin runtime: both head APKs (Bellatrix.apk, BellatrixTablet.apk), on the `javac` classpath
and in `d8` like `robotservice.jar` (build.ps1 `$Vendor`; mode "route" of `RobotBridge`, `RouteDrive`, PLAN-NAV.md).
Both SHA-256 checked against PLAN-NAV.md on 2026-11-15. The jars stay as delivered; to rebuild the planner jar
see `reference/vergil/README.md` (JDK 17, `gradlew :navigation:test :navigation:jar` in `vergil-navigation-src/`).

Licences: nodejs-mobile / Node.js MIT (with the bundled libraries' own licences); cloudflared Apache 2.0;
Kotlin standard library Apache 2.0.
