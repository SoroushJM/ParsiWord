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
