import { ParsiWordError } from './errors';

export type TikzSourceOptions = {
  addToPreamble?: string;
  texPackages?: Record<string, string>;
  tikzLibraries?: string;
};
type Command = { name: string; start: number; end: number; arguments: string[]; options: string[] };
const invalid = (): never => { throw new ParsiWordError('TIKZ_RENDER_FAILED'); };
const oneArgument = new Set(['documentclass', 'usepackage', 'RequirePackage', 'usetikzlibrary', 'usepgfplotslibrary', 'pgfplotsset', 'tikzset', 'begin', 'end']);

function commentEnd(source: string, at: number) {
  const end = source.indexOf('\n', at);
  return end < 0 ? source.length : end + 1;
}
function triviaEnd(source: string, at: number) {
  while (at < source.length) {
    if (/\s/.test(source[at])) at++;
    else if (source[at] === '%') at = commentEnd(source, at);
    else break;
  }
  return at;
}
function commandEnd(source: string, at: number) {
  let end = at + 1;
  if (/[a-zA-Z@]/.test(source[end] || '')) {
    while (/[a-zA-Z@]/.test(source[end] || '')) end++;
  } else if (end < source.length) end++;
  return end;
}
function verbEnd(source: string, nameEnd: number) {
  let delimiter = nameEnd;
  if (source[delimiter] === '*') delimiter++;
  if (!source[delimiter] || /\s/.test(source[delimiter])) return invalid();
  const end = source.indexOf(source[delimiter], delimiter + 1);
  if (end < 0 || /[\r\n]/.test(source.slice(delimiter, end))) return invalid();
  return end + 1;
}
/** Read one TeX argument without interpreting commands inside its braces.
 * Optional brackets can contain nested options and ordinary braced values. */
function groupEnd(source: string, at: number): number {
  const opening = source[at], closing = opening === '{' ? '}' : ']';
  let depth = 1;
  for (let cursor = at + 1; cursor < source.length;) {
    const char = source[cursor];
    if (char === '%') { cursor = commentEnd(source, cursor); continue; }
    if (char === '\\') {
      const end = commandEnd(source, cursor), name = source.slice(cursor + 1, end);
      cursor = name === 'verb' ? verbEnd(source, end) : end;
      continue;
    }
    if (opening === '[' && char === '{') { cursor = groupEnd(source, cursor); continue; }
    if (char === opening) depth++;
    else if (char === closing && --depth === 0) return cursor + 1;
    cursor++;
  }
  return invalid();
}
function scan(source: string): Command[] {
  const commands: Command[] = [];
  for (let cursor = 0; cursor < source.length;) {
    const char = source[cursor];
    if (char === '%') { cursor = commentEnd(source, cursor); continue; }
    if (char === '{') { cursor = groupEnd(source, cursor); continue; }
    if (char === '}') return invalid();
    if (char !== '\\') { cursor++; continue; }
    const start = cursor, nameEnd = commandEnd(source, cursor), name = source.slice(cursor + 1, nameEnd);
    if (name === 'verb') { cursor = verbEnd(source, nameEnd); continue; }
    cursor = nameEnd;
    if (source[cursor] === '*') cursor++;
    const args: string[] = [], options: string[] = [];
    while (cursor < source.length) {
      const from = triviaEnd(source, cursor), opening = source[from];
      if (opening !== '{' && opening !== '[') break;
      if (args.length && oneArgument.has(name) && (name !== 'begin' || args[0]?.trim() !== 'tikzpicture' || opening === '{')) break;
      const end = groupEnd(source, from);
      (opening === '{' ? args : options).push(source.slice(from + 1, end - 1));
      cursor = end;
    }
    const command = { name, start, end: cursor, arguments: args, options };
    commands.push(command);
    if (name === 'begin' && /^(verbatim\*?|Verbatim|lstlisting|minted)$/.test(args[0] || '')) {
      const marker = `\\end{${args[0]}}`, end = source.indexOf(marker, cursor);
      if (end < 0) return invalid();
      cursor = end + marker.length;
    }
  }
  return commands;
}
function without(source: string, removed: readonly Command[]) {
  let result = source;
  for (const command of [...removed].sort((a, b) => b.start - a.start)) result = result.slice(0, command.start) + result.slice(command.end);
  return result;
}
function hasContent(source: string) { return triviaEnd(source, 0) < source.length; }
const leadingPreamble = new Set(['usepackage', 'RequirePackage', 'usetikzlibrary', 'usepgfplotslibrary', 'pgfplotsset', 'tikzset', 'newcommand', 'renewcommand', 'providecommand']);

/** Full documents and Unicode font packages need the real XeLaTeX pipeline.
 * Use the same scanner as the small TikZ adapter, so comments and examples do
 * not accidentally select a much larger engine. */
export function requiresXeLatex(input: string): boolean {
  const unicodePackages = new Set(['xepersian', 'fontspec', 'unicode-math', 'polyglossia']);
  return scan(input).some(command => command.name === 'documentclass' && command.arguments[0]?.trim() !== 'standalone' ||
    ['settextfont', 'setlatintextfont', 'setmainfont', 'setsansfont', 'setmonofont'].includes(command.name) ||
    ['usepackage', 'RequirePackage'].includes(command.name) && command.arguments[0]?.replace(/%[^\r\n]*/g, '').split(',').some(name => unicodePackages.has(name.trim())));
}

export function prepareXeLatexSource(input: string): string {
  const commands = scan(input);
  const classes = commands.filter(command => command.name === 'documentclass');
  const starts = commands.filter(command => command.name === 'begin' && command.arguments[0]?.trim() === 'document');
  const ends = commands.filter(command => command.name === 'end' && command.arguments[0]?.trim() === 'document');
  if (classes.length > 1 || starts.length > 1 || ends.length > 1 || classes.length && (!starts.length || !ends.length) || starts.length !== ends.length) throw new ParsiWordError('XETEX_DOCUMENT_INVALID');
  if (starts.length) {
    if (starts[0].start > ends[0].start || classes.some(command => command.start > starts[0].start) || hasContent(input.slice(ends[0].end))) throw new ParsiWordError('XETEX_DOCUMENT_INVALID');
    return classes.length ? input : `\\documentclass{article}\n${input}`;
  }
  // Keep all Unicode package/font setup before begin-document. Drawings without
  // an explicit document get a small article wrapper, never lose their preamble.
  const preamble = new Set([...leadingPreamble, 'settextfont', 'setlatintextfont', 'setmainfont', 'setsansfont', 'setmonofont']);
  let boundary = 0;
  for (const command of commands) {
    if (!preamble.has(command.name) || hasContent(input.slice(boundary, command.start))) break;
    boundary = command.end;
  }
  let body = input.slice(boundary);
  if (!commands.some(command => command.name === 'begin' && command.arguments[0]?.trim() === 'tikzpicture')) body = `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
  return `\\documentclass{article}\n\\usepackage{tikz}\n\\pagestyle{empty}\n${input.slice(0, boundary)}\n\\begin{document}\n${body}\n\\end{document}`;
}

/** Adapt common standalone documents, picture environments and drawing bodies
 * to the engine's own document wrapper. This never changes canonical Markdown.
 * TeX execution/security limits remain the engine's responsibility. */
export function prepareTikzSource(input: string): { source: string; options: TikzSourceOptions } {
  const commands = scan(input);
  // Diagnose an engine mismatch before downloading a runtime that cannot run
  // this document. scan skips comments, macro arguments and verbatim examples.
  const unicodePackages = new Set(['xepersian', 'fontspec', 'unicode-math', 'polyglossia']);
  const unicodeFontCommands = new Set(['settextfont', 'setlatintextfont', 'setmainfont', 'setsansfont', 'setmonofont']);
  if (commands.some(command => unicodeFontCommands.has(command.name) ||
    ['usepackage', 'RequirePackage'].includes(command.name) && command.arguments[0]?.replace(/%[^\r\n]*/g, '').split(',').some(name => unicodePackages.has(name.trim())))) {
    throw new ParsiWordError('TIKZ_ENGINE_UNSUPPORTED');
  }
  const classes = commands.filter(command => command.name === 'documentclass');
  if (classes.length > 1 || classes.some(command => command.arguments.length !== 1)) return invalid();
  if (classes.some(command => command.arguments[0].trim() !== 'standalone')) throw new ParsiWordError('TIKZ_DOCUMENT_UNSUPPORTED');
  const starts = commands.filter(command => command.name === 'begin' && command.arguments[0]?.trim() === 'document');
  const ends = commands.filter(command => command.name === 'end' && command.arguments[0]?.trim() === 'document');
  let body: string, preamble: string;
  if (starts.length || ends.length || classes.length) {
    if (starts.length !== 1 || ends.length !== 1 || starts[0].end > ends[0].start || classes.some(command => command.start >= starts[0].start)) return invalid();
    if (hasContent(input.slice(ends[0].end))) return invalid();
    preamble = without(input.slice(0, starts[0].start), classes);
    body = input.slice(starts[0].end, ends[0].start);
  } else {
    const picture = commands.find(command => command.name === 'begin' && command.arguments[0]?.trim() === 'tikzpicture');
    if (picture) { preamble = input.slice(0, picture.start); body = input.slice(picture.start); }
    else {
      let boundary = 0;
      for (const command of commands) {
        if (!leadingPreamble.has(command.name) || hasContent(input.slice(boundary, command.start))) break;
        boundary = command.end;
      }
      preamble = input.slice(0, boundary);
      body = input.slice(boundary);
    }
  }
  if (scan(preamble).some(command => command.name === 'begin' || command.name === 'end')) return invalid();
  const bodyCommands = scan(body);
  if (bodyCommands.some(command => command.name === 'documentclass' || ['begin', 'end'].includes(command.name) && command.arguments[0]?.trim() === 'document')) return invalid();
  const pictures = bodyCommands.filter(command => command.name === 'begin' && command.arguments[0]?.trim() === 'tikzpicture');
  const pictureEnds = bodyCommands.filter(command => command.name === 'end' && command.arguments[0]?.trim() === 'tikzpicture');
  if (pictures.length !== pictureEnds.length || pictures.some((command, index) => command.start > pictureEnds[index].start)) return invalid();
  if (!pictures.length) body = `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`;
  return { source: body, options: preamble.trim() ? { addToPreamble: preamble } : {} };
}
