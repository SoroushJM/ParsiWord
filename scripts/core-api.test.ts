import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('public core entries', () => {
  it('keeps explicit entries beside the existing wildcard and root compatibility API', () => {
    const { exports } = JSON.parse(
      readFileSync('packages/core/package.json', 'utf8'),
    );
    expect(exports['.']).toBe('./src/index.ts');
    expect(exports['./*']).toBe('./src/*');
    for (const key of [
      'document',
      'host',
      'ui',
      'errors',
      'adapters/word',
      'adapters/pdf',
      'adapters/fonts',
      'adapters/files',
      'styles.css',
    ]) {
      expect(exports[`./${key}`]).toMatch(/^\.\/src\//);
    }
  });
  it('bundles and executes the public host entry in plain Node without browser globals or output runtimes', async () => {
    const result = await build({
      stdin: {
        contents: `import { configureHost, editorHost, minimalChange, isHostMessage, defaultSettings, ParsiWordError, getErrorCode } from '@parsiword/core/host';
        if (typeof window !== 'undefined' || typeof document !== 'undefined') throw Error('Browser globals present');
        configureHost({kind:'vscode',version:'test'});
        if (editorHost().version !== 'test' || minimalChange('ab','aXb').text !== 'X') throw Error('Host API unavailable');
        if (!isHostMessage({type:'response',id:1,errorCode:'FONT_NETWORK'}) || !defaultSettings.fontFamily) throw Error('Contracts unavailable');
        if (getErrorCode(new ParsiWordError('FONT_NETWORK')) !== 'FONT_NETWORK') throw Error('Errors unavailable');`,
        resolveDir: `${process.cwd()}/apps/vscode/src`,
        sourcefile: 'host-smoke.ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      metafile: true,
    });
    const execution = spawnSync(process.execPath, ['--input-type=module'], {
      input: result.outputFiles[0].text,
      encoding: 'utf8',
    });
    expect(execution.error).toBeUndefined();
    expect(execution.stderr).toBe('');
    expect(execution.status).toBe(0);
    const inputs = Object.keys(result.metafile!.inputs).join('\n');
    expect(inputs).not.toMatch(
      /(?:react|pdfkit|converter\.ts|font-catalogue|\.ttf|\.css)/,
    );
  });
});
