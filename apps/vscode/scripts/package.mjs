import { createVSIX } from '@vscode/vsce';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const root = fileURLToPath(new URL('../../../', import.meta.url));
await mkdir(new URL('../../../artifacts/', import.meta.url), { recursive: true });
await createVSIX({ cwd: root + 'apps/vscode', packagePath: root + 'artifacts/parsiword-vscode-0.1.0.vsix', dependencies: false, skipLicense: true, allowUnusedFilesPattern: true });
