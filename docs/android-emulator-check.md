# Emulator check of Android 0.2.4

The current environment is Linux x86_64 with no `/dev/kvm`. The installed Android
emulator was started with the existing Android 11 Google APIs AVD, software CPU
emulation, SwiftShader, no audio/window/snapshots, and no Vulkan. No x86 Android
application was built: the test uses the published ARM64 APK unchanged.

The emulator connects to ADB and reports ARM64 support through
`libndk_translation.so`. The first installation attempt pushed the complete APK
but returned `Can't find service: package`: Android's package-manager service had
not started yet. This is not a successful installation and does not establish an
APK defect. Boot completion, installation and launch verification are pending.

Logs are kept outside the repository under `/workspace/toolchains/`:
`emulator-check.log`, `emulator-install-024.log`, `emulator-boot-state.log`.
The existing APK signature/CRC/ABI/ELF checks remain documented in
`android-packaging.md`.

The user subsequently confirmed that Android 0.2.4 installs and works on their
own phone, and explicitly asked to stop emulator testing. The emulator was
stopped. Physical-phone installation/operation is confirmed by the user;
emulator installation was not completed and must not be described as passed.
