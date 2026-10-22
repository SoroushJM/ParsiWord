/** UTF-16 offsets match both TextDocument and the browser's native controls. */
export type TextChange = { start: number; end: number; text: string };
export function minimalChange(before: string, after: string): TextChange | null {
  if (before === after) return null;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  // Do not bisect a surrogate pair or CRLF at either boundary.
  if (start && (/^[\uDC00-\uDFFF]$/.test(before[start] || after[start]) || (before[start - 1] === '\r' && before[start] === '\n'))) start--;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  if (oldEnd < before.length && (/^[\uDC00-\uDFFF]$/.test(before[oldEnd]) || (before[oldEnd - 1] === '\r' && before[oldEnd] === '\n'))) { oldEnd++; newEnd++; }
  return { start, end: oldEnd, text: after.slice(start, newEnd) };
}
export function applyChange(text: string, change: TextChange): string {
  return text.slice(0, change.start) + change.text + text.slice(change.end);
}
export class EditConflict extends Error { constructor() { super('Concurrent edits overlap. The local draft has been preserved in a recovery document.'); } }

/** Merge disjoint edits; overlapping edits require recovery, never last-writer-wins. */
export function rebaseText(base: string, local: string, current: string): string {
  if (base === current || local === current) return local;
  const own = minimalChange(base, local), remote = minimalChange(base, current);
  if (!own) return current;
  if (!remote) return local;
  if (own.start === remote.start) throw new EditConflict();
  if (own.end <= remote.start) return applyChange(current, own);
  if (own.start >= remote.end) {
    const delta = remote.text.length - (remote.end - remote.start);
    return applyChange(current, { ...own, start: own.start + delta, end: own.end + delta });
  }
  throw new EditConflict();
}

export type SyncSnapshot = { text: string; version: number; dirty: boolean; eol?: '\n' | '\r\n'; ack?: number; client?: string; rejected?: boolean };
export type SyncEdit = { id: number; base: string; text: string; version: number };

/** One in-flight write per view; fast typing coalesces without waiting to update UI. */
export class DocumentSync {
  private local: string;
  private serial = 0;
  private flight?: SyncEdit;
  constructor(private confirmed: SyncSnapshot, private readonly send: (edit: SyncEdit) => void,
    private readonly display: (snapshot: SyncSnapshot) => void, private readonly recover: (text: string) => void) {
    this.local = confirmed.text;
  }
  edit(text: string): void { this.local = text; this.flush(); }
  private flush(): void {
    if (this.flight || this.local === this.confirmed.text) return;
    this.flight = { id: ++this.serial, base: this.confirmed.text, text: this.local, version: this.confirmed.version };
    this.send(this.flight);
  }
  receive(snapshot: SyncSnapshot, ownAck = false): void {
    if (snapshot.version < this.confirmed.version) return;
    if (snapshot.rejected) {
      this.recover(this.local); this.flight = undefined; this.local = snapshot.text;
    } else if (ownAck && this.flight && snapshot.ack === this.flight.id) {
      try { this.local = rebaseText(this.flight.text, this.local, snapshot.text); }
      catch { this.recover(this.local); this.local = snapshot.text; }
      this.flight = undefined;
    } else if (!this.flight) {
      try { this.local = rebaseText(this.confirmed.text, this.local, snapshot.text); }
      catch { this.recover(this.local); this.local = snapshot.text; }
    } else {
      // The host serializes writes and rebases this flight against the latest
      // TextDocument. Its acknowledgement is the next authoritative baseline.
      return;
    }
    this.confirmed = snapshot;
    this.display({ ...snapshot, text: this.local, dirty: snapshot.dirty || this.local !== snapshot.text });
    this.flush();
  }
  get pending(): boolean { return !!this.flight || this.local !== this.confirmed.text; }
}
