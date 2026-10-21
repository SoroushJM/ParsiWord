# Android distribution, 0.2.4

The user requested a replacement for the APK that their Samsung installer rejected and explicitly requested that future Android builds contain no x86 output.

The screenshot only reports `App not installed`. Checks of the previous APKs found matching signing certificates, increasing version codes, valid APK signatures, matching ARM64 support and valid 16 KiB alignment. The precise device failure was not reproduced or diagnosed from an Android installer log. Do not claim that dual-architecture packaging or a changed key was proven to be the cause. The user subsequently said they had uninstalled the old app.

## New package

- The normal APK command builds only `aarch64`; the debug-preview command does too. Gradle's ABI filter and RustPlugin's default ABI, architecture and target lists are ARM64-only. The Android project's x86/x86_64 flavors are no longer created by default. Preserve these customizations if regenerating the Android project.
- The distributed APK uses the Cargo/Android **release** profiles, with Android optimization enabled. It is not debuggable or test-only. This is a preview distribution, not a store-signed production release.
- `jniLibs.useLegacyPackaging = true` compresses the native library and enables extraction during installation, instead of loading it directly from an uncompressed APK entry. This is a compatibility change; successful device installation remains to be confirmed.
- The aligned APK is manually signed with the existing external preview keystore so that its public certificate stays compatible with prior preview versions. APK signature schemes v1/v2/v3 are enabled. The keystore is not included in source archives.
- Version name is `0.2.4`, version code `2004`, minimum Android API `24`, target API `36`, application ID `app.parsiword.mobile`.

The signed APK is **5,324,347 bytes**, compared with 48,566,154 bytes for 0.2.3. It has one native library, `lib/arm64-v8a/libparsiword_lib.so`: 7,274,680 bytes before compression and 3,587,804 bytes in the APK. Compressed DEX code totals 706,941 bytes. The size change includes both dropping the second architecture and applying release optimization/compression; it is not a font-catalogue change.

## Verification

`scripts/verify-android-apk.py` checks the final signed file: signature validity from API 24, certificate continuity, version/package metadata, exactly one ARM64 library, no debug/test-only flags, native extraction, ZIP CRC and alignment, AArch64 ELF load segments and 16 KiB page alignment, and presence of the latest frontend and bundled symbol font. Its report is `artifacts/verification-0.2.4.json`. TypeScript, Vite, Rust release, Kotlin/Java and Android optimization/package tasks completed successfully.

No converter or UI behavior changed in this version. The existing 777 unit and 4 Playwright tests were last run for the 0.2.3 functional changes and were not unnecessarily repeated for packaging alone. No emulator was started. APK structural checks are not proof of installation or launch on the user's phone; those results remain pending.
