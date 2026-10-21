# Platform builds

The same React/TypeScript converter and Tauri native commands are used on all
platforms. File selection/save use the official dialog and fs plugins; on iOS
imports are copied into the app sandbox, and desktop/URI filenames are retained.
The Vite alias uses `fileURLToPath` so Windows drive-letter paths work. The web
bundle targets both Chrome 87 and Safari 16.4. iOS deployment is 16.4 or newer.

## Build commands

- Android: `npm run android:apk`, ARM64 only. The user confirmed 0.2.4 installs
  and works on their phone. Emulator testing was stopped at their request.
- Linux: install the Tauri 2 GTK/WebKitGTK 4.1 development dependencies, then
  `npm run linux:build`. This produces Debian and AppImage packages. Runtime
  dependencies and libc compatibility depend on the distribution used to build;
  the supplied CI uses Ubuntu 22.04 for a broader compatibility baseline.
- Windows: install MSVC build tools and WebView2, then `npm run windows:build`.
  The NSIS installer runs per-user and can download WebView2 when it is missing.
- iOS: on macOS with Xcode and its command-line tools, run `npm ci`,
  `npm run ios:init`, then `npm run ios:simulator` for an unsigned Apple Silicon
  simulator build. An actual device/TestFlight build also needs an Apple
  development team and signing provisioning; run `npm run ios:build` after
  configuring those outside the repository.

The two manually triggered GitHub Actions workflows build Linux/Windows and the
iOS simulator on their respective native runners. These files are prepared;
they have not been executed from this local-only Git repository. No remote
repository was created or pushed. Linux does not provide the iOS Tauri command
or Xcode: no iOS binary has been built or runtime-tested here.

The Android ABI restriction applies only to Android. A normal x86_64 Linux or
Windows desktop build is a separate product and does not add x86 to the APK.

## Recorded 0.3.0 validation

785 unit tests and four Playwright tests pass. TypeScript and Vite builds pass.
The Linux debug desktop executable was compiled in a Debian 13 environment,
launched under Xvfb with its normal WebKit sandbox, and used to open a Markdown
file with the native file dialog and save a real DOCX through the native save
dialog. The saved ZIP and expected Persian/English contents were verified.
`cargo xwin check --target x86_64-pc-windows-msvc` passed with the MSVC SDK/CRT.
Windows executable linking/launch and the prepared GitHub workflows have not
yet been verified; no iOS build is claimed.

## Recorded 0.4.0 validation

798 unit tests and all six Playwright tests pass. The browser test blocks
external HTTP requests while rendering/exporting equations, a flowchart and
a sequence diagram. The resulting DOCX was visually inspected in LibreOffice.
The empty integral operand found there was fixed and regression-tested.

The release Linux app was compiled on Debian 13 x86_64, launched under Xvfb
with its normal WebKit sandbox, and used with native dialogs to open the rich
Markdown demo and save a DOCX containing two native equations and two PNG
diagrams. This also exercised local SVG-to-PNG conversion in WebKitGTK.
The bundle category was corrected to Tauri's `Productivity` (which maps to
the Linux Office category) after the real packager rejected `Office`.
The binary requires glibc 2.34 and WebKitGTK 4.1; this distribution was built
and runtime-tested on Debian 13. Use the Ubuntu 22.04 workflow for binaries
with its older distribution baseline; that workflow has not been run here.

Windows MSVC x86_64 release linking and NSIS installer generation succeeded
using cargo-xwin on Linux. The PE machine type was checked as AMD64. The
installer is unsigned and has not been installed/launched on Windows here;
a native Windows runner workflow is supplied for native-host validation.
iOS remains configured but unbuilt and untested: macOS/Xcode are unavailable.
The new Android ARM64 release passes signature/ABI/alignment checks, including
certificate continuity from the user-confirmed 0.2.4. A phone test of 0.4.0
is still pending.

Both the DEB and AppImage were produced. The AppImage tool's automatic runtime
download failed in this proxied environment; supplying the same official
AppImage type2 runtime via `appimagetool --runtime-file` completed packaging.
The 107 MiB AppImage is a local build artifact, not part of the public downloads
or a tested portability claim. The smaller DEB is the published Linux package.
