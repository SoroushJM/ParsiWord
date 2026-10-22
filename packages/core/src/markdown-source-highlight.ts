export type MarkdownTokenKind = 'heading' | 'marker' | 'strong' | 'emphasis' | 'strike' | 'code' | 'link' | 'url' | 'list' | 'quote' | 'math' | 'html' | 'escape' | 'table';
export type MarkdownSourceToken = { text: string; kind?: MarkdownTokenKind };
export type MarkdownToken = MarkdownSourceToken;
export type MarkdownSourceLine = {
  id: number; text: string; newline: string; tokens: readonly MarkdownSourceToken[];
};

type State = { fence?: { marker: string; length: number; quotes: number }; math?: boolean; comment?: boolean };
type CachedLine = { line: MarkdownSourceLine; before: string; after: State; setext: boolean };
const maxInlineLength = 20_000;
const stateKey = (state: State) => `${state.fence?.marker || ''}:${state.fence?.length || 0}:${state.fence?.quotes || 0}:${!!state.math}:${!!state.comment}`;
const setext = (text: string | undefined) => text !== undefined && /^ {0,3}(?:=+|-+)[\t ]*$/.test(text);

function splitLines(source: string) {
  const pieces = source.split(/(\r\n|\r|\n)/);
  const lines: { text: string; newline: string }[] = [];
  for (let i = 0; i < pieces.length; i += 2) lines.push({ text: pieces[i], newline: pieces[i + 1] || '' });
  return lines;
}

function prefix(text: string) {
  let at = 0, quotes = 0;
  while (true) {
    const start = at;
    let spaces = 0;
    while (spaces < 3 && text[at] === ' ') { at++; spaces++; }
    if (text[at] !== '>') { at = start; break; }
    quotes++; at++;
    if (text[at] === ' ' || text[at] === '\t') at++;
  }
  return { at, quotes };
}

function fenceAt(text: string, start: number) {
  let at = start, spaces = 0;
  while (text[at] === ' ' && spaces < 3) { at++; spaces++; }
  const marker = text[at];
  if (marker !== '`' && marker !== '~') return undefined;
  let end = at;
  while (text[end] === marker) end++;
  return end - at >= 3 ? { at, end, marker, length: end - at } : undefined;
}

function lex(text: string, incoming: State, nextSetext: boolean) {
  const tokens: MarkdownSourceToken[] = [];
  const add = (value: string, kind?: MarkdownTokenKind) => {
    if (!value) return;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.kind === kind) previous.text += value;
    else tokens.push(kind ? { text: value, kind } : { text: value });
  };
  let state = incoming;
  const container = prefix(text);
  let start = container.at;
  const fence = fenceAt(text, start);

  if (state.fence && container.quotes < state.fence.quotes) state = {};
  if (state.fence) {
    const closes = fence && fence.marker === state.fence.marker && fence.length >= state.fence.length && /^[\t ]*$/.test(text.slice(fence.end));
    add(text, closes ? 'marker' : 'code');
    return { tokens, after: closes ? {} : state };
  }
  if (state.math) {
    const closes = /^ {0,3}\$\$[\t ]*$/.test(text.slice(start));
    add(text, 'math');
    return { tokens, after: closes ? {} : state };
  }
  if (!state.comment && fence && (fence.marker !== '`' || !text.slice(fence.end).includes('`'))) {
    add(text.slice(0, start), container.quotes ? 'quote' : undefined);
    add(text.slice(start, fence.end), 'marker');
    add(text.slice(fence.end), 'code');
    return { tokens, after: { fence: { marker: fence.marker, length: fence.length, quotes: container.quotes } } };
  }
  if (!state.comment && /^ {0,3}\$\$[\t ]*$/.test(text.slice(start))) {
    add(text, 'math');
    return { tokens, after: { math: true } };
  }

  // Extremely long single lines stay literal. Still propagate comment state,
  // so a bounded fallback never colors all following lines incorrectly.
  if (text.length > maxInlineLength) {
    let at = 0, comment = !!state.comment;
    while (at < text.length) {
      const index = text.indexOf(comment ? '-->' : '<!--', at);
      if (index < 0) break;
      at = index + (comment ? 3 : 4); comment = !comment;
    }
    add(text);
    return { tokens, after: comment ? { comment: true } : {} };
  }

  let base: MarkdownTokenKind | undefined;
  if (!state.comment) {
    add(text.slice(0, start), container.quotes ? 'quote' : undefined);
    const content = text.slice(start);
    const heading = /^( {0,3})(#{1,6})(?=[\t ]|$)/.exec(content);
    const list = /^( {0,3})(?:[-+*]|\d{1,9}[.)])(?=[\t ])[\t ]+/.exec(content);
    if (heading) {
      add(heading[1]); add(heading[2], 'marker');
      start += heading[0].length; base = 'heading';
    } else if (list) {
      add(list[0], 'list'); start += list[0].length;
      const task = /^\[[ xX]\](?=[\t ]|$)/.exec(text.slice(start));
      if (task) { add(task[0], 'list'); start += task[0].length; }
    } else if (nextSetext && content.trim() && !/^ {0,3}(?:[-*_][\t ]*){3,}$/.test(content)) base = 'heading';
    else if (/^ {0,3}(?:=+|-+)[\t ]*$/.test(content) || /^ {0,3}(?:\*[\t ]*){3,}$/.test(content) || /^ {0,3}(?:_[\t ]*){3,}$/.test(content)) {
      add(content, 'marker'); return { tokens, after: {} };
    }
  } else start = 0;

  const missing = new Set<string>();
  const escaped = (at: number) => {
    let slashes = 0;
    while (at > 0 && text[--at] === '\\') slashes++;
    return slashes % 2 !== 0;
  };
  const closing = (marker: string, from: number) => {
    if (missing.has(marker)) return -1;
    let at = text.indexOf(marker, from);
    while (at >= 0 && escaped(at)) at = text.indexOf(marker, at + marker.length);
    if (at < 0) missing.add(marker);
    return at;
  };
  let at = start, plain = start, comment = !!state.comment;
  const flush = () => { add(text.slice(plain, at), base); };
  while (at < text.length) {
    if (comment || text.startsWith('<!--', at)) {
      flush();
      const end = text.indexOf('-->', at + (comment ? 0 : 4));
      const stop = end < 0 ? text.length : end + 3;
      add(text.slice(at, stop), 'html');
      at = plain = stop; comment = end < 0; continue;
    }
    const character = text[at];
    if (character === '\\' && at + 1 < text.length && /[\\`*_{}\[\]()#+.!>$~|\-]/.test(text[at + 1])) {
      flush(); add(text.slice(at, at + 2), 'escape'); at = plain = at + 2; continue;
    }
    if (character === '`') {
      let end = at;
      while (text[end] === '`') end++;
      const marker = text.slice(at, end), close = closing(marker, end);
      if (close >= 0) {
        flush(); add(text.slice(at, close + marker.length), 'code'); at = plain = close + marker.length; continue;
      }
      at = end; continue;
    }
    if (character === '[' || character === '!' && text[at + 1] === '[') {
      const bracket = character === '!' ? at + 1 : at;
      const end = closing(']', bracket + 1);
      if (end >= 0) {
        const next = text[end + 1];
        const close = next === '(' ? closing(')', end + 2) : next === '[' ? closing(']', end + 2) : -1;
        if (close >= 0) {
          flush(); add(text.slice(at, end + 1), 'link'); add(next, 'marker');
          add(text.slice(end + 2, close), next === '(' ? 'url' : 'link'); add(text[close], 'marker');
          at = plain = close + 1; continue;
        }
        if (text[end + 1] === ':' && at === start) {
          flush(); add(text.slice(at, end + 2), 'link'); add(text.slice(end + 2), 'url'); at = plain = text.length; continue;
        }
      }
    }
    if (character === '<' && /[A-Za-z!/?]/.test(text[at + 1] || '')) {
      const end = closing('>', at + 1);
      if (end >= 0) {
        flush(); const value = text.slice(at, end + 1);
        add(value, /^<(?:https?:\/\/|mailto:)/i.test(value) ? 'url' : 'html'); at = plain = end + 1; continue;
      }
    }
    if (character === '$') {
      const marker = text[at + 1] === '$' ? '$$' : '$';
      const end = closing(marker, at + marker.length);
      if (end > at + marker.length && !/\s/.test(text[at + marker.length]) && !/\s/.test(text[end - 1])) {
        flush(); add(text.slice(at, end + marker.length), 'math'); at = plain = end + marker.length; continue;
      }
    }
    if (character === '*' || character === '_' || character === '~') {
      const marker = text[at + 1] === character ? character.repeat(2) : character;
      const kind = marker === '~~' ? 'strike' : marker.length === 2 ? 'strong' : 'emphasis';
      const wordUnderscore = character === '_' && /[\p{L}\p{N}]/u.test(text[at - 1] || '');
      if ((character !== '~' || marker.length === 2) && !wordUnderscore && text[at + marker.length] && !/\s/.test(text[at + marker.length])) {
        const end = closing(marker, at + marker.length);
        if (end > at + marker.length && !/\s/.test(text[end - 1])) {
          flush(); add(marker, 'marker'); add(text.slice(at + marker.length, end), kind); add(marker, 'marker'); at = plain = end + marker.length; continue;
        }
      }
    }
    if (character === '|') { flush(); add(character, 'table'); at = plain = at + 1; continue; }
    at++;
  }
  flush();
  return { tokens, after: comment ? { comment: true } : {} };
}

/** Color tokens only: exact source text and native textarea metrics stay intact. */
export class MarkdownSourceHighlighter {
  private source: string | undefined;
  private cached: CachedLine[] = [];
  private lines: readonly MarkdownSourceLine[] = [];
  private nextId = 0;

  highlight(source: string): readonly MarkdownSourceLine[] {
    if (source === this.source) return this.lines;
    const raw = splitLines(source), old = this.cached;
    const equal = (a: { text: string; newline: string }, b: { text: string; newline: string }) => a.text === b.text && a.newline === b.newline;
    let first = 0;
    while (first < raw.length && first < old.length && equal(raw[first], old[first].line)) first++;
    // A setext underline colors its preceding line too.
    first = Math.max(0, first - 1);
    let suffix = 0;
    while (suffix < raw.length - first && suffix < old.length - first && equal(raw[raw.length - 1 - suffix], old[old.length - 1 - suffix].line)) suffix++;
    const next = old.slice(0, first);
    let state = next.length ? next[next.length - 1].after : {};
    for (let index = first; index < raw.length; index++) {
      const suffixIndex = index >= raw.length - suffix ? old.length - (raw.length - index) : index;
      const previous = old[suffixIndex];
      const before = stateKey(state), nextSetext = setext(raw[index + 1]?.text);
      if (previous && equal(raw[index], previous.line) && previous.before === before && previous.setext === nextSetext) {
        if (index >= raw.length - suffix) {
          // A valid 500k-character document can contain hundreds of thousands
          // of empty lines; spreading that suffix exceeds JS argument limits.
          for (let rest = suffixIndex; rest < old.length; rest++) next.push(old[rest]);
          break;
        }
        next.push(previous); state = previous.after; continue;
      }
      const result = lex(raw[index].text, state, nextSetext);
      const id = index < raw.length - suffix && index < old.length - suffix ? old[index].line.id : this.nextId++;
      const line = { id, ...raw[index], tokens: result.tokens };
      next.push({ line, before, after: result.after, setext: nextSetext });
      state = result.after;
    }
    this.source = source; this.cached = next; this.lines = next.map(entry => entry.line);
    return this.lines;
  }
}
