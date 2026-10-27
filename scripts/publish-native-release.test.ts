import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { nativeAssets, publishNativeRelease } from './publish-native-release.mjs';

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const sha = 'a'.repeat(40), version = '0.4.7', tag = `native-preview-v${version}-${sha}`;
async function fixture(platform = 'Windows') {
  const root = await mkdtemp(join(tmpdir(), 'parsiword-release-test-')); created.push(root);
  await mkdir(join(root, 'apps/parsiword/src-tauri'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ version }));
  await writeFile(join(root, 'apps/parsiword/src-tauri/tauri.conf.json'), JSON.stringify({ version }));
  const env = { GH_TOKEN: 'fixture-only', GH_REPO: 'fixture/repository', GITHUB_SHA: sha, GITHUB_RUN_ID: '42', RUNNER_OS: platform, RUNNER_TEMP: root, GITHUB_STEP_SUMMARY: join(root, 'summary.md'), SIGNING_MODE: 'stable', APK_PATH: 'android/output.apk' };
  return { root, env };
}
async function put(root: string, path: string, content = 'fixture installer bytes') {
  const file = join(root, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, content); return file;
}
function api(options: { existing?: boolean; race?: boolean; target?: string; failUpload?: boolean; forbidden?: boolean } = {}) {
  let exists = options.existing ?? false;
  const captured: { names: string[]; info: string; sums: string }[] = [];
  const gh = vi.fn(async (args: string[]) => {
    if (args[0] === 'api' && args[1].includes('/releases/tags/')) {
      if (options.forbidden) return { status: 1, stdout: '', stderr: 'Forbidden (HTTP 403)' };
      return exists ? { status: 0, stdout: JSON.stringify({ tag_name: tag, draft: false, prerelease: true }), stderr: '' } : { status: 1, stdout: '', stderr: 'Not Found (HTTP 404)' };
    }
    if (args[0] === 'release' && args[1] === 'create') { exists = true; return { status: options.race ? 1 : 0, stdout: '', stderr: options.race ? 'Already exists (HTTP 422)' : '' }; }
    if (args[0] === 'api' && args[1].includes('/commits/')) return { status: 0, stdout: (options.target ?? sha) + '\n', stderr: '' };
    if (args[0] === 'release' && args[1] === 'upload') {
      const files = args.slice(3, args.indexOf('--repo'));
      captured.push({ names: files.map(file => file.split(/[\\/]/).at(-1)!), info: await readFile(files.find(file => file.endsWith('BUILD-INFO.md'))!, 'utf8'), sums: await readFile(files.find(file => file.endsWith('SHA256SUMS.txt'))!, 'utf8') });
      return { status: options.failUpload ? 1 : 0, stdout: '', stderr: options.failUpload ? 'Upload failed (HTTP 502)' : '' };
    }
    throw Error(`Unexpected command ${args.join(' ')}`);
  });
  return { gh, captured };
}

describe('native release publication with real installer files and isolated GitHub transport', () => {
  it.each([['Windows', [['nsis/setup.exe']]], ['Linux', [['deb/app.deb', 'appimage/app.AppImage']]], ['macOS', [['dmg/app.dmg']]]] as const)('publishes only the required %s installers with provenance and matching hashes', async (platform, [paths]) => {
    const f = await fixture(platform);
    for (const path of paths) await put(f.root, `apps/parsiword/src-tauri/target/release/bundle/${path}`);
    await put(f.root, 'signing/preview.keystore', 'never upload');
    const transport = api();
    const result = await publishNativeRelease({ ...f, kind: 'desktop', gh: transport.gh });
    expect(result.tag).toBe(tag);
    expect(result.assets).toHaveLength(paths.length + 2);
    expect(result.assets.every((name: string) => !/keystore|password/.test(name))).toBe(true);
    expect(transport.captured[0].info).toContain(sha);
    expect(transport.captured[0].info).toContain('/actions/runs/42');
    expect(transport.captured[0].sums).toContain(createHash('sha256').update('fixture installer bytes').digest('hex'));
    expect(await readFile(f.env.GITHUB_STEP_SUMMARY, 'utf8')).toContain(result.url);
    expect((await readdir(f.root)).some(name => name.startsWith('parsiword-native-release-'))).toBe(false);
  });
  it('reuses the other platform’s release without creating another tag', async () => {
    const f = await fixture(); await put(f.root, 'apps/parsiword/src-tauri/target/release/bundle/nsis/setup.exe');
    const transport = api({ existing: true });
    await publishNativeRelease({ ...f, kind: 'desktop', gh: transport.gh });
    expect(transport.gh.mock.calls.some(([args]) => args[0] === 'release' && args[1] === 'create')).toBe(false);
  });
  it('handles another platform creating the shared release concurrently', async () => {
    const f = await fixture(); await put(f.root, 'apps/parsiword/src-tauri/target/release/bundle/nsis/setup.exe');
    const transport = api({ race: true });
    await expect(publishNativeRelease({ ...f, kind: 'desktop', gh: transport.gh })).resolves.toMatchObject({ tag });
  });
  it.each([{ target: 'b'.repeat(40) }, { forbidden: true }, { failUpload: true }])('fails the workflow on tag/permission/upload errors: %j', async options => {
    const f = await fixture(); await put(f.root, 'apps/parsiword/src-tauri/target/release/bundle/nsis/setup.exe');
    const transport = api(options);
    await expect(publishNativeRelease({ ...f, kind: 'desktop', gh: transport.gh })).rejects.toThrow();
    expect((await readdir(f.root)).some(name => name.startsWith('parsiword-native-release-'))).toBe(false);
    if (!options.failUpload) expect(transport.captured).toHaveLength(0);
  });
  it('refuses incomplete Linux packaging instead of publishing just the first available format', async () => {
    const f = await fixture('Linux'); await put(f.root, 'apps/parsiword/src-tauri/target/release/bundle/deb/app.deb');
    await expect(nativeAssets('desktop', f.root, f.env)).rejects.toThrow();
  });
  it('publishes the verified stable ARM64 APK and report but rejects mismatches and ephemeral keys', async () => {
    const f = await fixture('Linux');
    await put(f.root, f.env.APK_PATH);
    const report = { sha256: createHash('sha256').update('fixture installer bytes').digest('hex'), architecture: 'arm64-v8a', signatureVerified: true, debuggable: false, testOnly: false, certificateSha256: 'c'.repeat(64) };
    await put(f.root, 'android/output.verification.json', JSON.stringify(report));
    await put(f.root, 'android/BUILD-INFO.md', 'Stable Preview fixture');
    const transport = api();
    const result = await publishNativeRelease({ ...f, kind: 'android', gh: transport.gh });
    expect(result.assets).toContain('output.apk');
    expect(result.assets).toContain('ParsiWord-Android-verification.json');
    expect(transport.captured[0].info).toContain(report.certificateSha256);
    await expect(nativeAssets('android', f.root, { ...f.env, SIGNING_MODE: 'ephemeral' })).rejects.toThrow('Only stable');
    await put(f.root, f.env.APK_PATH, 'different bytes');
    await expect(nativeAssets('android', f.root, f.env)).rejects.toThrow('does not match');
  });

  it('publishes the VSIX matching the extension version and records its independent version', async () => {
    const f = await fixture();
    await put(f.root, 'apps/vscode/package.json', JSON.stringify({ version: '0.1.7' }));
    await put(f.root, 'artifacts/parsiword-vscode-0.1.6.vsix', 'stale package');
    await put(f.root, 'artifacts/parsiword-vscode-0.1.7.vsix', 'current extension bytes');
    const transport = api({ existing: true });
    const result = await publishNativeRelease({ ...f, kind: 'vscode', gh: transport.gh });
    expect(result).toMatchObject({ tag, assets: ['parsiword-vscode-0.1.7.vsix', 'ParsiWord-VSCode-BUILD-INFO.md', 'ParsiWord-VSCode-SHA256SUMS.txt'] });
    expect(transport.captured[0].info).toContain('VS Code extension version: 0.1.7');
    expect(transport.captured[0].sums).toContain(createHash('sha256').update('current extension bytes').digest('hex'));
    expect(transport.gh.mock.calls.some(([args]) => args[0] === 'release' && args[1] === 'create')).toBe(false);
  });

  it.each([undefined, ''])('refuses a missing or empty current VSIX, even when a stale package exists: %j', async content => {
    const f = await fixture();
    await put(f.root, 'apps/vscode/package.json', JSON.stringify({ version: '0.1.7' }));
    await put(f.root, 'artifacts/parsiword-vscode-0.1.6.vsix', 'stale package');
    if (content !== undefined) await put(f.root, 'artifacts/parsiword-vscode-0.1.7.vsix', content);
    const transport = api();
    await expect(publishNativeRelease({ ...f, kind: 'vscode', gh: transport.gh })).rejects.toThrow();
    expect(transport.gh).not.toHaveBeenCalled();
  });

  it('adds concurrent Android, Windows and VS Code builds to one commit release with distinct assets', async () => {
    const f = await fixture();
    await put(f.root, 'apps/parsiword/src-tauri/target/release/bundle/nsis/setup.exe');
    await put(f.root, f.env.APK_PATH);
    await put(f.root, 'android/output.verification.json', JSON.stringify({ sha256: createHash('sha256').update('fixture installer bytes').digest('hex'), architecture: 'arm64-v8a', signatureVerified: true, debuggable: false, testOnly: false, certificateSha256: 'c'.repeat(64) }));
    await put(f.root, 'android/BUILD-INFO.md', 'Stable Preview fixture');
    await put(f.root, 'apps/vscode/package.json', JSON.stringify({ version: '0.1.7' }));
    await put(f.root, 'artifacts/parsiword-vscode-0.1.7.vsix');
    const transport = api();
    const results = await Promise.all(['android', 'desktop', 'vscode'].map(kind => publishNativeRelease({ ...f, kind, gh: transport.gh })));
    expect(new Set(results.map(result => result.tag))).toEqual(new Set([tag]));
    const names = results.flatMap(result => result.assets);
    expect(names).toEqual(expect.arrayContaining(['output.apk', 'setup.exe', 'parsiword-vscode-0.1.7.vsix']));
    expect(new Set(names).size).toBe(names.length);
    expect(transport.captured).toHaveLength(3);
    expect((await readdir(f.root)).some(name => name.startsWith('parsiword-native-release-'))).toBe(false);
  });
});
