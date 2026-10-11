/** 占位音效：WebAudio 合成，等正式音频（GDD §17.5）到位后替换为文件，ID 保持一致 */
type Def = { f: number; f2?: number; d: number; type?: OscillatorType; v?: number; noise?: boolean };
const DEFS: Record<string, Def> = {
  sfx_shoot: { f: 900, f2: 500, d: 0.05, type: 'square', v: 0.03 },
  sfx_hit: { f: 300, f2: 120, d: 0.06, type: 'triangle', v: 0.08 },
  sfx_crit: { f: 700, f2: 200, d: 0.1, type: 'sawtooth', v: 0.06 },
  sfx_enemy_die: { f: 520, f2: 1040, d: 0.09, type: 'triangle', v: 0.06 },
  sfx_exp_pick: { f: 1200, f2: 1600, d: 0.04, type: 'sine', v: 0.05 },
  sfx_coin_pick: { f: 1500, f2: 2200, d: 0.07, type: 'square', v: 0.035 },
  sfx_level_up: { f: 500, f2: 1500, d: 0.35, type: 'triangle', v: 0.1 },
  sfx_ui_click: { f: 800, d: 0.04, type: 'sine', v: 0.08 },
  sfx_chest_open: { f: 600, f2: 1400, d: 0.25, type: 'triangle', v: 0.1 },
  sfx_player_hurt: { f: 220, f2: 80, d: 0.15, type: 'sawtooth', v: 0.1 },
  sfx_boss_warn: { f: 160, f2: 140, d: 0.3, type: 'sawtooth', v: 0.06 },
  sfx_portal_appear: { f: 400, f2: 1200, d: 0.5, type: 'sine', v: 0.1 },
  sfx_extract: { f: 600, f2: 2000, d: 0.6, type: 'triangle', v: 0.12 },
  sfx_explode: { f: 120, f2: 40, d: 0.35, noise: true, v: 0.25 },
  sfx_thunder: { f: 90, f2: 40, d: 0.25, noise: true, v: 0.18 },
  sfx_countdown: { f: 1000, d: 0.06, type: 'square', v: 0.04 },
  sfx_bag_full: { f: 300, f2: 250, d: 0.2, type: 'square', v: 0.06 },
};
class SfxMgr {
  ctx: AudioContext | null = null; vol = 0.8; private last: Record<string, number> = {};
  unlock() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { /* */ } } this.ctx?.resume(); }
  play(id: string, pitch = 1, minGap = 0.03) {
    const c = this.ctx, d = DEFS[id]; if (!c || !d || this.vol <= 0) return;
    const now = c.currentTime; if ((this.last[id] ?? -1) + minGap > now) return; this.last[id] = now;
    const g = c.createGain(); g.gain.setValueAtTime((d.v ?? 0.08) * this.vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + d.d); g.connect(c.destination);
    if (d.noise) {
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * d.d), c.sampleRate); const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
      const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = d.f * 8;
      s.connect(f); f.connect(g); s.start(now); return;
    }
    const o = c.createOscillator(); o.type = d.type ?? 'sine'; o.frequency.setValueAtTime(d.f * pitch, now);
    if (d.f2) o.frequency.exponentialRampToValueAtTime(d.f2 * pitch, now + d.d);
    o.connect(g); o.start(now); o.stop(now + d.d + 0.02);
  }
}
export const Sfx = new SfxMgr();
