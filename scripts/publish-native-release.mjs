// Shared by automatic and manually requested builds. No credentials or signing files
// enter the staging directory, release notes, checksums, or uploaded assets.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, copyFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireValue = (value, pattern, label) => {
  if (typeof value !== 'string' || !pattern.test(value)) throw Error(`Invalid or missing ${label}.`);
  return value;
};
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function installers(root, directory, suffix) {
  const path = join(root, 'apps/parsiword/src-tauri/target/release/bundle', directory);
  const files = (await readdir(path)).filter(name => name.endsWith(suffix)).map(name => join(path, name));
  if (!files.length) throw Error(`Missing required ${directory} ${suffix} installer; refusing an empty release.`);
  return files;
}

export async function nativeAssets(kind, root, env) {
  if (kind === 'vscode') {
    const version = requireValue(JSON.parse(await readFile(join(root, 'apps/vscode/package.json'), 'utf8')).version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'extension version');
    return { platform: 'VSCode', files: [join(root, 'artifacts', `parsiword-vscode-${version}.vsix`)], version };
  }
  if (kind === 'android') {
    if (env.SIGNING_MODE !== 'stable') throw Error('Only stable-key Android builds may be published to Releases.');
    const apk = resolve(root, requireValue(env.APK_PATH, /\.apk$/, 'APK_PATH'));
    const reportPath = apk.replace(/\.apk$/, '.verification.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    if (report.sha256 !== await sha256(apk) || report.signatureVerified !== true || report.architecture !== 'arm64-v8a'
      || report.debuggable !== false || report.testOnly !== false) throw Error('APK verification report does not match a verified ARM64 release APK.');
    return { platform: 'Android', files: [apk], reportPath, buildInfo: join(dirname(apk), 'BUILD-INFO.md'), certificate: report.certificateSha256 };
  }
  if (kind !== 'desktop') throw Error('Choose android, desktop or vscode.');
  const definitions = { Windows: [['nsis', '.exe']], Linux: [['deb', '.deb'], ['appimage', '.AppImage']], macOS: [['dmg', '.dmg']] };
  const required = definitions[env.RUNNER_OS];
  if (!required) throw Error('Unsupported desktop runner.');
  const files = (await Promise.all(required.map(([directory, suffix]) => installers(root, directory, suffix)))).flat();
  return { platform: env.RUNNER_OS, files };
}

function cli(args, env) {
  const result = spawnSync('gh', args, { encoding: 'utf8', env, windowsHide: true, maxBuffer: 2_000_000 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export async function publishNativeRelease({ kind, root = repositoryRoot, env = process.env, gh = args => cli(args, env) }) {
  const repository = requireValue(env.GH_REPO, /^[\w.-]+\/[\w.-]+$/, 'GH_REPO');
  const commit = requireValue(env.GITHUB_SHA, /^[a-f0-9]{40}$/, 'GITHUB_SHA');
  if (!env.GH_TOKEN) throw Error('A GitHub token with contents:write is required.');
  const version = requireValue(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'package version');
  const nativeVersion = JSON.parse(await readFile(join(root, 'apps/parsiword/src-tauri/tauri.conf.json'), 'utf8')).version;
  if (nativeVersion !== version) throw Error('Native and workspace versions disagree.');
  const assets = await nativeAssets(kind, root, env);
  for (const path of assets.files) if (!(await stat(path)).isFile() || !(await stat(path)).size) throw Error('Release asset is missing or empty.');
  const tag = `native-preview-v${version}-${commit}`;
  const endpoint = `repos/${repository}/releases/tags/${tag}`;
  const run = async args => {
    const result = await gh(args);
    if (result.status !== 0) throw Error(`GitHub ${args[0]} failed: ${result.stderr || 'unknown CLI failure'}`);
    return result.stdout;
  };
  const find = async () => {
    const result = await gh(['api', endpoint]);
    if (result.status === 0) return JSON.parse(result.stdout);
    if (/HTTP 404/.test(result.stderr)) return undefined;
    throw Error(`Cannot inspect native release: ${result.stderr}`);
  };
  const staging = await mkdtemp(join(env.RUNNER_TEMP || tmpdir(), 'parsiword-native-release-'));
  try {
    const upload = [];
    for (const path of assets.files) {
      const copy = join(staging, basename(path));
      await copyFile(path, copy); upload.push(copy);
    }
    if (assets.reportPath) {
      const path = join(staging, `ParsiWord-${assets.platform}-verification.json`);
      await copyFile(assets.reportPath, path); upload.push(path);
    }
    const identities = await Promise.all(upload.map(async path => `${await sha256(path)}  ${basename(path)}`));
    const buildInfo = join(staging, `ParsiWord-${assets.platform}-BUILD-INFO.md`);
    const workflowUrl = `https://github.com/${repository}/actions/runs/${requireValue(env.GITHUB_RUN_ID, /^\d+$/, 'GITHUB_RUN_ID')}`;
    await writeFile(buildInfo, [
      `# ParsiWord ${assets.platform} Preview`, '', `Version: ${version}`, `Commit: ${commit}`, `Build: ${workflowUrl}`,
      ...(assets.version ? [`VS Code extension version: ${assets.version}`] : []),
      ...(assets.certificate ? [`Certificate SHA256: ${assets.certificate}`] : []), '',
      ...(assets.buildInfo ? [await readFile(assets.buildInfo, 'utf8')] : [kind === 'vscode' ? 'VS Code extension package built by GitHub Actions. Install the .vsix with Extensions: Install from VSIX.' : 'Native installer built by GitHub Actions. Device installation and launch are not established by packaging.']),
      '', '## Asset SHA256', '', ...identities, '',
    ].join('\n'));
    upload.push(buildInfo);
    const sums = join(staging, `ParsiWord-${assets.platform}-SHA256SUMS.txt`);
    await writeFile(sums, [...identities, `${await sha256(buildInfo)}  ${basename(buildInfo)}`, ''].join('\n'));
    upload.push(sums);
    let release = await find();
    if (!release) {
      const notes = join(staging, 'release-notes.md');
      await writeFile(notes, [
        `Preview packages for ParsiWord ${version}.`, '', `Source commit: ${commit}`, '',
        'Download packages directly from Assets. Pushes to main build Android ARM64, Windows and the VS Code extension. Each successful platform build adds its files to this release; an absent platform has not been published.',
        'Platform BUILD-INFO and SHA256SUMS files identify each build and its downloads.', '',
        'Android: ARM64 Android 7+ Preview, signed with the configured stable Preview key. Older installations signed with a different key require reinstallation.',
        'Windows: NSIS installer, without a Windows publisher signing certificate. macOS builds are not notarized.', '',
        'VS Code: download the .vsix, then run Extensions: Install from VSIX in VS Code.', '',
      ].join('\n'));
      const created = await gh(['release', 'create', tag, '--repo', repository, '--target', commit, '--title', `ParsiWord ${version} Preview (${commit.slice(0, 12)})`, '--prerelease', '--latest=false', '--notes-file', notes]);
      // Another platform can create the same release between our GET and POST.
      release = await find();
      if (!release) throw Error(`Native release creation failed: ${created.stderr}`);
    }
    if (release.draft || !release.prerelease || release.tag_name !== tag) throw Error('Refusing an unexpected or draft release.');
    const actual = (await run(['api', `repos/${repository}/commits/${tag}`, '--jq', '.sha'])).trim();
    if (actual !== commit) throw Error('Release tag points to a different commit; no assets uploaded.');
    await run(['release', 'upload', tag, ...upload, '--repo', repository, '--clobber']);
    const url = `https://github.com/${repository}/releases/tag/${tag}`;
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `\n## ${assets.platform} release published\n\n[Download installers](${url})\n\n${upload.map(path => `- ${basename(path)}`).join('\n')}\n`);
    return { tag, url, assets: upload.map(path => basename(path)) };
  } finally {
    // mkdtemp creates this unique directory directly beneath the runner temp.
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishNativeRelease({ kind: process.argv[2] }).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
