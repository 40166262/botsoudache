export const CELL = 64;
export class Rng {
  constructor(public s: number) { if (!this.s) this.s = 1; }
  next() { let t = (this.s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(a: T[]) { return a[Math.floor(this.next() * a.length)]; }
  chance(p: number) { return this.next() < p; }
  weighted<T extends string>(w: Record<T, number>): T { const e = Object.entries(w) as [T, number][]; const tot = e.reduce((s, [, v]) => s + v, 0); let r = this.next() * tot; for (const [k, v] of e) { if ((r -= v) < 0) return k; } return e[e.length - 1][0]; }
}
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
