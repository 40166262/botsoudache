import Phaser from 'phaser';
import { Cfg } from '../config/Config';
import { Save } from '../save/SaveManager';
import { getPlatform } from '../platform';

/** 顿帧 / 震屏 / 震动统一入口（GDD §18，数值读 juice 表） */
export class Juice {
  shakeAmp = 0; shakeDur = 0; shakeT = 0; shakeEase = 'linear'; shakePri = -1;
  lastHitstop = -1e9;
  ox = 0; oy = 0;
  constructor(private scene: Phaser.Scene) {}
  get reduce() { return !!(Save.data.settings as any).reduce_motion; }
  j(key: string) { return Cfg.juice[key]; }
  shake(key: string) {
    const r = this.j(key); if (!r) return;
    const amp = r.amplitude * (this.reduce ? r.reduce_motion_mul : 1);
    // 同时多个震屏取幅度最大的，不叠加
    if (this.shakeT > 0 && amp < this.curAmp()) return;
    this.shakeAmp = amp; this.shakeDur = r.duration_ms; this.shakeT = r.duration_ms; this.shakeEase = r.ease; this.shakePri = r.priority;
  }
  private curAmp() { const k = this.shakeT / this.shakeDur; return this.shakeAmp * (this.shakeEase === 'expo_out' ? k * k : k); }
  update(dtMs: number) {
    if (this.shakeT > 0) { this.shakeT -= dtMs; const a = this.curAmp(); this.ox = (Math.random() * 2 - 1) * a; this.oy = (Math.random() * 2 - 1) * a; }
    else { this.ox = this.oy = 0; }
  }
  /** 返回本次顿帧时长（ms）；两次顿帧至少间隔 120ms，减弱震动时取消 */
  hitstop(key: string, now: number) {
    const r = this.j(key); if (!r || this.reduce) return 0;
    if (now - this.lastHitstop < 120) return 0;
    this.lastHitstop = now; return r.duration_ms;
  }
  vibrate(key: string) { if ((Save.data.settings as any).vibrate === false) return; if (this.j(key)) getPlatform().vibrateShort(); }
}
