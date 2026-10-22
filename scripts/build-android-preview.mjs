// Release-mode ARM64 test APK, installed alongside the normal application.
// Keep the generated preview signing key outside the repository and retain it
// for future preview updates. It is unrelated to the distribution signing key.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Set ANDROID_HOME to an Android SDK with build-tools 36.0.0.');
const buildTools = join(sdk, 'build-tools', '36.0.0');
const signingDir = resolve(process.env.PARSIWORD_SIGNING_DIR || join(homedir(), '.local/share/parsiword/signing'));
mkdirSync(signingDir, { recursive: true, mode: 0o700 });
chmodSync(signingDir, 0o700);
const password = join(signingDir, 'preview-password');
const keystore = join(signingDir, 'preview.keystore');
const output = resolve(process.argv[2] || join(root, 'artifacts', `ParsiWord-${version}-preview-arm64.apk`));
mkdirSync(dirname(output), { recursive: true });

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
if (!existsSync(keystore)) {
  if (!existsSync(password)) writeFileSync(password, `${randomBytes(36).toString('base64url')}\n`, { mode: 0o600 });
  run('keytool', ['-genkeypair', '-noprompt', '-keystore', keystore,
    '-storepass:file', password, '-keypass:file', password, '-alias', 'parsiword-preview',
    '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
    '-dname', 'CN=ParsiWord Preview, OU=Local preview, O=ParsiWord']);
  chmodSync(keystore, 0o600);
}
if (!existsSync(password)) throw new Error('The preview keystore password file is missing. Restore it alongside the preview key.');

run('npm', ['run', 'tauri', '--', 'android', 'build', '--apk', '--target', 'aarch64', '--ci'], {
  ...process.env, ORG_GRADLE_PROJECT_parsiwordPreview: 'true',
});
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const apks = files(join(root, 'apps/parsiword/src-tauri/gen/android/app/build/outputs/apk'))
  .filter(path => path.includes('/release/') && path.endsWith('-unsigned.apk'))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
if (!apks.length) throw new Error('The ARM64 unsigned release APK was not generated.');
const aligned = output.replace(/\.apk$/, '.aligned.apk');
run(join(buildTools, 'zipalign'), ['-f', '-P', '16', '4', apks[0], aligned]);
run(join(buildTools, 'apksigner'), ['sign', '--ks', keystore, '--ks-key-alias', 'parsiword-preview',
  '--ks-pass', `file:${password}`,
  '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
  '--out', output, aligned]);
run('python', ['scripts/verify-android-apk.py', output,
  '--expected-package', 'app.parsiword.mobile.preview', '--report', output.replace(/\.apk$/, '.verification.json')]);
