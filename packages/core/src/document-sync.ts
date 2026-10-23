import { ParsiWordError } from './errors';

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
export class EditConflict extends ParsiWordError { constructor() { super('DOCUMENT_CONFLICT'); } }

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
export type SyncEdit = { id: number; base: string; text: string; version: number; sequence: number };
export type SyncPending = { previous: number; sequence: number; change: TextChange };

/** One in-flight write per view; fast typing coalesces without waiting to update UI. */
export class DocumentSync {
  private local: string;
  private serial = 0;
  private sequence = 0;
  private flight?: SyncEdit;
  private composing = false;
  private compositionEnd?: ReturnType<typeof setTimeout>;
  private staged = false;
  private deferredAck?: { snapshot: SyncSnapshot; ownAck: boolean };
  private deferredLatest?: { snapshot: SyncSnapshot; ownAck: boolean };
  private readonly waiters = new Set<{ resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private confirmed: SyncSnapshot, private readonly send: (edit: SyncEdit) => void,
    private readonly display: (snapshot: SyncSnapshot) => void, private readonly recover: (text: string) => void,
    private readonly stage?: (pending: SyncPending) => void,
    private readonly draft?: (edit: SyncEdit) => void) {
    this.local = confirmed.text;
  }
  edit(text: string): void {
    const change = minimalChange(this.local, text);
    if (!change) { this.flush(); return; }
    this.local = text;
    const previous = this.sequence++;
    if (this.flight || this.staged) this.stage?.({ previous, sequence: this.sequence, change });
    else if (this.composing) {
      this.draft?.({ id: 0, base: this.confirmed.text, text: this.local, version: this.confirmed.version, sequence: this.sequence });
      this.staged = true;
    }
    this.flush();
  }
  composition(active: boolean): void {
    clearTimeout(this.compositionEnd);
    if (active) { this.composing = true; return; }
    // Browsers may dispatch the final non-composing input after compositionend.
    // Keep native writes paused through that task, while edit() stays immediate.
    this.compositionEnd = setTimeout(() => this.finishComposition(), 0);
  }
  private finishComposition(): void {
    this.composing = false;
    const ack = this.deferredAck, latest = this.deferredLatest;
    this.deferredAck = this.deferredLatest = undefined;
    if (ack) this.receive(ack.snapshot, ack.ownAck);
    if (latest) this.receive(latest.snapshot, latest.ownAck);
    this.flush();
  }
  private flush(): void {
    if (!this.pending) { this.settle(); return; }
    if (this.composing || this.flight) return;
    this.staged = false;
    this.flight = { id: ++this.serial, base: this.confirmed.text, text: this.local, version: this.confirmed.version, sequence: this.sequence };
    this.send(this.flight);
  }
  receive(snapshot: SyncSnapshot, ownAck = false): void {
    if (this.composing) {
      const event = { snapshot, ownAck };
      if (ownAck && this.flight && snapshot.ack === this.flight.id) this.deferredAck = event;
      else if (!this.deferredLatest || snapshot.version >= this.deferredLatest.snapshot.version) this.deferredLatest = event;
      return;
    }
    if (snapshot.version < this.confirmed.version) return;
    if (snapshot.rejected) {
      this.fail(new ParsiWordError('SYNC_REJECTED'));
      this.recover(this.local); this.flight = undefined; this.local = snapshot.text;
    } else if (ownAck && this.flight && snapshot.ack === this.flight.id) {
      try { this.local = rebaseText(this.flight.text, this.local, snapshot.text); }
      catch { this.fail(new EditConflict()); this.recover(this.local); this.local = snapshot.text; }
      this.flight = undefined;
    } else if (!this.flight) {
      try { this.local = rebaseText(this.confirmed.text, this.local, snapshot.text); }
      catch { this.fail(new EditConflict()); this.recover(this.local); this.local = snapshot.text; }
    } else {
      // The host serializes writes and rebases this flight against the latest
      // TextDocument. Its acknowledgement is the next authoritative baseline.
      return;
    }
    this.confirmed = snapshot;
    this.display({ ...snapshot, text: this.local, dirty: snapshot.dirty || this.local !== snapshot.text });
    this.flush();
    this.settle();
  }
  private settle(): void {
    if (this.pending) return;
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.resolve(); }
    this.waiters.clear();
  }
  private fail(error: Error): void {
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.waiters.clear();
  }
  /** Save/history commands wait for all input already present at invocation. */
  drain(timeoutMs = 10_000): Promise<void> {
    if (!this.pending) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: setTimeout(() => { this.waiters.delete(waiter); reject(new ParsiWordError('SYNC_TIMEOUT')); }, timeoutMs) };
      this.waiters.add(waiter);
    });
  }
  get pending(): boolean { return !!this.flight || this.local !== this.confirmed.text; }
}
