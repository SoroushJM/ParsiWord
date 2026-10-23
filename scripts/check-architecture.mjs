import ts from 'typescript';
import { builtinModules } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const core = 'packages/core/src/';
const script = /\.[cm]?[jt]sx?$/;
const normalize = (path) => path.replaceAll('\\', '/');
const nodeModules = new Set(
  builtinModules
    .map((name) => name.replace(/^node:/, ''))
    .filter((name) => name !== 'buffer'),
);
const browserRuntimes =
  /^(?:react(?:-dom)?(?:\/|$)|@tiptap\/|docx$|pdfkit(?:\/|$)|mermaid$|katex$|html-to-image$|@fontsource)/;

/** Read syntax nodes, so comments, quote styles and re-export barrels are handled correctly. */
export function importEdges(source, filename = 'module.ts') {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edges = [];
  const add = (node, value, kind, typeOnly = false) => {
    const line =
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    edges.push({
      specifier:
        value && ts.isStringLiteralLike(value) ? value.text : undefined,
      kind,
      typeOnly,
      line,
    });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes =
        clause?.isTypeOnly ||
        (!clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((item) => item.isTypeOnly));
      add(node, node.moduleSpecifier, 'static', Boolean(onlyTypes));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const onlyTypes =
        node.isTypeOnly ||
        (node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((item) => item.isTypeOnly));
      add(node, node.moduleSpecifier, 'static', Boolean(onlyTypes));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node, node.moduleReference.expression, 'static', node.isTypeOnly);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      add(
        node,
        node.arguments[0],
        node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? 'dynamic'
          : 'static',
      );
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node, node.argument.literal, 'static', true);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return edges;
}

function exportedPath(specifier, exports) {
  const key =
    specifier === '@parsiword/core'
      ? '.'
      : `.${specifier.slice('@parsiword/core'.length)}`;
  const exact = exports[key];
  if (typeof exact === 'string')
    return `packages/core/${exact.replace(/^\.\//, '')}`;
  if (key.startsWith('./') && typeof exports['./*'] === 'string')
    return `packages/core/${exports['./*'].replace(/^\.\//, '').replace('*', key.slice(2))}`;
}

/** Pure entry point for fixture tests as well as the repository check. */
export function checkArchitecture(inputFiles, exports = {}) {
  const files = new Map(
    Object.entries(inputFiles).map(([path, source]) => [
      normalize(path),
      source,
    ]),
  );
  const issues = [];
  const edges = new Map();
  const issue = (path, edge, message) =>
    issues.push(`${path}:${edge.line}: ${message}`);
  const locate = (path) =>
    [
      path,
      ...[
        '.ts',
        '.tsx',
        '.js',
        '.mjs',
        '.json',
        '.css',
        '/index.ts',
        '/index.tsx',
      ].map((suffix) => `${path}${suffix}`),
    ].find((candidate) => files.has(candidate));
  const localTarget = (path, specifier) => {
    const plain = specifier.split('?')[0];
    const target = plain.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(path), plain))
      : plain.startsWith('@/')
        ? `${core}${plain.slice(2)}`
        : plain === '@parsiword/core' || plain.startsWith('@parsiword/core/')
          ? exportedPath(plain, exports)
          : undefined;
    return target
      ? { path: locate(target) ?? target, exists: Boolean(locate(target)) }
      : undefined;
  };
  const forbiddenSdk = (specifier) =>
    specifier === 'vscode' ||
    specifier === 'electron' ||
    specifier.startsWith('@tauri-apps/') ||
    specifier.startsWith('node:') ||
    nodeModules.has(specifier);

  for (const [path, source] of files) {
    if (!script.test(path) || /\.(?:test|spec)\.[jt]sx?$/.test(path)) continue;
    const imports = importEdges(source, path);
    edges.set(
      path,
      imports.map((edge) => ({
        ...edge,
        target: edge.specifier ? localTarget(path, edge.specifier) : undefined,
      })),
    );
    for (const edge of imports) {
      if (path.startsWith(core)) {
        if (!edge.specifier)
          issue(
            path,
            edge,
            'Computed module imports are not allowed in core; use a literal path.',
          );
        else if (forbiddenSdk(edge.specifier))
          issue(
            path,
            edge,
            `Host SDK or Node builtin is forbidden in core: ${edge.specifier}`,
          );
        if (
          (edge.specifier === 'remark-parse' ||
            edge.specifier === 'mdast-util-from-markdown') &&
          path !== `${core}markdown.ts`
        )
          issue(
            path,
            edge,
            'Markdown grammar belongs to markdown.ts; reuse markdownContext instead.',
          );
        if (edge.specifier === 'react-markdown')
          issue(
            path,
            edge,
            'A second React Markdown parser must not replace the shared document tree.',
          );
        const target = edge.specifier && localTarget(path, edge.specifier);
        if (target && !target.path.startsWith(core))
          issue(
            path,
            edge,
            `Core must not import host implementation: ${edge.specifier}`,
          );
      }
      if (
        /^apps\/(?:parsiword\/src|vscode\/(?:src|webview))\//.test(path) &&
        edge.specifier
      ) {
        const target = localTarget(path, edge.specifier);
        const publicEntry = [
          '.',
          './document',
          './host',
          './ui',
          './errors',
          './adapters/word',
          './adapters/pdf',
          './adapters/files',
          './adapters/fonts',
          './styles.css',
        ];
        const key =
          edge.specifier === '@parsiword/core'
            ? '.'
            : `.${edge.specifier.slice('@parsiword/core'.length)}`;
        if (
          target?.path.startsWith(core) &&
          !(
            edge.specifier.startsWith('@parsiword/core') &&
            publicEntry.includes(key)
          ) &&
          !edge.specifier.endsWith('/default-document.md?raw')
        ) {
          issue(
            path,
            edge,
            `Host consumers must use an explicit core entry: ${edge.specifier}`,
          );
        }
      }
    }
  }

  const visitEntry = (entry, inspect, allEdges = false) => {
    const visited = new Set();
    const visit = (path) => {
      if (visited.has(path)) return;
      visited.add(path);
      for (const edge of edges.get(path) ?? []) {
        if (!allEdges && (edge.typeOnly || edge.kind === 'dynamic')) continue;
        inspect(path, edge);
        if (edge.target?.exists) visit(edge.target.path);
      }
    };
    visit(entry);
  };
  for (const entry of ['host-api.ts', 'document.ts']) {
    visitEntry(
      `${core}${entry}`,
      (path, edge) => {
        if (
          edge.specifier &&
          (browserRuntimes.test(edge.specifier) ||
            /(?:^|\/)(?:App|converter|pdf-export|fonts|math|diagrams|locale)\.[jt]sx?$/.test(
              edge.target?.path ?? '',
            ) ||
            edge.target?.path.endsWith('.css'))
        ) {
          issue(
            path,
            edge,
            `${entry} must stay independent of UI and output runtimes: ${edge.specifier}`,
          );
        }
      },
      true,
    );
  }
  for (const entry of ['index.ts', 'ui.ts']) {
    visitEntry(`${core}${entry}`, (path, edge) => {
      if (edge.target?.path === `${core}DocumentPreview.tsx`)
        issue(
          path,
          edge,
          `The compatibility Markdown renderer must not enter ${entry}.`,
        );
      if (
        edge.specifier === 'pdfkit' ||
        /(?:^|\/)(?:pdf-export|adapters\/pdf)\.[jt]sx?$/.test(
          edge.target?.path ?? '',
        )
      )
        issue(
          path,
          edge,
          `PDF must remain dynamically imported from ${entry}.`,
        );
    });
  }
  return [...new Set(issues)];
}

export function readArchitectureFiles(root) {
  const files = {};
  const walk = (directory) => {
    for (const item of readdirSync(resolve(root, directory), {
      withFileTypes: true,
    })) {
      const path = `${directory}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else if (/\.(?:[cm]?[jt]sx?|json|css|md)$/.test(path))
        files[normalize(path)] = readFileSync(resolve(root, path), 'utf8');
    }
  };
  for (const directory of [
    'packages/core/src',
    'apps/parsiword/src',
    'apps/vscode/src',
    'apps/vscode/webview',
  ])
    walk(directory);
  return files;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'packages/core/package.json'), 'utf8'),
  );
  const issues = checkArchitecture(
    readArchitectureFiles(root),
    manifest.exports,
  );
  if (issues.length) {
    process.stderr.write(`${issues.join('\n')}\n`);
    process.exitCode = 1;
  } else process.stdout.write('Architecture boundaries passed.\n');
}
