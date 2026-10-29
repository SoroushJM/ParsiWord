# Android distribution

## Automatic release and manual GitHub Actions build

The **Build Android ARM64 preview** workflow in
[`.github/workflows/android.yml`](../.github/workflows/android.yml) is available
through **Actions → Build Android ARM64 preview → Run workflow** after this file
is on the repository's default branch. It also exposes `workflow_call` for the
**Release Android, Windows and VS Code** workflow, which runs on every push to
`main` and calls this build with `signing: stable`. Pull requests and pushes to
other branches do not start automatic Android builds. Once a stable-key build succeeds, the same workflow publishes
its installable APK directly to GitHub Releases. Unit, browser and device
testing remain local; the workflow performs the build, APK structural/signature
verification and release publication, without an emulator.

It uses Ubuntu 24.04, Node 24, the pnpm version from `package.json`, a frozen
lockfile, Temurin JDK 17, Android SDK 36, build-tools 36.0.0 and pinned NDK r28c
(`28.2.13676358`). Only Rust's `aarch64-linux-android` target is installed.
The tracked native Android project is retained, including its ARM64 filters
and Preview package settings; it is not regenerated. pnpm, Gradle dependencies
and Rust build dependencies are cached, while signing material is kept in the
runner's temporary directory outside the checkout and is never cached or
uploaded. Builds use commit-specific concurrency groups; a newer pushed commit
does not cancel an older commit's APK build. The
job is limited to 60 minutes and the native build step to 45 minutes.

The tracked Android Gradle plugin is patched to 9.3.2, which fixes the
[AGP 9.3 lint crash under JDK 17](https://developer.android.com/build/releases/agp-9-3-0-release-notes#android_gradle_plugin_932).
Release lint remains enabled.

Choose the signing mode explicitly when running it:

- **`ephemeral`** generates a key for that run and deletes it at the
  end. No repository secrets are needed. The output is clearly named
  `ephemeral`; it cannot update an installed Preview APK signed with a
  different key. These builds are available only as temporary workflow
  artifacts; they are never uploaded to GitHub Releases. To preserve an
  existing installation's data during updates, use `stable` with the original
  Preview key.
- **`stable`** (default) restores an existing Preview key from the two repository
  **Actions secrets** below. Missing or malformed secrets stop the job before
  dependency installation with setup instructions. A wrong password or missing
  alias fails the key preflight before the native build. This mode does not
  generate a replacement key.

| Repository secret | Value |
| --- | --- |
| `PARSIWORD_ANDROID_PREVIEW_KEYSTORE_BASE64` | Base64 of the existing external `preview.keystore` file; alias `parsiword-preview`. |
| `PARSIWORD_ANDROID_PREVIEW_PASSWORD` | Existing keystore/key password, one line without a trailing newline. The same password must unlock both. |

Retain the original key securely. On a local machine, the following Python
command writes a base64 file beside a private keystore; put that file's contents
in the first repository secret and delete the temporary base64 file afterward.
Do not put the key, password or base64 file in this repository or an artifact.

```sh
python -c "import base64,pathlib; p=pathlib.Path('/private/path/preview.keystore'); p.with_suffix('.base64').write_text(base64.b64encode(p.read_bytes()).decode('ascii'))"
```

### Configured stable identity, 2026-10-26

The earlier Preview key was not available on the current machine. With the
user's explicit approval, a new RSA 3072-bit Preview key was created outside
the repository in `~/.local/share/parsiword/signing`, with a random password
and access restricted to the local user and Windows SYSTEM. The keystore and
password were encrypted with the repository's public key and saved directly
to the two Actions secrets above; metadata reads confirmed both updates.
No private key, password or base64 payload was printed or committed.

Its public certificate SHA256 is
`4ca8a6b1c8785dd4de988052bc40b67fe4e70d342728c9c79507d1f38e8c446a`.
It differs from the historical 0.4.7 Preview certificate below, so the first
APK using this identity requires reinstalling that older Preview application;
later APKs can use this new stable identity for updates. Preserve both local
private files and the repository secrets. Configuring the secrets did not run
the Android workflow or build an APK.

A successful stable-key run publishes a visible GitHub **prerelease** with
the installable signed ARM64 `.apk`, its verification report and Android build
information. Download the APK directly from the release's **Assets** section;
there is no need to download or unzip an Actions artifact. This remains an
ARM64 **Preview** application, not a Play Store or production release.

Android, Windows and VS Code builds from the same source version and exact commit share
the tag `native-preview-v<version>-<full-commit-SHA>`. The helper creates that
tag at the built commit, verifies its target before reusing it, and adds the
platform's assets. Concurrent builds can add their respective assets to the
same release. Rerunning the same commit replaces that platform's assets; a
different commit receives a different tag even if the version is unchanged.
Verification and build-information assets use platform-specific names so
Android and Windows do not overwrite each other's reports. Release notes link
to the source commit and workflow run; Android build information includes
version code, signing mode, APK SHA256 and signing certificate SHA256.

The APK job grants its GitHub token `contents: write` for release publication;
all signing material remains excluded from release assets. Publication failure
fails the job instead of claiming that an artifact upload was a release.
Both signing modes also upload one workflow artifact containing the APK,
`.verification.json` and `BUILD-INFO.md`, retained for 14 days. These artifacts
remain a fallback if publication fails, and are the only download path for
ephemeral builds.

A stable key is necessary for update compatibility, along with the same
application ID and suitable version code; compare the certificate with the
previous APK. Publishing does not raise the version code automatically. Physical
installation, launch, keyboard and insets remain phone checks.

The workflow and helper were validated locally without dispatching Actions.
No new Android APK was built as part of this workflow setup: the current local
environment has no Android SDK/NDK or Rust toolchain configured. Earlier APK
evidence below describes those earlier builds.

The environment and signing setup follow the official
[Tauri Android prerequisites](https://v2.tauri.app/start/prerequisites/#android)
and [Android app signing guidance](https://developer.android.com/studio/publish/app-signing).

## Existing local Preview build

For the current 0.4.7 test build, use `pnpm run android:test-apk /path/output.apk`.
It builds an optimized, nondebug ARM64 release with application ID
`app.parsiword.mobile.preview` and label `ParsiWord Preview`, so it can coexist
with the normal app. The prior signing key was absent from the source archive.
The test-build script creates/reuses a separate key outside the repository in
`PARSIWORD_SIGNING_DIR` (default `~/.local/share/parsiword/signing`); retain that
directory and its password file for later Preview updates. Normal
`pnpm run android:apk` keeps `app.parsiword.mobile`. The distribution signing key
is not part of the source. Version 0.4.7 uses code 4007 and reuses the 0.4.6
Preview key for updates. See [0.4.7](releases/0.4.7.md) for the current status
and build instructions; previous deliveries remain documented in their release notes.

The native Android parent pads the WebView for system bars and display cutouts.
After padding, those insets are consumed before dispatch to the WebView so CSS
does not apply the same safe area twice. Keyboard (IME) insets remain available
to children. Browser viewport checks do not exercise this Android dispatch path.

The delivered 0.4.7 Preview APK is 9,436,787 bytes. Its certificate matches the
0.4.6 Preview APK, while the version code increases from 4006 to 4007. The
[final verification report](releases/0.4.7-preview-verification.json) confirms
v2/v3 signatures, ARM64-only output, nondebug/nontest flags, ZIP CRC, the final
frontend and 16 KiB ZIP/ELF alignment. Gofile's upload size and MD5 match the
local file. Download and SHA256 are in the [release note](releases/0.4.7.md).
Physical phone installation and keyboard/sticky behavior remain a user check;
no emulator or new desktop binary was used for this release.

## Historical distribution, 0.2.4 and 0.4.0

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

## Follow-up: device confirmation and 0.4.0

The user confirmed that 0.2.4 installs and works on their Android phone.
Emulator testing was stopped at their request before installation and launch
were verified in the emulator. That incomplete emulator attempt is not device
validation; the installation confirmation above came from the user's phone.

0.4.0 adds offline LaTeX and Mermaid. Its release APK remains ARM64-only,
API 24+, nondebug, nontest, with the same application ID and preview signing
certificate. Version code is 4000 (greater than the previous 2004). The
signed file is 7,695,931 bytes (about 7.34 MiB). The increase includes the local
math/diagram engines and math fonts; the Google catalogue is still only a
small family list, not all font files. The same APK verification script passed,
including 16 KiB ELF alignment and checking the current frontend bundle.
Source/license resources for the math library are embedded among Tauri's
frontend resources in the native .so; they are not separate APK asset entries.
A new on-phone check for 0.4.0 remains pending.

## 0.4.1

Signed APK: 8,740,411 bytes, version code 4001, same certificate as 0.2.4/0.4.0,
ARM64 only, nondebug and nontest. The increase over 0.4.0 includes full offline
Noto Sans Mono and STIX Two Math assets needed for portable code/math exports.
It does not include all Google Fonts. Metadata/signature/ZIP/16 KiB alignment
and current clean-UI/offline-font-resource presence checks pass. This version
also migrates old comparison/system-font draft settings while keeping text.
Actual installation/Word Android rendering of 0.4.1 remains a phone check;
no new emulator was started after the user's earlier instruction to stop it.
