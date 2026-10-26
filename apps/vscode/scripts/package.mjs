import { createVSIX } from '@vscode/vsce';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../../../', import.meta.url));
await mkdir(new URL('../../../artifacts/', import.meta.url), { recursive: true });
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await createVSIX({ cwd: root + 'apps/vscode', packagePath: root + `artifacts/parsiword-vscode-${version}.vsix`, dependencies: false, skipLicense: true, allowUnusedFilesPattern: true });
