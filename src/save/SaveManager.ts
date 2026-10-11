import { Cfg } from '../config/Config';
import { getPlatform } from '../platform';

/** 存档（GDD §14.5 / §17.2）。S1 出发即存档、S2 每层快照、S3 先存结算后播动画、启动检查异常退出按阵亡。 */
export interface BagItem { id: string; count: number; value?: number; locked?: boolean; kind: 'treasure' | 'material' | 'blueprint'; }
export interface ActiveRun { run_id: string; region_id: string; seed: number; started_at: number; is_protected: boolean; carried: Record<string, number>;
  floor_snapshot: { floor: number; backpack: BagItem[]; safe: BagItem[]; run_gold: number; account_exp: number }; }
export interface SaveData {
  schema_version: number; save_seq: number; updated_at: number; config_version: string;
  player: { uid: string; level: number; account_exp: number; created_at: number };
  currency: { gold: number; shard: number; iron: number; crystal: number };
  inventory: { consumables: Record<string, number>; blueprints: Record<string, number>; equipment: any[]; equipped: any };
  workshop: { backpack_step: number; safe_step: number };
  codex: Record<string, number>;
  progress: { regions: Record<string, { unlocked: boolean; first_clear: boolean; best_floor: number }>; tutorial_step: number; newbie_protect_left: number; total_runs: number };
  daily: any; offline: { last_online_at: number };
  active_run: ActiveRun | null; settled_run_ids: string[];
  settings: { bgm: number; sfx: number; quality: 'auto' | 'high' | 'low'; auto_safe_slot: boolean };
}
const KEY = 'rd_save';
const SCHEMA = 1;

function sum(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

export class SaveManager {
  data!: SaveData;
  private lastCloud = 0; private cloudTimer: any = null; private cloudDirty = false;

  fresh(): SaveData {
    const gp = Cfg.gp;
    return { schema_version: SCHEMA, save_seq: 0, updated_at: Date.now(), config_version: Cfg.version,
      player: { uid: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), level: 1, account_exp: 0, created_at: Date.now() },
      currency: { gold: 0, shard: 0, iron: 0, crystal: 0 },
      inventory: { consumables: { it_potion: 2, it_bomb: 1, it_scroll: 1 }, blueprints: {}, equipment: [], equipped: { weapon: null, armor: null, accessory: null } },
      workshop: { backpack_step: 0, safe_step: 0 }, codex: {},
      progress: { regions: { garden: { unlocked: true, first_clear: false, best_floor: 0 } }, tutorial_step: 0, newbie_protect_left: gp.newbie_protect_runs, total_runs: 0 },
      daily: {}, offline: { last_online_at: Date.now() }, active_run: null, settled_run_ids: [],
      settings: { bgm: 0.6, sfx: 0.8, quality: 'auto', auto_safe_slot: gp.auto_safe_slot } };
  }

  load() {
    const raw = getPlatform().localGet(KEY);
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o.sum !== sum(o.body)) console.warn('[save] 校验和不一致，存档可能被改过');
        this.data = this.migrate(JSON.parse(o.body));
        return;
      } catch (e) { console.error('[save] 读取失败，重建', e); }
    }
    this.data = this.fresh();
    this.write();
  }

  private migrate(d: any): SaveData {
    // 以后：while (d.schema_version < SCHEMA) d = MIGRATIONS[d.schema_version](d);
    return d;
  }

  /** 写本地；important = S1/S3，尽快同步云端（TapTap 每分钟最多上传 1 次，做节流） */
  write(important = false): boolean {
    this.data.save_seq++; this.data.updated_at = Date.now();
    const body = JSON.stringify(this.data);
    const ok = getPlatform().localSet(KEY, JSON.stringify({ sum: sum(body), body }));
    this.cloudDirty = true;
    if (important) this.scheduleCloud();
    return ok;
  }

  private scheduleCloud() {
    if (this.cloudTimer) return;
    const wait = Math.max(0, 61000 - (Date.now() - this.lastCloud));
    this.cloudTimer = setTimeout(() => this.flushCloud(), wait);
  }
  async flushCloud() {
    this.cloudTimer = null;
    if (!this.cloudDirty) return;
    const p = getPlatform(); if (p.id === 'web') { this.cloudDirty = false; return; }
    this.lastCloud = Date.now(); this.cloudDirty = false;
    const r = await p.cloudSave('main', JSON.stringify(this.data));
    if (!r.ok) { console.warn('[save] 云存档失败', r.err); this.cloudDirty = true; }
  }

  get backpackSlots() { const gp = Cfg.gp; return Math.min(gp.backpack_perm_cap, gp.backpack_base + (this.data.player.level >= 5 ? 1 : 0) + this.data.workshop.backpack_step); }
  get safeSlots() { const gp = Cfg.gp; return Math.min(gp.safe_cap, gp.safe_base + (this.data.player.level >= 10 ? 1 : 0) + this.data.workshop.safe_step); }
}
export const Save = new SaveManager();
