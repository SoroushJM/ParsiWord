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

## 0.4.1 follow-up

The production interface no longer exposes sample/diagnostic/comparison buttons.
Old comparison drafts migrate to proper paragraph/run direction without losing
text. System-only fonts are no longer selectable; existing such selections
migrate to the bundled font. All UI export paths load embeddable selected,
Persian fallback, code and math faces as needed before creating Word.

801 unit tests and seven Chromium plus seven WebKit tests pass. WebKit runs in
Linux with an iPhone viewport; this is useful frontend coverage, not an iOS
native-runtime test. Native Windows launch and iOS compilation still require
their actual hosts. No authenticated GitHub runner is available in this session;
no remote was created or pushed. The prepared workflows now run browser checks
and include a macOS desktop target (13.3+, matching Safari 16.4).

The font portability test restores all ODTTF bytes and compares the complete
fonts to their source files. The accompanying verification script independently
checks font declarations, relationship targets, SFNT data, embedding permission
and full file hashes. The sample carries six faces across selected/Persian,
code, mathematics and rare-symbol fonts. Library defaults retain embedded fonts
when Word saves the document again.

Final 0.4.1 native checks: the actual Linux release app imported a Markdown file,
previewed it and saved DOCX with native dialogs. All six embedded faces were
restored and matched their original source bytes. A local AppImage assembled
from the same final release binary also launched, previewed the draft, saved
Word and passed the same full-font check; it is not publicly distributed.
The Windows release binary is AMD64 and contains the latest frontend/font
assets; NSIS compilation completed. An extra 7-Zip inspection has incomplete
support for this NSIS command set and is not treated as installer execution
validation. Windows OS execution still needs a Windows host.
Android 0.4.1 is ARM64-only, version code 4001, signed with the same preview
certificate. The signed 8,740,411-byte APK passed metadata, signature, ZIP,
16 KiB ELF/alignment and latest-frontend/offline-font-asset checks. No new
Android emulator was started, as requested. The new APK phone check is pending.

## 0.4.2 Android follow-up

The first-launch draft now contains a difficult mixed-direction Markdown sample,
five equations and two Mermaid diagrams. Existing drafts, including empty ones,
are retained. A n-ary equation conversion defect exposed by the sample was fixed.
804 unit tests, six Chromium tests and two WebKit tests pass after that fix.
The ARM64-only APK has version code 4002 and the same signing certificate; its
signature, metadata, ZIP, latest frontend and 16 KiB alignment checks pass.
Phone installation remains pending. Desktop binaries are still the 0.4.1 builds;
their source receives the same sample and math correction on its next build.
Downloads and details: [0.4.2](releases/0.4.2.md).

## 0.4.3 syntax highlighting and corpus

The 36 common highlight.js grammars are bundled offline. Shared tokens supply
React preview spans and editable colored Word runs, with language captions.
The starter includes S01–S14/E01, all 72 delimiter rows, the previous math and
Mermaid examples, and a code sample for every grammar. 847 unit tests and ten
tests in each Chromium and WebKit passed. Both full browser exports passed
independent restoration and complete-byte comparison of all six font faces.

Android is ARM64-only, version code 4003, 8,797,755 bytes. Signature continuity,
ZIP metadata, latest frontend and 16 KiB alignment checks pass. The increase
from 0.4.2 is 53,248 bytes (52 KiB). Phone installation remains pending.
Linux DEB and Windows NSIS packages were rebuilt. The actual release Linux app
imported the full corpus, previewed it and saved Word through native dialogs;
the saved native equations, diagrams, syntax colors and fonts were checked.
Windows AMD64 linking/NSIS generation and latest-frontend checks succeeded;
Windows OS execution and Apple builds still require their respective hosts.
No Android emulator or Android x86 build was used. Downloads: [0.4.3](releases/0.4.3.md).
