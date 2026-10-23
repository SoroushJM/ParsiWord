import { describe, expect, it } from 'vitest';
import {
  checkArchitecture,
  importEdges,
  readArchitectureFiles,
} from './check-architecture.mjs';
import { readFileSync } from 'node:fs';

const core = 'packages/core/src/';
const exports = {
  './host': './src/host-api.ts',
  './ui': './src/ui.ts',
  './*': './src/*',
};

describe('architecture import guard', () => {
  it('parses real static, re-export, dynamic, require and type edges while ignoring comments', () => {
    const edges = importEdges(
      `// import 'vscode';
      import type { A } from './types';
      export { type B } from './model';
      export * from '@tauri-apps/api/core';
      const a = import('vscode'); const b = require('node:fs');
      const c = "require('electron')";`,
      'fixture.ts',
    );
    expect(
      edges.map((edge) => [edge.specifier, edge.kind, edge.typeOnly]),
    ).toEqual([
      ['./types', 'static', true],
      ['./model', 'static', true],
      ['@tauri-apps/api/core', 'static', false],
      ['vscode', 'dynamic', false],
      ['node:fs', 'static', false],
    ]);
  });
  it.each([
    "import 'vscode'",
    "export * from '@tauri-apps/api/core'",
    "import('electron')",
    "require('fs')",
    "import sdk = require('node:fs')",
    "type X = import('vscode').X",
  ])('rejects a host SDK regardless of import syntax: %s', (source) => {
    expect(checkArchitecture({ [`${core}fixture.ts`]: source })).toEqual([
      expect.stringContaining('forbidden in core'),
    ]);
  });
  it('rejects direct host paths and computed imports before SDKs can enter transitively', () => {
    expect(
      checkArchitecture({
        [`${core}fixture.ts`]:
          "import '../../../apps/parsiword/src/host'; import(moduleName)",
      }),
    ).toHaveLength(2);
  });
  it('follows runtime re-exports to protect Node-safe contracts and lazy PDF boundaries', () => {
    const files = {
      [`${core}host-api.ts`]: "export * from './bridge'",
      [`${core}bridge.ts`]: "export * from './App'",
      [`${core}App.tsx`]: "import React from 'react'; import('./pdf-export')",
      [`${core}ui.ts`]: "export * from './App'",
      [`${core}pdf-export.ts`]: "import('pdfkit')",
    };
    expect(checkArchitecture(files)).toContainEqual(
      expect.stringContaining('host-api.ts must stay independent'),
    );
    expect(
      checkArchitecture({
        ...files,
        [`${core}App.tsx`]: "export * from './pdf-export'",
      }),
    ).toContainEqual(
      expect.stringContaining('PDF must remain dynamically imported'),
    );
  });
  it('allows type-only document references and literal lazy output loading', () => {
    expect(
      checkArchitecture(
        {
          [`${core}host-api.ts`]: "export type { X } from './document-model'",
          [`${core}document-model.ts`]: '',
          [`${core}ui.ts`]: "export * from './App'",
          [`${core}App.tsx`]: "const pdf = () => import('./pdf-export')",
          [`${core}pdf-export.ts`]: "import('pdfkit')",
          'apps/vscode/src/extension.ts':
            "import { configureHost } from '@parsiword/core/host'",
        },
        exports,
      ),
    ).toEqual([]);
  });
  it('keeps public contract types independent of converters and compatibility UI outside the active graph', () => {
    expect(
      checkArchitecture({
        [`${core}host-api.ts`]: "export type { X } from './converter'",
        [`${core}converter.ts`]: '',
        [`${core}ui.ts`]: "export * from './DocumentPreview'",
        [`${core}DocumentPreview.tsx`]: '',
      }),
    ).toEqual([
      expect.stringContaining('independent of UI and output runtimes'),
      expect.stringContaining('compatibility Markdown renderer'),
    ]);
  });
  it('requires application consumers to migrate without removing legacy wildcard exports', () => {
    expect(
      checkArchitecture(
        {
          [`${core}host.ts`]: '',
          'apps/parsiword/src/main.tsx':
            "import '../../../packages/core/src/host'",
        },
        exports,
      ),
    ).toContainEqual(expect.stringContaining('explicit core entry'));
  });
  it('prevents a second grammar owner or a React Markdown parser from returning', () => {
    expect(
      checkArchitecture({
        [`${core}markdown.ts`]: "import 'remark-parse'",
        [`${core}preview.tsx`]:
          "import 'remark-parse'; import 'react-markdown'",
      }),
    ).toEqual([
      expect.stringContaining('grammar belongs to markdown.ts'),
      expect.stringContaining('second React Markdown parser'),
    ]);
  });
  it('checks the current repository graph', () => {
    const manifest = JSON.parse(
      readFileSync('packages/core/package.json', 'utf8'),
    );
    expect(
      checkArchitecture(readArchitectureFiles(process.cwd()), manifest.exports),
    ).toEqual([]);
  });
});
