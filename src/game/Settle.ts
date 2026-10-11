import { Cfg } from '../config/Config';
import { BagItem, Save } from '../save/SaveManager';

export type RunResultType = 'extract' | 'death' | 'quit' | 'abnormal';
export interface RunResult { run_id: string; region_id: string; result: RunResultType; floor: number; backpack: BagItem[]; safe: BagItem[]; run_gold: number; account_exp: number; kills: number; time_s: number; boss_killed: boolean; is_protected: boolean; }
export interface SettleReport {
  res: RunResult; success: boolean; protectedRun: boolean;
  kept: BagItem[]; lost: BagItem[];
  treasureGold: number; runGoldKept: number; totalGold: number; goldCapped: boolean;
  materials: Record<string, number>; pityShard: number; newCodex: string[]; firstClear: boolean;
  doubleCap: number; rescuable: BagItem[];
}

/** S3：先把结果写进存档，再返回给结算页播动画（GDD §14.5） */
export function settleRun(res: RunResult): SettleReport {
  const gp = Cfg.gp; const d = Save.data;
  if (d.settled_run_ids.includes(res.run_id)) throw new Error('重复结算 ' + res.run_id);
  const success = res.result === 'extract';
  const protectedRun = !success && res.is_protected;
  const all = [...res.safe, ...res.backpack];
  let kept: BagItem[] = [], lost: BagItem[] = [];
  if (success || protectedRun) kept = all.map((i) => ({ ...i }));
  else {
    kept = res.safe.map((i) => ({ ...i }));
    const ratio = (k: BagItem['kind']) => k === 'treasure' ? gp.death_keep_treasure_ratio : k === 'material' ? gp.death_keep_material_ratio : gp.death_keep_blueprint_ratio;
    // 宝物按件数×比例向下取整，从价值最高的开始保留；叠加物按数量×比例向下取整
    const tr = res.backpack.filter((i) => i.kind === 'treasure').sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const keepN = Math.floor(tr.length * ratio('treasure'));
    tr.forEach((i, idx) => (idx < keepN ? kept : lost).push({ ...i }));
    for (const i of res.backpack.filter((i) => i.kind !== 'treasure')) {
      const k = Math.floor(i.count * ratio(i.kind));
      if (k > 0) kept.push({ ...i, count: k });
      if (i.count - k > 0) lost.push({ ...i, count: i.count - k });
    }
  }
  const treasureGold = kept.filter((i) => i.kind === 'treasure').reduce((s, i) => s + (i.value ?? 0), 0);
  const runGoldKept = success || protectedRun ? res.run_gold : Math.floor(res.run_gold * gp.death_keep_run_gold_ratio);
  const cap = gp.settle_gold_cap[res.region_id] ?? 1e9;
  const raw = treasureGold + runGoldKept;
  const totalGold = Math.min(raw, cap);
  const materials: Record<string, number> = {};
  for (const i of kept) if (i.kind === 'material') materials[i.id] = (materials[i.id] ?? 0) + i.count;
  const pityShard = success ? 0 : Math.floor(gp.death_pity_shard_min + Math.random() * (gp.death_pity_shard_max - gp.death_pity_shard_min + 1));

  // 入库
  d.currency.gold += totalGold;
  d.currency.shard += (materials.shard ?? 0) + pityShard;
  d.currency.iron += materials.iron ?? 0;
  d.currency.crystal += materials.crystal ?? 0;
  const newCodex: string[] = [];
  for (const i of kept) if (i.kind === 'treasure' && !d.codex[i.id]) { d.codex[i.id] = Date.now(); newCodex.push(i.id); }
  d.player.account_exp += Math.floor(res.account_exp * (success ? 1 : gp.death_keep_account_exp_ratio));
  const reg = d.progress.regions[res.region_id] ??= { unlocked: true, first_clear: false, best_floor: 0 };
  reg.best_floor = Math.max(reg.best_floor, res.floor);
  let firstClear = false;
  if (success && res.boss_killed && !reg.first_clear && !protectedRun) { reg.first_clear = true; firstClear = true; d.currency.shard += 0; }
  if (res.is_protected && d.progress.newbie_protect_left > 0) d.progress.newbie_protect_left--;
  d.progress.total_runs++;
  d.settled_run_ids.push(res.run_id);
  while (d.settled_run_ids.length > gp.settled_run_ids_keep) d.settled_run_ids.shift();
  d.active_run = null;
  Save.write(true);
  console.log('[track] run_end', { run_id: res.run_id, result: res.result, floor: res.floor, gold: totalGold, gold_capped: raw > cap, kills: res.kills });
  return { res, success, protectedRun, kept, lost, treasureGold, runGoldKept, totalGold, goldCapped: raw > cap, materials, pityShard, newCodex, firstClear,
    doubleCap: Math.min(totalGold, gp.ad_double_cap[res.region_id] ?? 0), rescuable: lost.filter((i) => i.kind !== 'material').sort((a, b) => (b.value ?? 0) - (a.value ?? 0)) };
}

/** 广告抢救（A2）：看完广告后再写一次 */
export function rescueItem(r: SettleReport, item: BagItem) {
  const d = Save.data;
  if (item.kind === 'treasure') { d.currency.gold += item.value ?? 0; if (!d.codex[item.id]) { d.codex[item.id] = Date.now(); r.newCodex.push(item.id); } }
  if (item.kind === 'blueprint') d.inventory.blueprints[item.id] = (d.inventory.blueprints[item.id] ?? 0) + 1;
  Save.write(true);
}
export function addDouble(r: SettleReport) { Save.data.currency.gold += r.doubleCap; Save.write(true); }

/** 启动检查：有未结算的 active_run 一律按阵亡结算 */
export function checkAbnormal(): SettleReport | null {
  const a = Save.data.active_run; if (!a) return null;
  if (Save.data.settled_run_ids.includes(a.run_id)) { Save.data.active_run = null; Save.write(); return null; }
  const s = a.floor_snapshot;
  const rep = settleRun({ run_id: a.run_id, region_id: a.region_id, result: 'abnormal', floor: s.floor, backpack: s.backpack, safe: s.safe, run_gold: s.run_gold,
    account_exp: s.account_exp, kills: 0, time_s: 0, boss_killed: false, is_protected: a.is_protected });
  console.log('[track] abnormal_run_settled', { run_id: a.run_id, floor: s.floor });
  return rep;
}
