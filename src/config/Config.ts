/** 配置表加载。所有数值从 public/config/*.json 读（GDD §17.1），代码里不写死数值。 */
export const TABLES = ['global_param', 'skill', 'skill_level', 'monster', 'boss', 'boss_skill', 'region', 'floor', 'wave',
  'chest', 'treasure', 'material', 'char_level', 'workshop', 'item', 'juice'] as const;

export interface SkillRow { id: string; name: string; category: 'active' | 'passive'; max_level: number; unlock_floor: number; weight: number; upgrade_weight_mul: number; first_pick_ok: boolean; icon: string; desc_tpl: string; enabled: boolean; }
export interface SkillLevelRow { skill_id: string; level: number; cooldown: number; dmg_pct: number; count: number; range: number; duration: number; extra: any; }
export interface MonsterRow { id: string; name: string; hp: number; atk: number; move_speed: number; exp: number; gold_drop_rate: number; ai_type: string; ai_params: any; skins: Record<string, string>; is_elite_allowed: boolean; radius: number; enabled: boolean; }
export interface BossRow { id: string; name: string; hp: number; atk: number; move_speed: number; drop_chest: string; first_clear_reward: any; drops: Record<string, number>; radius: number; }
export interface BossSkillRow { boss_id: string; skill_id: string; cooldown: number; warn_time: number; shape: string; params: any; damage: number; hp_below: number; }
export interface FloorRow { region_id: string; floor: number; is_boss: boolean; boss_id: string; time_sec: number; wave_group: string; chests: Record<string, number>; emergency_exit_rate: number; exp_budget: number; terrain: any; }
export interface WaveRow { wave_group: string; t_start: number; t_end: number; spawn_per_10s: number; monster_weights: Record<string, number>; elite_at: number[]; }
export interface ChestRow { id: string; rarity_weights: Record<string, number>; item_count: number; apply_depth_coef: boolean; gold: [number, number]; materials: Record<string, [number, number]>; open_time: number; on_open: any; sprite: string; }
export interface TreasureRow { id: string; name: string; rarity: Rarity; base_value: number; region: string; set_id: string; icon: string; }
export interface CharLevelRow { level: number; gold_cost: number; shard_cost: number; hp: number; atk: number; reward: any; }
export interface RegionRow { id: string; name: string; floors: number; region_coef: number; unlock_level: number; enabled: boolean; }
export interface WorkshopRow { type: 'backpack' | 'safe'; step: number; gold: number; crystal: number; require_level: number; }
export interface ItemRow { id: string; name: string; effect: any; carry_rule: string; shop_price: number; icon: string; }
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legend'];
export const RARITY_COLOR: Record<Rarity, number> = { common: 0xe8e8e8, uncommon: 0x5fd35f, rare: 0x4aa3ff, epic: 0xb46cff, legend: 0xffc233 };
export const RARITY_NAME: Record<Rarity, string> = { common: '普通', uncommon: '优秀', rare: '稀有', epic: '史诗', legend: '传说' };

class ConfigStore {
  gp: any = {};
  skill: SkillRow[] = []; skillLevel: SkillLevelRow[] = []; monster: MonsterRow[] = []; boss: BossRow[] = []; bossSkill: BossSkillRow[] = [];
  region: RegionRow[] = []; floor: FloorRow[] = []; wave: WaveRow[] = []; chest: ChestRow[] = []; treasure: TreasureRow[] = [];
  material: { id: string; name: string; icon: string }[] = []; charLevel: CharLevelRow[] = []; workshop: WorkshopRow[] = []; item: ItemRow[] = []; juice: Record<string, { type: string; duration_ms: number; amplitude: number; ease: string; priority: number; reduce_motion_mul: number }> = {};
  version = 'local-1';

  load(raw: Record<string, any>) {
    this.gp = raw.global_param; this.skill = raw.skill.filter((s: SkillRow) => s.enabled); this.skillLevel = raw.skill_level;
    this.monster = raw.monster.filter((m: MonsterRow) => m.enabled); this.boss = raw.boss; this.bossSkill = raw.boss_skill;
    this.region = raw.region; this.floor = raw.floor; this.wave = raw.wave; this.chest = raw.chest; this.treasure = raw.treasure;
    this.material = raw.material; this.charLevel = raw.char_level; this.workshop = raw.workshop; this.item = raw.item;
    for (const j of raw.juice ?? []) this.juice[j.key] = j;
    this.validate();
  }
  private validate() {
    const errs: string[] = [];
    for (const s of this.skill) for (let l = 1; l <= s.max_level; l++) if (!this.lvl(s.id, l)) errs.push(`skill_level 缺 ${s.id} Lv${l}`);
    for (const w of this.wave) for (const id of Object.keys(w.monster_weights)) if (!this.mon(id)) errs.push(`wave ${w.wave_group} 引用了不存在的怪 ${id}`);
    for (const f of this.floor) for (const id of Object.keys(f.chests)) if (!this.chestRow(id)) errs.push(`floor 引用了不存在的宝箱 ${id}`);
    if (errs.length) console.error('[config] 校验失败\n' + errs.join('\n'));
  }
  lvl(id: string, l: number) { return this.skillLevel.find((r) => r.skill_id === id && r.level === l)!; }
  mon(id: string) { return this.monster.find((m) => m.id === id)!; }
  chestRow(id: string) { return this.chest.find((c) => c.id === id)!; }
  floorRow(region: string, f: number) { return this.floor.find((r) => r.region_id === region && r.floor === f)!; }
  regionRow(id: string) { return this.region.find((r) => r.id === id)!; }
  charLv(l: number) { return this.charLevel.find((r) => r.level === l) ?? this.charLevel[this.charLevel.length - 1]; }
  materialName(id: string) { return this.material.find((m) => m.id === id)?.name ?? id; }
}
export const Cfg = new ConfigStore();
