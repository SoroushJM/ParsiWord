import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, Plugin, TextSelection } from '@tiptap/pm/state';
import { closeHistory, history, redo, undo } from '@tiptap/pm/history';
import { isTikzLanguage, tikzSample, tikzSampleInsertion } from './tikz-language';
import { insertTikzSample, replaceTikzSource } from './tikz-edit';
import { parseRichMarkdown } from './rich-editor-markdown';
import { RichSourceDocument } from './rich-source';
import { documentFontUsage } from './markdown';
import { highlightCode, supportedCodeLanguages } from './code-highlight';

const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*' }, text: {},
  codeBlock: { group: 'block', content: 'text*', code: true, attrs: { language: { default: null }, meta: { default: null } } },
  blockquote: { group: 'block', content: 'block+' },
} });

function session(source: string) {
  const parsed = parseRichMarkdown(source), ledger = new RichSourceDocument();
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(parsed.document), plugins: [history(), new Plugin({
    filterTransaction(transaction, previous) { if (transaction.docChanged) ledger.prepare(transaction, previous); return true; },
  })] });
  ledger.reset(state.doc, source, parsed.positions, parsed.definitions);
  const apply = (transaction: typeof state.tr) => { state = state.applyTransaction(transaction).state; return ledger.commit(state.doc, state).text; };
  const drawing = () => {
    let position = -1;
    state.doc.descendants((node, at) => { if (node.type.name === 'codeBlock') position = at; });
    return { position, source: state.doc.nodeAt(position)!.textContent };
  };
  return { get state() { return state; }, apply, drawing };
}

describe('TikZ classification and lossless source edits', () => {
  it.each(['tikz', 'TiKz', 'tikzpicture', ' TIKZPICTURE '])('recognizes only explicit TikZ aliases: %s', language => {
    expect(isTikzLanguage(language)).toBe(true);
    expect(documentFontUsage(`\`\`\`${language.trim()}\n\\draw (0,0) circle (1);\n\`\`\``)).toEqual({ code: false, math: false });
  });
  it.each([undefined, null, '', 'latex', 'tex', 'tikz-js', 'mermaid'])('does not interpret another fence as TikZ: %s', language => {
    expect(isTikzLanguage(language)).toBe(false);
  });
  it('keeps ordinary and inline code font usage alongside a drawing', () => {
    expect(documentFontUsage('```tikz\n\\draw (0,0) circle (1);\n```\n\n`inline`')).toEqual({ code: true, math: false });
    expect(documentFontUsage('```typescript\nconst value = 1;\n```')).toEqual({ code: true, math: false });
    expect(documentFontUsage('```latex\nx^2\n```')).toEqual({ code: false, math: true });
  });
  it('highlights real TeX commands without altering literal source or the common language catalog', () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[red,thick] (0,0) circle (1); % <script> & فارسی
\end{tikzpicture}`;
    for (const alias of ['tikz', 'tikzpicture']) {
      const result = highlightCode(source, alias);
      expect(result.label).toBe('TikZ');
      expect(result.lines.map(line => line.map(token => token.text).join('')).join('\n')).toBe(source);
      expect(result.lines.flat().some(token => token.scope && token.text.includes('draw'))).toBe(true);
    }
    expect(supportedCodeLanguages).toHaveLength(36);
  });
  it('commits a complete drawing as one native history event while preserving fence metadata, CRLF and adjacent source', () => {
    const source = 'before &amp;\r\n\r\n~~~~TiKz title="circle"\r\n\\draw (0,0) circle (1);\r\n\\node at (0,0) {old};\r\n~~~~\r\n\r\nafter \\*';
    const current = session(source), { position, source: body } = current.drawing();
    const replacement = body.replace('circle (1)', 'circle (2)').replace('{old}', '{new}');
    const transaction = replaceTikzSource(current.state, position, replacement, body)!;
    expect(transaction.steps).toHaveLength(1);
    const changed = source.replace('circle (1)', 'circle (2)').replace('{old}', '{new}');
    expect(current.apply(transaction)).toBe(changed);
    current.apply(closeHistory(current.state.tr));
    expect(undo(current.state, tr => { expect(current.apply(tr)).toBe(source); })).toBe(true);
    expect(redo(current.state, tr => { expect(current.apply(tr)).toBe(changed); })).toBe(true);
  });
  it('retains quote prefixes and normalizes pasted CRLF to the original document convention', () => {
    const source = '> ```tikzpicture\r\n> \\draw (0,0) circle (1);\r\n> ```';
    const current = session(source), { position, source: body } = current.drawing();
    expect(current.apply(replaceTikzSource(current.state, position, '\\draw (0,0) circle (2);\r\n\\draw (0,0)--(2,0);', body)!))
      .toBe('> ```tikzpicture\r\n> \\draw (0,0) circle (2);\r\n> \\draw (0,0)--(2,0);\r\n> ```');
  });
  it('preserves an empty drawing and lengthens conflicting Markdown fences without activating new prose', () => {
    const current = session('```tikz\n```'), initial = current.drawing();
    expect(current.apply(replaceTikzSource(current.state, initial.position, '', initial.source)!)).toBe('```tikz\n```');
    const body = '\\node {literal ``` fence};';
    const changed = current.apply(replaceTikzSource(current.state, initial.position, body, '')!);
    expect(changed).toBe('````tikz\n\\node {literal ``` fence};\n````');
    expect(parseRichMarkdown(changed).document.content![0].content![0].text).toBe(body);
  });
  it('rejects stale dialog edits, removed nodes, invalid positions and non-drawing blocks', () => {
    const current = session('```tikz\nold\n```'), initial = current.drawing();
    current.apply(replaceTikzSource(current.state, initial.position, 'external', initial.source)!);
    expect(replaceTikzSource(current.state, initial.position, 'draft', initial.source)).toBeNull();
    for (const position of [-1, current.state.doc.content.size, NaN, 0.5]) {
      expect(replaceTikzSource(current.state, position, 'draft', 'external')).toBeNull();
    }
    const ordinary = session('```typescript\nold\n```').state;
    expect(replaceTikzSource(ordinary, 0, 'draft', 'old')).toBeNull();
    const removed = EditorState.create({ schema });
    expect(replaceTikzSource(removed, 0, 'draft', 'old')).toBeNull();
  });
  it('inserts a complete source sample before the selected text without swallowing it', () => {
    const source = 'before selected after', start = 7, end = 15;
    const changed = source.slice(0, start) + tikzSampleInsertion + source.slice(start, end) + source.slice(end);
    const parsed = parseRichMarkdown(changed);
    expect(parsed.document.content!.filter(node => node.type === 'codeBlock')).toHaveLength(1);
    expect(parsed.document.content!.find(node => node.type === 'codeBlock')!.content![0].text).toBe(tikzSample);
    const blocks = parsed.document.content!;
    expect(blocks[blocks.length - 1].content![0].text).toBe('selected after');
  });
  it('inserts a rich drawing and paragraph while preserving selected prose and exact Undo', () => {
    const source = 'before selected after', current = session(source);
    current.apply(current.state.tr.setSelection(TextSelection.create(current.state.doc, 8, 16)));
    const changed = current.apply(insertTikzSample(current.state.tr));
    const blocks = parseRichMarkdown(changed).document.content!;
    expect(blocks.filter(node => node.type === 'codeBlock')).toHaveLength(1);
    expect(blocks.find(node => node.type === 'codeBlock')!.content![0].text).toBe(tikzSample);
    expect(current.state.doc.textContent.replace(tikzSample, '')).toBe(source);
    expect(current.state.doc.content.childCount).toBeGreaterThanOrEqual(3);
    expect(undo(current.state, tr => { expect(current.apply(tr)).toBe(source); })).toBe(true);
    expect(redo(current.state, tr => { expect(current.apply(tr)).toBe(changed); })).toBe(true);
  });
});
