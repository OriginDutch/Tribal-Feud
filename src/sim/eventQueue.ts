/**
 * Min-heap of scheduled events, ordered by game time.
 * Ties are broken by insertion order (seq), so processing is deterministic, with one rule on top:
 * at the same moment, finished recruits come last ("late" items). Everything else that happens
 * at time T sees the units finished before T; units finished at exactly T arrive just after.
 * Plain data: the whole queue serializes to JSON as-is.
 */

export interface Scheduled<T> {
  time: number;
  seq: number;
  /** Sorts after other items at the same time (finished recruits). */
  late?: 1;
  event: T;
}

export interface EventQueue<T> {
  heap: Scheduled<T>[];
  nextSeq: number;
}

export function createQueue<T>(): EventQueue<T> {
  return { heap: [], nextSeq: 0 };
}

function before<T>(a: Scheduled<T>, b: Scheduled<T>): boolean {
  if (a.time !== b.time) return a.time < b.time;
  if ((a.late ?? 0) !== (b.late ?? 0)) return !a.late;
  return a.seq < b.seq;
}

function at<T>(q: EventQueue<T>, i: number): Scheduled<T> {
  const item = q.heap[i];
  if (item === undefined) throw new Error(`eventQueue: no item at ${i}`);
  return item;
}

function swap<T>(q: EventQueue<T>, i: number, j: number): void {
  const a = at(q, i);
  q.heap[i] = at(q, j);
  q.heap[j] = a;
}

export function push<T>(q: EventQueue<T>, time: number, event: T): Scheduled<T> {
  if (!Number.isFinite(time)) throw new Error(`eventQueue: invalid time ${time}`);
  const item: Scheduled<T> = { time, seq: q.nextSeq++, event };
  if ((event as { kind?: string }).kind === 'recruit') item.late = 1;
  q.heap.push(item);
  let i = q.heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(at(q, i), at(q, parent))) break;
    swap(q, i, parent);
    i = parent;
  }
  return item;
}

export function peek<T>(q: EventQueue<T>): Scheduled<T> | undefined {
  return q.heap[0];
}

export function pop<T>(q: EventQueue<T>): Scheduled<T> | undefined {
  const top = q.heap[0];
  if (top === undefined) return undefined;
  const last = q.heap.pop();
  if (q.heap.length > 0 && last !== undefined) {
    q.heap[0] = last;
    let i = 0;
    const n = q.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && before(at(q, l), at(q, smallest))) smallest = l;
      if (r < n && before(at(q, r), at(q, smallest))) smallest = r;
      if (smallest === i) break;
      swap(q, i, smallest);
      i = smallest;
    }
  }
  return top;
}

export function size<T>(q: EventQueue<T>): number {
  return q.heap.length;
}
