import Phaser from 'phaser';
import { BossRow, BossSkillRow, Cfg, MonsterRow, Rarity, RARITY_COLOR, RARITY_NAME, RARITY_ORDER, SkillRow } from '../../config/Config';
import { getPlatform } from '../../platform';
import { BagItem, Save } from '../../save/SaveManager';
import { Juice } from '../Juice';
import { RunResult, settleRun } from '../Settle';
import { Sfx } from '../Sfx';
import { button, C, FONT, panel, txt } from '../ui';
import { CELL, clamp, dist2, fmt, Rng } from '../util';
import { safeInsets } from './MenuScene';

type Img = Phaser.GameObjects.Image;
interface Enemy {
  def: MonsterRow | null; boss: BossRow | null; spr: Img; sh: Img; x: number; y: number; r: number;
  hp: number; maxHp: number; atk: number; spd: number; alive: boolean; elite: boolean;
  st: string; t: number; t2: number; vx: number; vy: number; slowT: number; slow: number; stunT: number; freezeT: number;
  kbx: number; kby: number; flashT: number; baseSX: number; baseSY: number; phase: number; hitCd: Map<any, number>;
  stolen?: BagItem | null; fleeT?: number; mimicChest?: Chest; color: number; glow: Img | null;
}
interface Bullet { kind: string; spr: Img; x: number; y: number; vx: number; vy: number; dmg: number; life: number; enemy: boolean; r: number; hits: Set<Enemy>; bounces: number; t: number; back?: boolean; maxDist?: number; ox?: number; oy?: number; trail?: Img[]; }
interface Drop { kind: 'exp' | 'gold' | 'heart' | 'magnet' | 'item'; spr: Img; x: number; y: number; z: number; value: number; item?: BagItem; st: 'bounce' | 'idle' | 'mag' | 'dead'; t: number; dur: number; h: number; sx: number; sy: number; tx: number; ty: number; vx: number; vy: number; mt: number; fx?: Phaser.GameObjects.GameObject[]; ignoreUntilFar?: boolean; full?: Img; }
interface Chest { id: string; x: number; y: number; spr: Img; opened: boolean; prog: number; mimic: boolean; bar?: Phaser.GameObjects.Graphics; }
interface Pot { x: number; y: number; spr: Img; broken: boolean; }
interface Exit { kind: 'portal' | 'stairs' | 'emergency' | 'boss_entry' | 'boss_exit'; x: number; y: number; spr: Img; active: boolean; prog: number; until: number; ring: Phaser.GameObjects.Graphics; parts?: Phaser.GameObjects.Particles.ParticleEmitter; }
interface Fire { x: number; y: number; t: number; tick: number; spr: Img; }
interface Warn { x: number; y: number; t: number; dur: number; shape: 'circle' | 'fan'; r: number; ang?: number; spread?: number; dmg: number; g: Phaser.GameObjects.Graphics; onHit?: () => void; kind: string; }

const MON_COLOR: Record<string, number> = { mon_slime: 0x7ee36b, mon_slime_mini: 0x9cf08a, mon_bat: 0xa070e0, mon_archer: 0xe8463a, mon_golem: 0x9a9aa6, mon_mimic: 0xb07a3a, mon_thief: 0x8f8f9f, boss_vine_golem: 0x6fbf4a };

export class RunScene extends Phaser.Scene {
  constructor() { super('Run'); }
  // 基础
  stoneGrid: Uint8Array | null = null; gridW = 0; gridH = 0; stoneLayer: Phaser.Tilemaps.TilemapLayer | null = null; roomPlazas: { ox: number; oy: number; x0: number; y0: number; sz: number; cx: number; cy: number }[] = [];
  rng!: Rng; juice!: Juice; floor = 1; isBoss = false; regionCoef = 1; mapW = 0; mapH = 0;
  W = 750; H = 1334; topH = 0; barTop = 0; sa = { top: 0, bottom: 0 };
  tutorial = false; lockTipT = 0;
  now = 0; time0 = 0; floorT = 0; timeLeft = 0; collapse = false; paused = false; modal = false; timeScale = 1; slowUntil = 0; slowScale = 1; globalFreeze = 0;
  // 主角
  px = 0; py = 0; hp = 100; maxHp = 100; atk = 10; baseHp = 100; spd = 3 * CELL; invT = 0; hurtFlash = 0; facing = 1; moving = false; vx = 0; vy = 0; heroLean = 0; animT = 0; stepT = 0; idleT = 0;
  hero!: Img; heroSh!: Img; level = 1; exp = 0; kills = 0; runGold = 0; revived = false; dead = false; extracting = false; bossKilled = false;
  skills = new Map<string, number>(); cdMul = 1; spdMul = 1; pickMul = 1; crit = 0.05; seekerCount = 0; seekerUp = 0; pendingLv = 0; firstPick = true; refreshLeft = 1;
  timers: Record<string, number> = {};
  // 实体
  enemies: Enemy[] = []; bullets: Bullet[] = []; drops: Drop[] = []; chests: Chest[] = []; pots: Pot[] = []; exits: Exit[] = []; fires: Fire[] = []; warns: Warn[] = []; obst: { x: number; y: number; r: number }[] = [];
  petals: Img[] = []; petalAng = 0; boss: Enemy | null = null; guardian: Enemy | null = null; bossRoomY = 0; bossStarted = false; bossT = 0; gate?: Phaser.GameObjects.GameObject;
  grid = new Map<number, Enemy[]>();
  // 背包
  bag: BagItem[] = []; safe: BagItem[] = []; bagSlots = 6; safeSlots = 1; selSlot: { safe: boolean; i: number } | null = null; fullQueue: Drop[] = []; fullPopup: any = null;
  carried: Record<string, number> = {}; shieldT = 0;
  // 输入
  joy = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0 }; joyBase!: Img; joyKnob!: Img;
  // HUD
  hud: any = {}; dmgTexts: Phaser.GameObjects.Text[] = []; expPitch = 0; expPitchT = 0; lastBeep = -1;
  particles!: Phaser.GameObjects.Particles.ParticleEmitter; sparkP!: Phaser.GameObjects.Particles.ParticleEmitter;
  channel: { kind: string; t: number; need: number; exit?: Exit; g: Phaser.GameObjects.Graphics } | null = null; heartbeatT = 0;
  waveRows: any[] = []; spawnAcc = 0; eliteDone = new Set<number>(); thiefAt = -1; emergencyAt = -1; portalShown = false; spawnedEmergency = false;

  init(data: { floor: number }) {
    this.floor = data.floor ?? 1;
    const run = Save.data.active_run!;
    this.rng = new Rng(run.seed + this.floor * 7919);
    const snap = run.floor_snapshot;
    const st = (this.registry.get('runState') as any) ?? null;
    // 跨层保留的局内状态
    this.enemies = []; this.bullets = []; this.drops = []; this.chests = []; this.pots = []; this.exits = []; this.fires = []; this.warns = []; this.obst = []; this.petals = []; this.dmgTexts = [];
    this.grid.clear(); this.timers = {}; this.eliteDone.clear(); this.fullQueue = []; this.fullPopup = null; this.channel = null; this.boss = null; this.guardian = null;
    this.collapse = false; this.paused = false; this.modal = false; this.dead = false; this.extracting = false; this.portalShown = false; this.spawnedEmergency = false; this.bossStarted = false; this.bossT = 0; this.bossKilled = false;
    this.timeScale = 1; this.slowUntil = 0; this.globalFreeze = 0; this.selSlot = null; this.spawnAcc = 0; this.pendingLv = 0;
    if (this.floor === 1 || !st) {
      this.skills = new Map(); this.level = 1; this.exp = 0; this.kills = 0; this.runGold = 0; this.revived = false; this.firstPick = true; this.refreshLeft = 1;
      this.bag = []; this.safe = []; this.carried = { ...run.carried }; this.time0 = Date.now();
      const cl = Cfg.charLv(Save.data.player.level); this.baseHp = cl.hp; this.atk = cl.atk; this.hp = cl.hp;
    } else {
      Object.assign(this, st); this.skills = new Map(st.skillsArr);
      this.bag = snap.backpack.map((i) => ({ ...i })); this.safe = snap.safe.map((i) => ({ ...i }));
    }
    this.bagSlots = Math.min(Cfg.gp.backpack_run_cap, Save.backpackSlots); this.safeSlots = Save.safeSlots;
  }

  create() {
    this.W = this.scale.width; this.H = this.scale.height; this.sa = safeInsets(this);
    this.juice = new Juice(this);
    Sfx.vol = Save.data.settings.sfx;
    const fr = Cfg.floorRow('garden', this.floor); this.isBoss = fr.is_boss; this.regionCoef = Cfg.regionRow('garden').region_coef;
    this.recalc(false);
    this.tutorial = Save.data.progress.total_runs === 0 && Save.data.progress.tutorial_step === 0;
    this.buildMap();
    this.buildFx();
    this.buildHud();
    this.buildMinimap();
    this.buildInput();
    const wg = this.tutorial && this.floor === 1 && Cfg.gp.tutorial_wave_group ? Cfg.gp.tutorial_wave_group : fr.wave_group;
    this.waveRows = Cfg.wave.filter((w) => w.wave_group === wg);
    this.timeLeft = this.isBoss ? 0 : (this.tutorial && this.floor === 1 ? Cfg.gp.tutorial_floor_time_sec ?? fr.time_sec : fr.time_sec); this.floorT = 0;
    if (!this.isBoss && this.floor >= 2 && this.rng.chance(Cfg.gp._thief_rate)) this.thiefAt = this.rng.range(10, 35); else this.thiefAt = -1;
    const er = fr.emergency_exit_rate ?? Cfg.gp.emergency_exit_rate;
    this.emergencyAt = !this.isBoss && this.rng.chance(er) ? this.rng.range(15, 40) : -1;
    this.snapshot();
    this.cameras.main.fadeIn(300);
    this.banner(this.isBoss ? `第 ${this.floor} 层 · BOSS` : `萌芽花园 · 第 ${this.floor} 层`, this.isBoss ? '前厅安全，进门后无法回头' : '倒计时结束前找到撤离光门');
    console.log('[track] floor_start', { floor: this.floor, run_level: this.level, backpack_value: this.bagValue() });
    getPlatform().onHide(() => { if (this.scene.isActive()) this.openPause(); });
  }

  // ======== 数值 ========
  lv(id: string) { return this.skills.get(id) ?? 0; }
  ex(id: string) { const l = this.lv(id); return l ? Cfg.lvl(id, l).extra : null; }
  recalc(heal: boolean) {
    const tough = this.ex('skill_tough')?.v ?? 0;
    const old = this.maxHp; this.maxHp = Math.round(this.baseHp * (1 + tough));
    if (heal) this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - old) + this.maxHp * 0.15);
    this.hp = Math.min(this.hp, this.maxHp);
    this.spdMul = 1 + (this.ex('skill_boots')?.v ?? 0);
    this.cdMul = 1 - (this.ex('skill_beat')?.v ?? 0);
    this.pickMul = 1 + (this.ex('skill_magnet')?.v ?? 0);
    this.crit = Cfg.gp._base_crit + (this.ex('skill_clover')?.v ?? 0);
    this.seekerCount = this.ex('skill_seeker')?.v ?? 0; this.seekerUp = this.ex('skill_seeker')?.v2 ?? 0;
    this.spd = Cfg.gp._player_speed_cells * CELL * this.spdMul;
  }
  depthCoef() { return 1 + Cfg.gp.depth_value_step * (this.floor - 1); }
  monMul() { return Math.pow(Cfg.gp.depth_monster_mul, this.floor - 1) * this.regionCoef; }
  expNeed() { return Cfg.gp.run_exp_a + Cfg.gp.run_exp_b * (this.level - 1); }
  bagValue() { return [...this.bag, ...this.safe].filter((i) => i.kind === 'treasure').reduce((s, i) => s + (i.value ?? 0), 0); }

  // ======== 地图 ========
  buildMap() {
    const R = 18 * CELL;
    if (this.isBoss) { this.mapW = 16 * CELL; this.mapH = 34 * CELL; } else { this.mapW = 3 * R; this.mapH = 3 * R; }
    this.cameras.main.setBackgroundColor('#3d5a2a');
    this.add.tileSprite(0, 0, this.mapW, this.mapH, 'tile_garden_grass').setOrigin(0).setDepth(-1000).setTileScale(1);
    // 石砖：64px 瓦片铺成 tilemap（只渲染镜头内的格子，比遮罩省）
    const cw = Math.ceil(this.mapW / CELL), chh = Math.ceil(this.mapH / CELL);
    this.stoneGrid = new Uint8Array(cw * chh); this.gridW = cw; this.gridH = chh;
    const tm = this.make.tilemap({ tileWidth: CELL, tileHeight: CELL, width: cw, height: chh });
    const ts = tm.addTilesetImage('stone', 'tile_garden_stone_64', CELL, CELL, 0, 0, 0)!;
    this.stoneLayer = tm.createBlankLayer('stone', ts, 0, 0)!.setDepth(-999);
    const stone = (x0: number, y0: number, w: number, h: number, round = false) => {
      for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) {
        if (round && (x === x0 || x === x0 + w - 1) && (y === y0 || y === y0 + h - 1)) continue; // 圆角：去掉 4 个角
        if (x < 0 || y < 0 || x >= cw || y >= chh) continue;
        this.stoneGrid![y * cw + x] = 1; this.stoneLayer!.putTileAt(0, x, y);
      }
    };
    // 边界：外圈一排树（不挡路，只做画框）
    const edge = this.add.graphics().setDepth(-998); edge.lineStyle(26, 0x2b4a1e, 0.5); edge.strokeRect(0, 0, this.mapW, this.mapH);
    for (let x = -CELL; x <= this.mapW + CELL; x += CELL * 2.2) { this.deco('deco_garden_tree', x + this.rng.range(-20, 20), -CELL * 0.2, true); this.deco('deco_garden_tree', x + this.rng.range(-20, 20), this.mapH + CELL * 2.2, true); }
    for (let y = CELL * 1.8; y <= this.mapH + CELL; y += CELL * 2.2) { this.deco('deco_garden_tree', -CELL * 0.6, y, true); this.deco('deco_garden_tree', this.mapW + CELL * 0.6, y); }

    if (this.isBoss) { stone(Math.floor(cw / 2) - 1, 0, 3, chh); stone(2, 2, cw - 4, 20, true); return this.buildBossMap(); }

    // ===== 房间（3×3，每间 18×18 格），规则见美术《花园房间布景规则_v1》 =====
    const N = 3, RC = 18;
    // 房间之间的连路：全连后随机去掉一些，保证每间 ≥2 条且整体连通
    const links: [number, number, number, number][] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { if (i < N - 1) links.push([i, j, i + 1, j]); if (j < N - 1) links.push([i, j, i, j + 1]); }
    const deg = (i: number, j: number, L: typeof links) => L.filter((l) => (l[0] === i && l[1] === j) || (l[2] === i && l[3] === j)).length;
    const connected = (L: typeof links) => { const seen = new Set(['0,0']); const q = [[0, 0]]; while (q.length) { const [i, j] = q.pop()!; for (const l of L) { let o: number[] | null = null; if (l[0] === i && l[1] === j) o = [l[2], l[3]]; else if (l[2] === i && l[3] === j) o = [l[0], l[1]]; if (o && !seen.has(o.join(','))) { seen.add(o.join(',')); q.push(o); } } } return seen.size === N * N; };
    let L = [...links];
    for (const l of Phaser.Utils.Array.Shuffle([...links])) { if (!this.rng.chance(0.3)) continue; const t = L.filter((x) => x !== l); if (deg(l[0], l[1], t) >= 2 && deg(l[2], l[3], t) >= 2 && connected(t)) L = t; }
    this.roomPlazas = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const ox = i * RC, oy = j * RC, cx = ox + 9, cy = oy + 9;
      const sz = this.rng.int(6, 8), x0 = cx - Math.floor(sz / 2), y0 = cy - Math.floor(sz / 2);
      stone(x0, y0, sz, sz, true);
      this.roomPlazas.push({ ox, oy, x0, y0, sz, cx, cy });
      const has = (di: number, dj: number) => L.some((l) => (l[0] === i && l[1] === j && l[2] === i + di && l[3] === j + dj) || (l[2] === i && l[3] === j && l[0] === i + di && l[1] === j + dj));
      if (has(1, 0)) stone(x0 + sz, cy - 1, ox + RC - (x0 + sz), 2);
      if (has(-1, 0)) stone(ox, cy - 1, x0 - ox, 2);
      if (has(0, 1)) stone(cx - 1, y0 + sz, 2, oy + RC - (y0 + sz));
      if (has(0, -1)) stone(cx - 1, oy, 2, y0 - oy);
    }
    for (let r = 0; r < this.roomPlazas.length; r++) {
      const P = this.roomPlazas[r]; const { ox, oy, x0, y0, sz, cx, cy } = P; let solids = 0;
      const C = (gx: number) => gx * CELL;
      // 广场四角柱子，随机缺 0~2 根
      const corners = Phaser.Utils.Array.Shuffle([[x0, y0], [x0 + sz - 1, y0], [x0, y0 + sz - 1], [x0 + sz - 1, y0 + sz - 1]]);
      const miss = this.rng.int(0, 2);
      corners.slice(miss).forEach(([gx, gy]) => { this.prop('prop_pillar', C(gx + 0.5), C(gy + 0.9), true); solids++; });
      // 广场上沿中间的雕像（上方没有小路时才放，小路上不放碰撞物）
      if (this.rng.chance(0.6) && !this.isStone(cx, y0 - 1)) { this.prop('prop_statue', C(cx), C(y0 + 0.8), true); solids++; }
      // 房间四角的自然物件组
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const bx = sx ? ox + RC - this.rng.range(1.5, 3) : ox + this.rng.range(1.5, 3), by = sy ? oy + RC - this.rng.range(1, 2.5) : oy + this.rng.range(2, 3);
        if (this.place('deco_garden_tree', C(bx), C(by), 0.6)) solids++;
        if (this.rng.chance(0.5) && this.place('deco_garden_tree', C(bx + (sx ? -2.2 : 2.2)), C(by + this.rng.range(-0.5, 0.8)), 0.6)) solids++;
        if (this.rng.chance(0.7)) this.place('prop_bush_flower', C(bx + (sx ? -1 : 1) * this.rng.range(0.8, 1.4)), C(by + 1.1), 0);
        if (this.rng.chance(0.6)) this.place('deco_garden_mushroom', C(bx + (sx ? 1 : -1) * 0.9), C(by + 0.6), 0);
      }
      // 草地上的断墙 2~3 段（离房间边 2~4 格）
      for (let k = 0, n = this.rng.int(2, 3), tries = 0; k < n && tries < 30; tries++) {
        const side = this.rng.int(0, 3); const d = this.rng.range(2, 4), t = this.rng.range(3, 15);
        const gx = side === 0 ? ox + t : side === 1 ? ox + RC - d : side === 2 ? ox + t : ox + d;
        const gy = side === 0 ? oy + d + 0.5 : side === 1 ? oy + t : side === 2 ? oy + RC - d : oy + t;
        if (this.place('obs_garden_wall', C(gx), C(gy), 1.0, true)) { k++; solids++; }
      }
      // 点缀：石头 1~2、水洼 0~1、篱笆 0~1
      for (let k = 0, n = this.rng.int(1, 2), tries = 0; k < n && tries < 30; tries++) if (this.place('prop_rock', C(ox + this.rng.range(2, 16)), C(oy + this.rng.range(2, 16)), 0.7)) { k++; solids++; }
      if (this.rng.chance(0.6)) for (let tries = 0; tries < 20; tries++) if (this.place('deco_garden_puddle', C(ox + this.rng.range(2, 16)), C(oy + this.rng.range(2, 16)), 0, false, true)) break;
      if (this.rng.chance(0.5)) for (let tries = 0; tries < 20; tries++) if (this.place('obs_garden_fence', C(ox + this.rng.range(2, 16)), C(oy + this.rng.range(2, 16)), 0.9, true)) { solids++; break; }
      if (this.rng.chance(0.4)) for (let tries = 0; tries < 20; tries++) if (this.place('deco_garden_slab', C(ox + this.rng.range(2, 16)), C(oy + this.rng.range(2, 16)), 0, false, true)) break;
      // 补到至少 8 个碰撞物（石头）
      for (let tries = 0; solids < 8 && tries < 40; tries++) if (this.place(this.rng.chance(0.5) ? 'prop_rock' : 'prop_bush_flower', C(ox + this.rng.range(2, 16)), C(oy + this.rng.range(2, 16)), 0.6)) solids++;
      // 草丛 + 小花 20~30 个，只撒在草地上
      for (let k = 0, n = this.rng.int(20, 30), tries = 0; k < n && tries < 80; tries++) {
        const gx = ox + this.rng.range(0.5, 17.5), gy = oy + this.rng.range(0.5, 17.5);
        if (this.isStone(Math.floor(gx), Math.floor(gy))) continue;
        const img = this.add.image(C(gx), C(gy), this.rng.chance(0.55) ? 'deco_garden_grass' : 'deco_garden_flower').setOrigin(0.5, 1).setDepth(-600 + gy * 0.01);
        if (this.rng.chance(0.5)) img.setFlipX(true); k++;
      }
    }
    // 出生点：中央房间广场中心
    this.px = R * 1.5; this.py = R * 1.5;
    // 陶罐：广场边缘或小路旁 1 格内
    for (let k = 0; k < Cfg.gp._pot_count; k++) { const p = this.edgeSpot(3); this.pots.push({ x: p.x, y: p.y, spr: this.add.image(p.x, p.y, 'prop_pot').setOrigin(0.5, 0.97).setDepth(p.y), broken: false }); this.shadowAt(p.x, p.y, 71); }
    // 宝箱（寻宝直觉加成数量）
    const fr = Cfg.floorRow('garden', this.floor);
    const chestTable: Record<string, number> = this.tutorial && this.floor === 1 && Cfg.gp.tutorial_chests ? Cfg.gp.tutorial_chests : fr.chests;
    let firstChest = true;
    for (const [id, nRaw] of Object.entries(chestTable)) {
      let n = nRaw >= 1 ? nRaw : (this.rng.chance(nRaw) ? 1 : 0);
      n = Math.floor(n * (1 + this.seekerCount) + (this.rng.chance((n * (1 + this.seekerCount)) % 1) ? 1 : 0));
      for (let k = 0; k < n; k++) {
        // 第一个宝箱刷在出生点 4~6 格内（教开箱）
        const near = Cfg.gp.first_chest_near_spawn as number[] | undefined;
        const p = firstChest && near ? this.ringSpot(near[0], near[1]) : this.edgeSpot(5);
        const mimic = !firstChest && id === 'chest_wood' && this.floor >= (Cfg.gp.mimic_min_floor ?? 1) && this.rng.chance(Cfg.gp._mimic_rate);
        const c = this.addChest(id, p.x, p.y, mimic);
        if (firstChest && this.tutorial) (c as any).minRarity = Cfg.gp.tutorial_first_chest_rarity ?? null;
        firstChest = false;
      }
    }
  }
  isStone(gx: number, gy: number) { return gx >= 0 && gy >= 0 && gx < this.gridW && gy < this.gridH && this.stoneGrid![gy * this.gridW + gx] === 1; }
  /** 椭圆影子：宽 = 图宽 70%，高 16px，#1E3C1E 透明度 0.27（布景规则 §图层 5） */
  shadowAt(x: number, y: number, w: number) { this.add.image(x, y - 2, 'shadow_e').setDisplaySize(w * 0.7, 16).setTint(0x1e3c1e).setAlpha(0.27).setDepth(y - 1); }
  /** 立体装饰（可选碰撞，不做规则检查） */
  deco(key: string, x: number, y: number, flip = false) { const img = this.add.image(x, y, key).setOrigin(0.5, 0.97).setDepth(y); if (flip || this.rng.chance(0.5)) img.setFlipX(true); this.shadowAt(x, y, img.width); return img; }
  /** 按布景规则放物件：碰撞物之间 ≥2 格、不压小路、不进广场中心 4×4；flat=平铺装饰 */
  place(key: string, x: number, y: number, rCells: number, wide = false, flat = false): boolean {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    if (x < CELL || y < CELL * 1.5 || x > this.mapW - CELL || y > this.mapH - CELL * 0.5) return false;
    const span = wide ? 2 : 1;
    for (let dx = -span; dx <= span; dx++) for (let dy = -1; dy <= 0; dy++) if (this.isStone(gx + dx, gy + dy)) return false;
    for (const P of this.roomPlazas) if (Math.abs(x / CELL - P.cx) < 2.5 && Math.abs(y / CELL - P.cy) < 2.5) return false;
    if (rCells > 0 && this.obst.some((o) => dist2(x, y, o.x, o.y) < (2 * CELL) ** 2)) return false;
    if (dist2(x, y, this.mapW / 2, this.mapH / 2) < (3 * CELL) ** 2) return false; // 出生点周围留空
    if (flat) { const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(-700); if (this.rng.chance(0.5)) img.setFlipX(true); return true; }
    const img = this.add.image(x, y, key).setOrigin(0.5, 0.97).setDepth(y);
    if (this.rng.chance(0.5) && key !== 'prop_statue') img.setFlipX(true);
    this.shadowAt(x, y, img.width);
    if (rCells > 0) { if (wide) { this.obst.push({ x: x - CELL * 0.5, y: y - 14, r: CELL * 0.55 }); this.obst.push({ x: x + CELL * 0.5, y: y - 14, r: CELL * 0.55 }); } else this.obst.push({ x, y: y - 12, r: rCells * CELL * 0.6 }); }
    return true;
  }
  /** 广场边缘或小路旁 1 格内的草地格（宝箱/陶罐要一眼能看到） */
  edgeSpot(minDist: number) {
    for (let k = 0; k < 200; k++) {
      const gx = this.rng.int(1, this.gridW - 2), gy = this.rng.int(2, this.gridH - 2);
      if (this.isStone(gx, gy)) continue;
      if (!(this.isStone(gx + 1, gy) || this.isStone(gx - 1, gy) || this.isStone(gx, gy + 1) || this.isStone(gx, gy - 1))) continue;
      const x = (gx + 0.5) * CELL, y = (gy + 0.8) * CELL;
      if (dist2(x, y, this.px, this.py) < (minDist * CELL) ** 2) continue;
      if (this.obst.some((o) => dist2(x, y, o.x, o.y) < (o.r + CELL * 0.8) ** 2)) continue;
      if (this.chests.some((c) => dist2(x, y, c.x, c.y) < (CELL * 4) ** 2)) continue;
      if (this.pots.some((c) => dist2(x, y, c.x, c.y) < (CELL * 2) ** 2)) continue;
      return { x, y };
    }
    return this.freeSpot(minDist);
  }
  buildBossMap() {
    // 前厅（下方 10 格）+ Boss 房（上方 24 格）
    this.bossRoomY = 24 * CELL;
    this.px = this.mapW / 2; this.py = this.mapH - CELL * 4;
    const g = this.add.graphics().setDepth(-997);
    g.fillStyle(0x2b1d14, 0.3); g.fillRect(0, this.bossRoomY, this.mapW, this.mapH - this.bossRoomY);
    for (let x = CELL; x < this.mapW; x += CELL * 2) if (Math.abs(x - this.mapW / 2) > CELL * 2) this.prop('prop_pillar', x, this.bossRoomY + 30, true, 0.9);
    this.prop('prop_statue', CELL * 2, this.mapH - CELL * 3, true); this.prop('prop_statue', this.mapW - CELL * 2, this.mapH - CELL * 3, true);
    for (let k = 0; k < 4; k++) this.prop('prop_rock', this.rng.range(2, 14) * CELL, this.rng.range(4, 20) * CELL, true, 0.8);
    this.addExit('boss_entry', CELL * 3, this.mapH - CELL * 6, true);
    this.txtWorld(this.mapW / 2, this.bossRoomY + CELL * 1.6, '▲ 藤蔓巨像的巢穴 ▲', 30, '#ffdf7a');
  }
  txtWorld(x: number, y: number, s: string, size: number, color: string) { return txt(this, x, y, s, size, color, '#2b1d14', 6).setDepth(-900); }
  prop(key: string, x: number, y: number, solid: boolean, sc = 1) {
    const img = this.add.image(x, y, key).setOrigin(0.5, 0.97).setDepth(y).setScale(sc); this.shadowAt(x, y, img.width * sc);
    if (this.rng.chance(0.5) && key !== 'prop_statue') img.setFlipX(true);
    if (solid) this.obst.push({ x, y: y - 10, r: (key === 'prop_rock' ? 0.75 : 0.6) * CELL * sc });
    return img;
  }
  ringSpot(a: number, b: number) {
    for (let k = 0; k < 60; k++) {
      const ang = this.rng.range(0, Math.PI * 2), r = this.rng.range(a, b) * CELL;
      const x = this.px + Math.cos(ang) * r, y = this.py + Math.sin(ang) * r;
      if (x < CELL * 1.5 || y < CELL * 1.5 || x > this.mapW - CELL * 1.5 || y > this.mapH - CELL * 1.5) continue;
      if (this.obst.some((o) => dist2(x, y, o.x, o.y) < (o.r + CELL) ** 2)) continue;
      return { x, y };
    }
    return this.freeSpot(a);
  }
  freeSpot(minDist: number) {
    for (let k = 0; k < 60; k++) {
      const x = this.rng.range(1.5, this.mapW / CELL - 1.5) * CELL, y = this.rng.range(1.5, this.mapH / CELL - 1.5) * CELL;
      if (dist2(x, y, this.px, this.py) < (minDist * CELL) ** 2) continue;
      if (this.obst.some((o) => dist2(x, y, o.x, o.y) < (o.r + CELL) ** 2)) continue;
      if (this.chests.some((c) => dist2(x, y, c.x, c.y) < (CELL * 3) ** 2)) continue;
      return { x, y };
    }
    return { x: this.rng.range(2, this.mapW / CELL - 2) * CELL, y: this.rng.range(2, this.mapH / CELL - 2) * CELL };
  }
  addChest(id: string, x: number, y: number, mimic = false) {
    const row = Cfg.chestRow(id);
    const spr = this.add.image(x, y, row.sprite + '_closed').setOrigin(0.5, 0.97).setDepth(y);
    this.shadowAt(x, y, spr.width);
    if (id === 'chest_curse') this.tweens.add({ targets: spr, alpha: 0.82, yoyo: true, repeat: -1, duration: 700 });
    if (id !== 'chest_wood') this.tweens.add({ targets: spr, scaleY: 1.05, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' });
    const c: Chest = { id, x, y, spr, opened: false, prog: 0, mimic };
    this.chests.push(c); return c;
  }
  addExit(kind: Exit['kind'], x: number, y: number, instant = false): Exit {
    const key = kind === 'stairs' ? 'prop_stairs_down' : 'prop_portal_evac';
    const spr = this.add.image(x, y, key).setOrigin(0.5, 0.85).setDepth(y - 30);
    if (kind === 'emergency') spr.setTint(0xffd27a);
    const ring = this.add.graphics().setDepth(y - 40);
    const e: Exit = { kind, x, y, spr, active: true, prog: 0, until: kind === 'emergency' ? this.floorT + Cfg.gp.emergency_exit_open_sec : Infinity, ring };
    if (kind !== 'stairs') {
      e.parts = this.add.particles(x, y - 40, 'spark', { speedY: { min: -120, max: -60 }, speedX: { min: -20, max: 20 }, lifespan: 900, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 }, tint: kind === 'emergency' ? 0xffd27a : 0x9ff8ff, frequency: 90, emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 50) as any } as any, blendMode: 'ADD' }).setDepth(y + 5);
    }
    if (!instant) {
      // 光门从地面升起 600ms
      spr.setScale(1, 0); this.tweens.add({ targets: spr, scaleY: 1, duration: 600, ease: 'Back.out' });
    }
    this.exits.push(e); return e;
  }

  // ======== 特效基础 ========
  buildFx() {
    this.particles = this.add.particles(0, 0, 'dot', { lifespan: 300, speed: { min: 140, max: 320 }, scale: { start: 0.9, end: 0.1 }, alpha: { start: 1, end: 0 }, emitting: false }).setDepth(9000);
    this.sparkP = this.add.particles(0, 0, 'spark', { lifespan: 220, speed: { min: 40, max: 120 }, scale: { start: 1, end: 0 }, emitting: false, blendMode: 'ADD' }).setDepth(9001);
    this.heroSh = this.add.image(this.px, this.py, 'shadow').setScale(1.35, 1.2);
    this.hero = this.add.sprite(this.px, this.py, 'chr_player_idle_01').setOrigin(0.5, 120 / 128).play('hero_idle') as any;
    this.joyBase = this.add.image(0, 0, 'joy_base').setScrollFactor(0).setDepth(20000).setAlpha(0);
    this.joyKnob = this.add.image(0, 0, 'joy_knob').setScrollFactor(0).setDepth(20001).setAlpha(0);
    // 暗角
    const vg = this.textures.exists('vignette') ? null : this.textures.createCanvas('vignette', 375, 667);
    if (vg) { const ctx = vg.getContext(); const gr = ctx.createRadialGradient(187, 333, 120, 187, 333, 420); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(25,12,0,0.55)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, 375, 667); vg.refresh(); }
    const rv = this.textures.exists('vignette_red') ? null : this.textures.createCanvas('vignette_red', 375, 667);
    if (rv) { const ctx = rv.getContext(); const gr = ctx.createRadialGradient(187, 333, 160, 187, 333, 420); gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, 'rgba(220,0,0,0.75)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, 375, 667); rv.refresh(); }
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDisplaySize(this.W, this.H).setDepth(15000);
    this.hud.red = this.add.image(0, 0, 'vignette_red').setOrigin(0).setScrollFactor(0).setDisplaySize(this.W, this.H).setDepth(15001).setAlpha(0);
  }

  // ======== HUD ========
  buildHud() {
    const W = this.W, top = this.sa.top; const h = this.hud; const D = 16000;
    const sf = (o: any) => o.setScrollFactor(0).setDepth(D);
    this.topH = top + 150;
    const tg = sf(this.add.graphics()); tg.fillGradientStyle(0x1a120b, 0x1a120b, 0x1a120b, 0x1a120b, 0.75, 0.75, 0, 0); tg.fillRect(0, 0, W, this.topH + 20);
    h.pause = sf(button(this, 52, top + 46, 76, 70, 'Ⅱ', () => this.openPause(), 0x7a8a9a, 0x4a5866, 32));
    h.floor = sf(txt(this, 190, top + 44, this.isBoss ? `花园 ${this.floor}/3 BOSS` : `花园 ${this.floor}/3`, 32));
    const cdBox = sf(this.add.graphics()); cdBox.fillStyle(C.out); cdBox.fillRoundedRect(W - 330, top + 12, 150, 66, 18); cdBox.fillStyle(0x3a2a1e); cdBox.fillRoundedRect(W - 325, top + 17, 140, 56, 14);
    h.cd = sf(txt(this, W - 255, top + 45, '1:00', 36, '#fff'));
    h.evac = sf(button(this, W - 88, top + 46, 140, 76, '撤离', () => this.useScroll(), 0x2fb39a, 0x1d7a69, 32));
    h.scrollN = sf(txt(this, W - 40, top + 26, '', 22, '#fff', '#b03a2e', 6));
    // HP
    h.hpG = sf(this.add.graphics()); h.hpT = sf(txt(this, 180, top + 112, '', 22));
    h.lv = sf(txt(this, 395, top + 112, 'Lv.1', 28, '#ffe27a'));
    h.expG = sf(this.add.graphics());
    h.valIcon = sf(this.add.image(W - 190, top + 112, 'icon_coin').setScale(0.3));
    h.val = sf(this.add.text(W - 166, top + 112, '0', { fontFamily: FONT, fontSize: '30px', color: '#ffe27a', stroke: '#2b1d14', strokeThickness: 6, fontStyle: 'bold' }).setOrigin(0, 0.5));
    h.valShown = 0;
    // Boss 血条
    h.bossG = sf(this.add.graphics()); h.bossT = sf(txt(this, W / 2, this.topH + 26, '', 24)); h.bossT.setVisible(false);
    // 底栏
    this.buildBar();
    // 道具按钮
    h.items = [];
    const ids = ['it_potion', 'it_bomb'];
    ids.forEach((id, k) => {
      const x = W - 82, y = this.barTop - 16 - 76 - k * 140;
      const c = this.add.container(x, y).setScrollFactor(0).setDepth(D);
      const g = this.add.graphics(); g.fillStyle(C.out); g.fillCircle(0, 4, 62); g.fillStyle(0xfff3d6); g.fillCircle(0, 0, 56); g.fillStyle(0xbfe3ff); g.fillCircle(0, 0, 48);
      const ic = this.add.image(0, -2, Cfg.item.find((i) => i.id === id)!.icon).setScale(0.62);
      const n = txt(this, 34, 34, '', 26);
      c.add([g, ic, n]); c.setSize(136, 136).setInteractive();
      c.on('pointerdown', () => { this.tweens.add({ targets: c, scale: 0.92, duration: 60, yoyo: true }); this.useItem(id); });
      h.items.push({ id, c, n, x, y, r: 62 });
    });
    h.banner = null;
    this.refreshHud(true);
  }
  buildBar() {
    const h = this.hud; const W = this.W; const D = 16000;
    h.bar?.forEach((o: any) => o.destroy());
    h.bar = [];
    const total = this.safeSlots + this.bagSlots; const rows = Math.ceil(total / 8);
    const cell = 84, gap = 6, left = (W - (8 * cell + 7 * gap)) / 2;
    const barH = rows * (cell + gap) + 28;
    this.barTop = this.H - this.sa.bottom - barH;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(D);
    bg.fillStyle(C.out, 0.92); bg.fillRoundedRect(4, this.barTop, W - 8, barH + this.sa.bottom + 30, 26);
    bg.fillStyle(0x5a3f2a, 0.95); bg.fillRoundedRect(10, this.barTop + 6, W - 20, barH + this.sa.bottom + 20, 22);
    h.bar.push(bg);
    h.slots = [];
    for (let i = 0; i < total; i++) {
      const isSafe = i < this.safeSlots; const r = Math.floor(i / 8), col = i % 8;
      const x = left + col * (cell + gap) + cell / 2, y = this.barTop + 16 + r * (cell + gap) + cell / 2;
      const g = this.add.graphics().setScrollFactor(0).setDepth(D);
      const ic = this.add.image(x, y, 'px').setScrollFactor(0).setDepth(D + 1).setVisible(false);
      const n = this.add.text(x + 36, y + 36, '', { fontFamily: FONT, fontSize: '22px', color: '#fff', stroke: '#2b1d14', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(1, 1).setScrollFactor(0).setDepth(D + 2);
      const lock = this.add.text(x - 36, y - 40, '', { fontSize: '18px' }).setScrollFactor(0).setDepth(D + 2);
      const z = this.add.zone(x, y, cell + gap, cell + gap).setScrollFactor(0).setDepth(D + 3).setInteractive();
      const s = { safe: isSafe, i: isSafe ? i : i - this.safeSlots, x, y, g, ic, n, lock };
      z.on('pointerdown', () => this.tapSlot(s));
      h.slots.push(s); h.bar.push(g, ic, n, lock, z);
    }
  }
  drawSlot(s: any, flash = 0) {
    const it: BagItem | undefined = s.safe ? this.safe[s.i] : this.bag[s.i];
    const g: Phaser.GameObjects.Graphics = s.g; g.clear();
    const sel = this.selSlot && this.selSlot.safe === s.safe && this.selSlot.i === s.i;
    const rar = it?.kind === 'treasure' ? this.treasureRarity(it.id) : null;
    g.fillStyle(sel ? 0xffe27a : C.out); g.fillRoundedRect(s.x - 42, s.y - 42, 84, 84, 14);
    g.fillStyle(s.safe ? 0x3d7ad6 : 0xd7b98a); g.fillRoundedRect(s.x - 38, s.y - 38, 76, 76, 11);
    g.fillStyle(s.safe ? 0x274f8f : 0x9b7a52); g.fillRoundedRect(s.x - 33, s.y - 33, 66, 66, 9);
    if (rar) { g.lineStyle(4, RARITY_COLOR[rar], 1); g.strokeRoundedRect(s.x - 33, s.y - 33, 66, 66, 9); }
    if (flash) { g.fillStyle(flash, 0.7); g.fillRoundedRect(s.x - 38, s.y - 38, 76, 76, 11); }
    if (it) { s.ic.setTexture(this.itemIcon(it)).setVisible(true).setDisplaySize(76, 76); s.n.setText(it.kind === 'material' && it.count > 1 ? String(it.count) : it.kind === 'treasure' ? fmt(it.value ?? 0) : ''); s.n.setFontSize(it.kind === 'treasure' ? 18 : 22); }
    else { s.ic.setVisible(false); s.n.setText(''); }
    s.lock.setText(s.safe ? (it?.locked ? '🔒' : '🛡') : '');
  }
  treasureRarity(id: string): Rarity { return Cfg.treasure.find((t) => t.id === id)?.rarity ?? 'common'; }
  // ======== 小地图（右上角圆形，以主角为中心，1 格 = 4px） ========
  mm: any = null;
  buildMinimap() {
    const S = 4 / CELL; const top = this.topH + 8; const cx = this.W - 98, cy = top + 88, R = 72;
    const key = 'mm_bg_' + this.floor;
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, this.gridW * 4, this.gridH * 4)!; const ctx = tex.getContext();
    ctx.fillStyle = '#5fae3e'; ctx.fillRect(0, 0, this.gridW * 4, this.gridH * 4);
    ctx.fillStyle = '#ead9a6';
    for (let y = 0; y < this.gridH; y++) for (let x = 0; x < this.gridW; x++) if (this.isStone(x, y)) ctx.fillRect(x * 4, y * 4, 4, 4);
    ctx.fillStyle = 'rgba(30,60,30,0.75)';
    for (const o of this.obst) { ctx.beginPath(); ctx.arc(o.x * S, o.y * S, Math.max(1.5, o.r * S), 0, Math.PI * 2); ctx.fill(); }
    tex.refresh();
    const D = 15800;
    const back = this.add.circle(cx, cy, R + 2, 0x1a120b, 0.55).setScrollFactor(0).setDepth(D);
    const bg = this.add.image(cx, cy, key).setOrigin(0).setScrollFactor(0).setDepth(D + 1).setAlpha(0.92);
    const mg = this.make.graphics({}); mg.fillStyle(0xffffff); mg.fillCircle(cx, cy, R); mg.setScrollFactor(0);
    bg.setMask(mg.createGeometryMask());
    const frame = this.add.image(cx, cy, 'ui_minimap_frame').setScrollFactor(0).setDepth(D + 3).setDisplaySize(R * 2 + 30, R * 2 + 30);
    const player = this.add.image(cx, cy, 'ui_minimap_player').setScrollFactor(0).setDepth(D + 2.5).setScale(0.8);
    this.mm = { cx, cy, R, S, bg, back, frame, player, marks: new Map<any, Img>() };
  }
  updateMinimap() {
    const m = this.mm; if (!m) return;
    m.bg.setPosition(m.cx - this.px * m.S, m.cy - this.py * m.S);
    const want: [any, string, number, number, boolean][] = [];
    for (const c of this.chests) if (!c.opened) want.push([c, 'ui_minimap_chest', c.x, c.y, false]);
    for (const e of this.exits) if (e.active) want.push([e, e.kind === 'stairs' ? 'ui_minimap_stairs' : 'ui_minimap_portal', e.x, e.y, true]);
    if (this.boss?.alive) want.push([this.boss, 'ui_minimap_boss', this.boss.x, this.boss.y, true]);
    const seen = new Set();
    for (const [o, key, wx, wy, pin] of want) {
      let dx = (wx - this.px) * m.S, dy = (wy - this.py) * m.S; const d = Math.hypot(dx, dy); const lim = m.R - 10;
      let img = m.marks.get(o);
      if (d > lim && !pin) { img?.setVisible(false); seen.add(o); continue; }
      if (d > lim) { dx *= lim / d; dy *= lim / d; } // 光门、阶梯、Boss 在范围外时贴在圆边上
      if (!img) { img = this.add.image(0, 0, key).setScrollFactor(0).setDepth(15802).setScale(0.7); m.marks.set(o, img); }
      img.setVisible(true).setPosition(m.cx + dx, m.cy + dy).setAlpha(d > lim ? 0.75 + Math.sin(this.now * 6) * 0.25 : 1);
      seen.add(o);
    }
    for (const [o, img] of m.marks) if (!seen.has(o)) { img.destroy(); m.marks.delete(o); }
  }
  skillIcon(id: string) { const k = 'icon_' + id; return this.textures.exists(k) ? k : 'ic_' + id; }
  itemIcon(it: BagItem) {
    if (it.kind === 'treasure') { const k = 'icon_' + it.id; return this.textures.exists(k) ? k : 'gem_' + this.treasureRarity(it.id); }
    if (it.kind === 'blueprint') return 'icon_blueprint';
    return Cfg.material.find((m) => m.id === it.id)?.icon ?? 'icon_relic_shard';
  }
  refreshHud(force = false) {
    const h = this.hud, top = this.sa.top;
    // HP
    const k = clamp(this.hp / this.maxHp, 0, 1);
    h.hpG.clear(); h.hpG.fillStyle(C.out); h.hpG.fillRoundedRect(28, top + 94, 304, 38, 19); h.hpG.fillStyle(0x5a1d1d); h.hpG.fillRoundedRect(33, top + 99, 294, 28, 14);
    h.hpG.fillStyle(k < 0.3 ? 0xff3b30 : 0xff5f6d); h.hpG.fillRoundedRect(33, top + 99, Math.max(14, 294 * k), 28, 14); h.hpG.fillStyle(0xffffff, 0.35); h.hpG.fillRoundedRect(40, top + 102, Math.max(6, 280 * k), 8, 4);
    h.hpT.setText(`${Math.ceil(this.hp)}/${this.maxHp}`);
    h.lv.setText(`Lv.${this.level}`);
    const e = clamp(this.exp / this.expNeed(), 0, 1);
    h.expG.clear(); h.expG.fillStyle(C.out); h.expG.fillRoundedRect(440, top + 100, 150, 26, 13); h.expG.fillStyle(0x253a5a); h.expG.fillRoundedRect(444, top + 104, 142, 18, 9); h.expG.fillStyle(0x6fc8ff); h.expG.fillRoundedRect(444, top + 104, Math.max(9, 142 * e), 18, 9);
    const sc = this.carried.it_scroll ?? 0; h.scrollN.setText(sc ? '×' + sc : ''); h.evac.setAlpha(sc ? 1 : 0.55);
    for (const it of h.items) { const n = this.carried[it.id] ?? 0; it.n.setText(String(n)); it.c.setAlpha(n ? 1 : 0.4); }
    if (force) for (const s of h.slots) this.drawSlot(s);
  }
  pulse(o: any, s = 1.2) { this.tweens.killTweensOf(o); o.setScale(1); this.tweens.add({ targets: o, scale: s, duration: 50, yoyo: true, ease: 'Quad.out' }); }
  banner(title: string, sub: string) {
    const y = this.topH + 170;
    // 新横幅顶掉旧的，不叠字
    const old: any = (this as any).curBanner; if (old?.active) { this.tweens.killTweensOf(old); old.destroy(); }
    const c = this.add.container(this.W / 2, y).setScrollFactor(0).setDepth(17000); (this as any).curBanner = c;
    const g = this.add.graphics(); g.fillStyle(0x000000, 0.55); g.fillRoundedRect(-330, -60, 660, 120, 30);
    c.add([g, txt(this, 0, -16, title, 40, '#ffe27a'), txt(this, 0, 32, sub, 24, '#fff')]);
    c.setAlpha(0).setScale(0.8); this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 250, ease: 'Back.out' });
    this.tweens.add({ targets: c, alpha: 0, y: y - 40, delay: 2000, duration: 400, onComplete: () => c.destroy() });
  }
  toast(msg: string, color = '#ffffff') {
    const t = txt(this, this.W / 2, this.topH + 260, msg, 30, color).setScrollFactor(0).setDepth(17001);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  // ======== 输入 ========
  inJoyZone(x: number, y: number) {
    if (y < this.topH || y > this.barTop - 16) return false;
    for (const it of this.hud.items) if (dist2(x, y, it.x, it.y) < (it.r + 12) ** 2) return false;
    if (this.fullPopup && y > this.fullPopup.y0 - 10) return false;
    return true;
  }
  buildInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      Sfx.unlock();
      if (this.modal || this.joy.active || !this.inJoyZone(p.x, p.y)) return;
      this.joy = { active: true, id: p.id, bx: p.x, by: p.y, dx: 0, dy: 0 };
      this.joyBase.setPosition(p.x, p.y); this.joyKnob.setPosition(p.x, p.y);
      this.tweens.add({ targets: [this.joyBase, this.joyKnob], alpha: 1, duration: 80 });
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.joy.active || p.id !== this.joy.id) return;
      let dx = p.x - this.joy.bx, dy = p.y - this.joy.by; const R = 80; const d = Math.hypot(dx, dy);
      if (d > R) { // 拖到边缘时底座跟随
        this.joy.bx = p.x - (dx / d) * R; this.joy.by = p.y - (dy / d) * R; dx = p.x - this.joy.bx; dy = p.y - this.joy.by;
        this.joyBase.setPosition(this.joy.bx, this.joy.by);
      }
      this.joy.dx = dx / R; this.joy.dy = dy / R; this.joyKnob.setPosition(p.x, p.y);
    });
    const up = (p: Phaser.Input.Pointer) => { if (p.id !== this.joy.id) return; this.joy.active = false; this.joy.dx = this.joy.dy = 0; this.tweens.add({ targets: [this.joyBase, this.joyKnob], alpha: 0, duration: 120 }); };
    this.input.on('pointerup', up); this.input.on('pointerupoutside', up);
    // 电脑调试：WASD / 方向键
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as any;
  }
  keys: any;

  // ======== 主循环 ========
  update(_t: number, rawMs: number) {
    const realDt = Math.min(rawMs, 50) / 1000;
    this.juice.update(rawMs);
    this.updateDmgTexts(realDt);
    if (this.fullPopup) this.updateFullPopup(realDt);
    if (this.paused || this.modal) { this.updateCamera(); return; }
    // 时间流速：背包满慢动作 / Boss 击杀慢动作
    let ts = 1;
    if (this.fullPopup) ts = Cfg.gp.full_popup_timescale;
    if (this.now < this.slowUntil) ts = Math.min(ts, this.slowScale);
    const dt = realDt * ts;
    this.now += dt; this.floorT += dt;
    if (this.globalFreeze > 0) { this.globalFreeze -= realDt * 1000; }
    const frozen = this.globalFreeze > 0;
    if (!frozen) this.updatePlayer(dt);
    this.updateCamera();
    this.updateMinimap();
    this.updateTimer(dt);
    this.updateSpawns(dt);
    this.rebuildGrid();
    if (!frozen) this.updateEnemies(dt);
    this.updateSkills(dt);
    this.updateBullets(dt);
    this.updateFires(dt);
    this.updateWarns(dt);
    this.updateDrops(dt);
    this.updateChests(dt);
    this.updatePots();
    this.updateExits(dt);
    this.updateChannel(dt);
    if (this.isBoss) this.updateBoss(dt);
    this.updateHudLive(realDt);
    if (this.pendingLv > 0 && !this.modal && !this.fullPopup && !this.dead) this.openLevelUp();
  }

  updatePlayer(dt: number) {
    let mx = this.joy.dx, my = this.joy.dy;
    const k = this.keys; if (k) { if (k.A.isDown || k.LEFT.isDown) mx = -1; if (k.D.isDown || k.RIGHT.isDown) mx = 1; if (k.W.isDown || k.UP.isDown) my = -1; if (k.S.isDown || k.DOWN.isDown) my = 1; }
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    const lockMove = this.channel?.kind === 'scroll';
    const want = m > 0.15 && !lockMove && !this.dead;
    // 速度平滑：起步约 0.08 秒到全速，松手约 0.06 秒停下（不再瞬间启停）
    const tx = want ? mx * this.spd : 0, ty = want ? my * this.spd : 0;
    const acc = 1 - Math.exp(-dt * (want ? 26 : 34));
    this.vx += (tx - this.vx) * acc; this.vy += (ty - this.vy) * acc;
    const spdNow = Math.hypot(this.vx, this.vy);
    this.moving = want || spdNow > this.spd * 0.25;
    if (this.dead || lockMove) { this.vx = this.vy = 0; this.moving = false; }
    if (this.moving) {
      let nx = this.px + this.vx * dt, ny = this.py + this.vy * dt;
      for (const o of this.obst) { const dd = Math.hypot(nx - o.x, ny - o.y); const rr = o.r + 22; if (dd < rr && dd > 0) { nx = o.x + ((nx - o.x) / dd) * rr; ny = o.y + ((ny - o.y) / dd) * rr; } }
      if (this.isBoss && this.bossStarted) ny = Math.min(ny, this.bossRoomY - 20);
      this.px = clamp(nx, 30, this.mapW - 30); this.py = clamp(ny, 40, this.mapH - 20);
      if (want && Math.abs(mx) > 0.1) this.facing = mx > 0 ? 1 : -1;
      this.animT += dt; this.stepT += dt; this.idleT = 0;
      if (this.stepT > 0.5 * CELL / this.spd) { this.stepT = 0; this.particles.emitParticleAt(this.px - this.facing * 10, this.py - 4, 1); this.dust(); }
    } else { this.animT = 0; this.idleT += dt; }
    // 动画：序列帧（跑 8 帧 / 待机 6 帧 / 受击 2 帧）+ 前倾 + 左右轻摆
    const hs: any = this.hero;
    if (this.dead) { hs.anims.stop(); hs.setTexture('chr_player_dead_01'); }
    else if (!this.extracting) {
      const anim = this.hurtFlash > 0 ? 'hero_hurt' : this.moving ? 'hero_run' : 'hero_idle';
      if (hs.anims.currentAnim?.key !== anim) hs.play(anim, true);
      if (anim === 'hero_run') hs.anims.timeScale = clamp(spdNow / this.spd, 0.6, 1.3);
    }
    const k01 = clamp(spdNow / this.spd, 0, 1);
    const lean = this.facing * 0.1 * k01 + Math.sin(this.animT * 12 * Math.PI / 4) * 0.035 * k01; // 前倾约 6°，每两步左右摆一次
    this.heroLean += (lean - this.heroLean) * (1 - Math.exp(-dt * 16));
    hs.setFlipX(this.facing < 0).setDepth(this.py).setRotation(this.heroLean); if (!this.extracting) hs.setPosition(this.px, this.py);
    const breathe = this.moving ? 1 : 1 + Math.sin(this.now * 3) * 0.015;
    const HS = 1.25; // 主角显示放大 1.25 倍（碰撞半径不变）
    hs.setScale(HS / breathe, HS * breathe);
    this.heroSh.setPosition(this.px, this.py + 2).setDepth(this.py - 1);
    if (this.invT > 0) { this.invT -= dt; this.hero.setAlpha(Math.floor(this.invT * 20) % 2 ? 0.45 : 1); } else this.hero.setAlpha(1);
    if (this.hurtFlash > 0) { this.hurtFlash -= dt; this.hero.setTintFill(0xff3b3b); if (Math.floor(this.hurtFlash / 0.08) % 2) this.hero.clearTint(); } else this.hero.clearTint();
    if (this.shieldT > 0) { this.shieldT -= dt; this.hero.setTint(0x9fdcff); }
    // 花瓣
    this.updatePetals(dt);
  }
  dust() { const d = this.add.image(this.px - this.facing * 14, this.py, 'dot').setTint(0xd8c9a0).setAlpha(0.6).setScale(1.2).setDepth(this.py - 2); this.tweens.add({ targets: d, alpha: 0, scale: 2.2, y: d.y - 8, duration: 350, onComplete: () => d.destroy() }); }

  updateCamera() {
    const cam = this.cameras.main;
    const midY = (this.topH + this.barTop) / 2;
    cam.setScroll(this.px - this.W / 2 + this.juice.ox, this.py - midY + this.juice.oy);
  }

  updateTimer(dt: number) {
    if (this.isBoss) { if (this.bossStarted && this.boss?.alive) this.bossT += dt; return; }
    const prev = this.timeLeft;
    this.timeLeft -= dt;
    const gp = Cfg.gp;
    if (!this.portalShown && this.timeLeft <= gp.portal_open_at) this.showPortals();
    if (this.emergencyAt > 0 && !this.spawnedEmergency && this.floorT >= this.emergencyAt) {
      this.spawnedEmergency = true;
      const p = this.farSpot(10); this.addExit('emergency', p.x, p.y); Sfx.play('sfx_portal_appear');
      this.toast('紧急撤离点出现了！只开放 20 秒', '#ffd27a');
    }
    if (this.thiefAt > 0 && this.floorT >= this.thiefAt) { this.thiefAt = -1; const p = this.spawnPos(); this.spawnEnemy('mon_thief', p.x, p.y); this.toast('盗宝鼠出没！小心你的宝物', '#ffd27a'); }
    // 最后 10 秒每秒"嘀"，最后 3 秒变快
    if (this.timeLeft > 0 && this.timeLeft <= 10) {
      const step = this.timeLeft <= 3 ? 0.5 : 1; const b = Math.ceil(this.timeLeft / step);
      if (b !== this.lastBeep) { this.lastBeep = b; Sfx.play('sfx_countdown', this.timeLeft <= 3 ? 1.3 : 1); this.pulse(this.hud.cd, 1.35); }
    }
    if (prev > 0 && this.timeLeft <= 0) this.startCollapse();
    if (this.collapse) this.updateCollapse(dt);
  }
  showPortals() {
    this.portalShown = true;
    const p1 = this.farSpot(Cfg.gp.portal_min_dist); const e = this.addExit('portal', p1.x, p1.y);
    const p2 = this.farSpot(Cfg.gp.portal_min_dist, p1); this.addExit('stairs', p2.x, p2.y);
    Sfx.play('sfx_portal_appear');
    this.banner('撤离光门出现了！', '带着宝物撤离，或走下行阶梯继续深入');
    // 地面光点足迹 3 秒
    const n = 14; for (let i = 1; i <= n; i++) {
      const x = this.px + (e.x - this.px) * (i / (n + 1)), y = this.py + (e.y - this.py) * (i / (n + 1));
      const d = this.add.image(x, y, 'spark').setTint(0x9ff8ff).setBlendMode('ADD').setDepth(-500).setAlpha(0).setScale(1.2);
      this.tweens.add({ targets: d, alpha: 1, delay: i * 60, duration: 200, yoyo: true, hold: 2400 - i * 60, onComplete: () => d.destroy() });
    }
  }
  farSpot(minCells: number, avoid?: { x: number; y: number }) {
    let best = this.freeSpot(minCells);
    if (avoid) for (let k = 0; k < 20; k++) { const p = this.freeSpot(minCells); if (dist2(p.x, p.y, avoid.x, avoid.y) > (CELL * 8) ** 2) { best = p; break; } }
    return best;
  }
  startCollapse() {
    this.collapse = true; this.banner('遗迹开始崩塌！', '遗迹守卫出现了，快撤离！');
    const p = this.spawnPos(); const g = this.spawnEnemy('npc_guardian', p.x, p.y); this.guardian = g;
    this.timers.rock = 0; this.timers.gAccel = 0;
  }
  updateCollapse(dt: number) {
    this.timers.rock -= dt;
    if (this.timers.rock <= 0) {
      this.timers.rock = Cfg.gp._collapse_rock_interval;
      for (let i = 0; i < 2; i++) {
        const x = this.px + this.rng.range(-4, 4) * CELL, y = this.py + this.rng.range(-5, 5) * CELL;
        this.addWarn({ x, y, shape: 'circle', r: CELL * 0.9, dur: 1, dmg: Cfg.gp._collapse_rock_dmg, kind: 'rock' });
      }
    }
    this.timers.gAccel += dt;
    if (this.guardian && this.timers.gAccel >= 10) { this.timers.gAccel = 0; this.guardian.spd *= 1 + Cfg.gp._collapse_guardian_accel; }
  }

  // ======== 刷怪 ========
  spawnPos() {
    const cam = this.cameras.main; const m = 90;
    for (let k = 0; k < 20; k++) {
      const side = this.rng.int(0, 3); let x = 0, y = 0;
      const L = cam.scrollX - m, R = cam.scrollX + this.W + m, T = cam.scrollY + this.topH - m, B = cam.scrollY + this.barTop + m;
      if (side === 0) { x = this.rng.range(L, R); y = T; } else if (side === 1) { x = this.rng.range(L, R); y = B; } else if (side === 2) { x = L; y = this.rng.range(T, B); } else { x = R; y = this.rng.range(T, B); }
      if (x < 40 || y < 40 || x > this.mapW - 40 || y > this.mapH - 40) continue;
      if (this.obst.some((o) => dist2(x, y, o.x, o.y) < (o.r + 30) ** 2)) continue;
      return { x, y };
    }
    return { x: clamp(this.px + this.rng.range(-1, 1) * 500, 40, this.mapW - 40), y: clamp(this.py - 700, 40, this.mapH - 40) };
  }
  updateSpawns(dt: number) {
    if (this.isBoss) return;
    const t = this.floorT; const row = this.waveRows.find((w) => t >= w.t_start && t < w.t_end); if (!row) return;
    const cap = Save.data.settings.quality === 'low' ? Cfg.gp.max_enemies_low : Cfg.gp.max_enemies;
    this.spawnAcc += (row.spawn_per_10s / 10) * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= cap) break;
      const id = this.rng.weighted(row.monster_weights as Record<string, number>);
      const p = this.spawnPos();
      if (id === 'mon_bat') { const g = Cfg.mon('mon_bat').ai_params.group; const n = this.rng.int(g[0], g[1]); for (let i = 0; i < n; i++) this.spawnEnemy(id, p.x + this.rng.range(-50, 50), p.y + this.rng.range(-50, 50)); this.spawnAcc -= (n - 1) * 0; }
      else this.spawnEnemy(id, p.x, p.y);
    }
    for (const r of this.waveRows) for (const at of r.elite_at as number[]) if (t >= at && !this.eliteDone.has(at)) {
      this.eliteDone.add(at);
      const ids = Object.keys(r.monster_weights).filter((i) => Cfg.mon(i).is_elite_allowed);
      const p = this.spawnPos(); this.spawnEnemy(this.rng.pick(ids), p.x, p.y, true); this.toast('精英怪来袭！', '#ffd27a');
    }
  }
  spawnEnemy(id: string, x: number, y: number, elite = false, boss: BossRow | null = null): Enemy {
    const gp = Cfg.gp; const def = boss || id === 'npc_guardian' ? null : Cfg.mon(id);
    const key = boss ? 'boss_vine_golem_idle' : id === 'npc_guardian' ? 'guardian' : (elite && id === 'mon_slime' ? 'mon_slime_elite' : def!.skins.garden ?? id);
    const mul = boss ? 1 : this.monMul();
    let hp = boss ? boss.hp : def ? def.hp * mul : 1e9, atk = boss ? boss.atk : def ? def.atk * mul : 0;
    if (elite) { hp *= gp._elite_hp_mul; atk *= gp._elite_atk_mul; }
    if (this.tutorial && !boss) atk *= gp.tutorial_monster_atk_mul ?? 1;
    const sc = elite ? gp._elite_scale : 1;
    const spr = this.add.image(x, y, key).setOrigin(0.5, 0.92).setScale(sc);
    const sh = this.add.image(x, y, 'shadow').setScale((spr.width / 60) * sc, sc);
    // 怪物红紫描边光（资源规范 §11：着色器 2px 外发光 #D9468C，透明度 0.6）
    // 用同贴图的纯色底图做描边，不用 preFX（preFX 每个对象单独一次渲染，会打断合批）
    const glow = id === 'npc_guardian' ? null : this.add.image(x, y, key).setOrigin(0.5, 0.92).setTintFill(elite ? 0xffc533 : 0xd9468c).setAlpha(elite ? 0.9 : 0.6);
    const spdBase = boss ? boss.move_speed : def ? def.move_speed : gp._collapse_guardian_speed;
    const e: Enemy = { def, boss, spr, sh, x, y, r: (boss ? boss.radius : def ? def.radius : 1.1) * CELL * sc, hp, maxHp: hp, atk, spd: spdBase * gp._player_speed_cells * CELL, alive: true, elite,
      st: 'move', t: 0, t2: this.rng.range(0, 2), vx: 0, vy: 0, slowT: 0, slow: 0, stunT: 0, freezeT: 0, kbx: 0, kby: 0, flashT: 0, baseSX: sc, baseSY: sc, phase: this.rng.range(0, 6.28), hitCd: new Map(), color: MON_COLOR[id] ?? 0xffffff, glow };
    if (id === 'npc_guardian') { e.atk = 0; e.st = 'guardian'; }
    if (def?.ai_type === 'mimic') e.st = 'hidden';
    if (def?.ai_type === 'thief') { e.stolen = null; e.st = 'seek'; }
    // 出场：从地面冒出
    spr.setScale(sc * 0.3, sc * 1.4).setAlpha(0); this.tweens.add({ targets: spr, scaleX: sc, scaleY: sc, alpha: 1, duration: 220, ease: 'Back.out' });
    this.enemies.push(e); return e;
  }
  rebuildGrid() {
    this.grid.clear(); const S = 128;
    for (const e of this.enemies) { if (!e.alive || e.st === 'hidden') continue; const k = Math.floor(e.x / S) * 10000 + Math.floor(e.y / S); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(e); }
  }
  near(x: number, y: number, r: number, cb: (e: Enemy) => void) {
    const S = 128; const x0 = Math.floor((x - r) / S), x1 = Math.floor((x + r) / S), y0 = Math.floor((y - r) / S), y1 = Math.floor((y + r) / S);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = this.grid.get(i * 10000 + j); if (a) for (const e of a) if (e.alive && dist2(x, y, e.x, e.y) < (r + e.r) ** 2) cb(e); }
  }
  nearest(x: number, y: number, maxR: number, exclude?: Set<Enemy>) {
    let best: Enemy | null = null, bd = maxR * maxR;
    for (const e of this.enemies) { if (!e.alive || e.st === 'hidden' || e.st === 'guardian' || exclude?.has(e)) continue; const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ======== 怪物 AI ========
  updateEnemies(dt: number) {
    const gp = Cfg.gp;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.freezeT > 0) { e.freezeT -= dt * 1000; continue; }
      if (e.flashT > 0) { e.flashT -= dt * 1000; if (e.flashT <= 0) e.spr.clearTint(); }
      if (e.slowT > 0) e.slowT -= dt;
      if (e.stunT > 0) { e.stunT -= dt; this.drawEnemy(e, dt); continue; }
      const slow = e.slowT > 0 ? 1 - e.slow : 1;
      const dx = this.px - e.x, dy = this.py - e.y, d = Math.hypot(dx, dy) || 1;
      let vx = 0, vy = 0; const sp = e.spd * slow;
      const ai = e.boss ? 'boss' : e.def?.ai_type ?? e.st;
      e.t += dt;
      switch (ai) {
        case 'chase': vx = (dx / d) * sp; vy = (dy / d) * sp; break;
        case 'swarm': { const p = e.def!.ai_params; const s = Math.sin(e.t * p.wave_freq + e.phase) * p.wave_amp; vx = (dx / d - (dy / d) * s) * sp; vy = (dy / d + (dx / d) * s) * sp; break; }
        case 'ranged': {
          const p = e.def!.ai_params; const kd = p.keep_dist * CELL;
          const dir = d > kd + 30 ? 1 : d < kd - 30 ? -1 : 0; vx = (dx / d) * sp * dir; vy = (dy / d) * sp * dir;
          e.t2 -= dt; if (e.t2 <= 0 && d < kd * 2.2) { e.t2 = p.shoot_cd; this.enemyShot(e, p.bullet_speed * CELL, e.elite ? 3 : 1); }
          break;
        }
        case 'charge': {
          const p = e.def!.ai_params;
          if (e.st === 'move') { vx = (dx / d) * sp; vy = (dy / d) * sp; e.t2 -= dt; if (d < p.trigger_dist * CELL && e.t2 <= 0) { e.st = 'windup'; e.t = 0; e.spr.setTint(0xff5040); } }
          else if (e.st === 'windup') { e.spr.x = e.x + Math.sin(e.t * 60) * 3; if (e.t >= p.windup) { e.st = 'dash'; e.t = 0; e.vx = dx / d; e.vy = dy / d; e.spr.clearTint(); } }
          else if (e.st === 'dash') { vx = e.vx * p.dash_speed * CELL; vy = e.vy * p.dash_speed * CELL; if (e.t >= p.dash_dist / p.dash_speed) { e.st = 'move'; e.t2 = p.cooldown; } }
          break;
        }
        case 'mimic': if (e.st === 'chase') { vx = (dx / d) * sp; vy = (dy / d) * sp; } break;
        case 'thief': {
          if (e.st === 'seek') { vx = (dx / d) * sp; vy = (dy / d) * sp; if (d < e.r + 40) this.thiefSteal(e); }
          else { vx = (-dx / d) * sp * 1.1; vy = (-dy / d) * sp * 1.1; e.fleeT = (e.fleeT ?? 0) - dt; if ((e.fleeT ?? 0) <= 0) { this.removeEnemy(e, true); this.toast('盗宝鼠带着宝物跑掉了…', '#ff9c9c'); continue; } }
          break;
        }
        case 'guardian': vx = (dx / d) * sp; vy = (dy / d) * sp; break;
        case 'boss': if (this.bossStarted && e.st !== 'cast') { vx = (dx / d) * sp; vy = (dy / d) * sp; } break;
      }
      // 分离：避免挤成一团
      if (ai !== 'boss' && ai !== 'guardian') this.near(e.x, e.y, e.r, (o) => { if (o === e || o.boss) return; const ox = e.x - o.x, oy = e.y - o.y; const od = Math.hypot(ox, oy) || 1; const push = (e.r + o.r - od) * 4; if (push > 0) { vx += (ox / od) * push; vy += (oy / od) * push; } });
      e.x += (vx + e.kbx * 10) * dt; e.y += (vy + e.kby * 10) * dt; e.kbx *= 0.8; e.kby *= 0.8;
      if (ai !== 'guardian' && !e.boss) for (const o of this.obst) { const od = Math.hypot(e.x - o.x, e.y - o.y); const rr = o.r + e.r * 0.6; if (od < rr && od > 0) { e.x = o.x + ((e.x - o.x) / od) * rr; e.y = o.y + ((e.y - o.y) / od) * rr; } }
      e.x = clamp(e.x, 20, this.mapW - 20); e.y = clamp(e.y, 30, this.mapH - 10);
      if (vx) e.spr.setFlipX(vx < 0);
      this.drawEnemy(e, dt);
      // 碰撞伤害
      if (e.st !== 'hidden' && d < e.r + 26) {
        if (ai === 'guardian') this.hurtPlayer(this.maxHp * gp._collapse_guardian_dmg_pct, e);
        else if (e.atk > 0) this.hurtPlayer(e.atk * (this.bossEnrage2() && e.boss ? 2 : 1), e);
      }
    }
    // 回收
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
  }
  drawEnemy(e: Enemy, dt: number) {
    if (e.st === 'hidden') return;
    // 史莱姆、蝙蝠的弹跳由程序缩放补（资源规范 §11-4）
    let sx = e.baseSX, sy = e.baseSY, oy = 0;
    const id = e.def?.id ?? '';
    if (id.startsWith('mon_slime')) { const s = Math.sin(e.t * 9 + e.phase); sx *= 1 + s * 0.08; sy *= 1 - s * 0.08; oy = Math.max(0, s) * 6; }
    else if (id === 'mon_bat') { oy = 18 + Math.sin(e.t * 14 + e.phase) * 6; sy *= 1 + Math.sin(e.t * 28) * 0.06; }
    else if (!e.boss) { oy = Math.abs(Math.sin(e.t * 8 + e.phase)) * 4; }
    else { const s = Math.sin(e.t * 2.5); sy *= 1 + s * 0.02; }
    if (!this.tweens.isTweening(e.spr)) e.spr.setScale(sx, sy);
    if (e.st !== 'windup') e.spr.x = e.x;
    e.spr.y = e.y - oy; e.spr.setDepth(e.y);
    e.sh.setPosition(e.x, e.y + 2).setDepth(e.y - 1);
    if (e.glow) { const k = (e.spr.displayWidth + 5) / e.spr.displayWidth; e.glow.setPosition(e.spr.x, e.spr.y + 2).setScale(e.spr.scaleX * k, e.spr.scaleY * (e.spr.displayHeight + 5) / e.spr.displayHeight).setFlipX(e.spr.flipX).setDepth(e.y - 0.5).setVisible(e.spr.visible); }
    if (e.boss) this.drawBossBar();
  }
  enemyShot(e: Enemy, speed: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(this.py - 30 - (e.y - 30), this.px - e.x) + (i - (n - 1) / 2) * 0.25;
      const spr = this.add.image(e.x, e.y - 30, 'arrow').setRotation(a).setDepth(9500);
      this.bullets.push({ kind: 'arrow', spr, x: e.x, y: e.y - 30, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg: e.atk, life: 4, enemy: true, r: 12, hits: new Set(), bounces: 0, t: 0 });
    }
  }
  thiefSteal(e: Enemy) {
    const tr = this.bag.filter((i) => i.kind === 'treasure').sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0];
    if (tr) { this.bag.splice(this.bag.indexOf(tr), 1); e.stolen = tr; this.toast(`盗宝鼠偷走了 ${this.trName(tr.id)}！15 秒内打倒它`, '#ff9c9c'); this.refreshHud(true); }
    e.st = 'flee'; e.fleeT = Cfg.gp._thief_steal_window; e.spd *= 1.1;
  }
  trName(id: string) { return Cfg.treasure.find((t) => t.id === id)?.name ?? id; }

  // ======== 伤害 ========
  damage(e: Enemy, pct: number, opt: { kx?: number; ky?: number; src?: any; noCrit?: boolean } = {}) {
    if (!e.alive || e.st === 'hidden' || e.st === 'guardian') return;
    const isCrit = !opt.noCrit && Math.random() < this.crit;
    const dmg = Math.max(1, Math.round(this.atk * pct * (isCrit ? Cfg.gp._crit_mul : 1)));
    e.hp -= dmg;
    // 闪白 60ms + 挤压回弹 + 击退
    e.spr.setTintFill(0xffffff); e.flashT = Cfg.juice.flash_monster_hit?.duration_ms ?? 60;
    const sq = Cfg.juice.squash_monster_hit; if (sq && !e.boss) { this.tweens.killTweensOf(e.spr); e.spr.setScale(e.baseSX * (1 + sq.amplitude), e.baseSY * (1 - sq.amplitude)); this.tweens.add({ targets: e.spr, scaleX: e.baseSX, scaleY: e.baseSY, duration: sq.duration_ms, ease: 'Back.out' }); }
    if (!e.boss && opt.kx !== undefined) { const kb = (e.elite ? 0.05 : 0.15) * CELL; const l = Math.hypot(opt.kx, opt.ky!) || 1; e.kbx += (opt.kx / l) * kb; e.kby += (opt.ky! / l) * kb; }
    if (isCrit) { const hs = this.juice.hitstop('hitstop_crit', this.time.now); if (hs) e.freezeT = hs; Sfx.play('sfx_crit'); } else Sfx.play('sfx_hit', 0.9 + Math.random() * 0.3, 0.04);
    this.dmgText(e.x, e.y - e.spr.displayHeight * 0.8, dmg, isCrit ? 'crit' : 'normal', e);
    if (e.hp <= 0) this.kill(e);
  }
  kill(e: Enemy) {
    e.alive = false; this.kills++;
    const gp = Cfg.gp;
    // 死亡：闪白 + 放大 1.2 → 80ms 后碎粒飞散
    e.spr.setTintFill(0xffffff); this.tweens.killTweensOf(e.spr);
    this.tweens.add({ targets: e.spr, scale: e.spr.scale * 1.2, duration: 80, onComplete: () => {
      this.particles.setParticleTint(e.color); this.particles.emitParticleAt(e.x, e.y - 30, this.rng.int(6, 10) * (e.boss ? 4 : 1));
      this.sparkP.emitParticleAt(e.x, e.y - 30, 3); e.spr.destroy(); } });
    this.tweens.add({ targets: e.sh, alpha: 0, duration: 200, onComplete: () => e.sh.destroy() });
    e.glow?.destroy();
    Sfx.play('sfx_enemy_die', 0.9 + Math.random() * 0.3, 0.05);
    if (e.boss) return this.onBossKilled(e);
    const def = e.def!;
    // 掉落
    const exp = e.elite ? gp._elite_exp : def.exp;
    if (exp > 0) this.spawnDrop('exp', e.x, e.y, exp);
    if (Math.random() < def.gold_drop_rate) this.spawnDrop('gold', e.x, e.y, 1);
    if (e.elite) {
      this.spawnItem({ id: 'crystal', count: 1, kind: 'material' }, e.x, e.y);
      if (Math.random() < 0.5) this.spawnItem({ id: 'shard', count: 1, kind: 'material' }, e.x, e.y);
      const hs = this.juice.hitstop('hitstop_elite_kill', this.time.now); if (hs) this.globalFreeze = hs; this.juice.shake('shake_elite_die');
    }
    if (def.ai_type === 'chase' && def.ai_params.split_id && Math.random() < (this.tutorial && Cfg.gp.tutorial_split_rate != null ? Cfg.gp.tutorial_split_rate : def.ai_params.split_rate)) for (let i = 0; i < def.ai_params.split_count; i++) this.spawnEnemy(def.ai_params.split_id, e.x + (i ? 20 : -20), e.y);
    if (def.ai_type === 'mimic') { this.spawnItem(this.rollTreasure('rare', false), e.x, e.y); }
    if (def.ai_type === 'thief') {
      if (e.stolen) { this.spawnItem(e.stolen, e.x, e.y); this.toast('抢回了宝物！', '#a8ff9c'); }
      for (let i = 0; i < 5; i++) this.spawnDrop('gold', e.x, e.y, Math.round(def.ai_params.bonus_gold * this.regionCoef / 5));
    }
  }
  removeEnemy(e: Enemy, fade = false) { e.alive = false; e.glow?.destroy(); if (fade) this.tweens.add({ targets: [e.spr, e.sh], alpha: 0, duration: 300, onComplete: () => { e.spr.destroy(); e.sh.destroy(); } }); else { e.spr.destroy(); e.sh.destroy(); } }

  hurtPlayer(amount: number, src: any) {
    if (this.invT > 0 || this.shieldT > 0 || this.dead || this.extracting) return;
    const dmg = Math.round(amount);
    this.hp -= dmg; this.invT = Cfg.gp._player_iframe_sec; this.hurtFlash = 0.16;
    const low = this.hp / this.maxHp < 0.3;
    this.juice.shake(low ? 'shake_player_hurt_low' : 'shake_player_hurt');
    if (low) { this.hud.red.setAlpha(0.9); this.tweens.add({ targets: this.hud.red, alpha: 0.35, duration: 300 }); }
    const hs = this.juice.hitstop('hitstop_player_hurt', this.time.now); if (hs) this.globalFreeze = Math.max(this.globalFreeze, hs);
    this.juice.vibrate('vibrate_player_hurt');
    Sfx.play('sfx_player_hurt', 1, 0.3);
    this.dmgText(this.px, this.py - 120, dmg, 'hurt');
    // 受击打断：开箱 / 卷轴读条
    if (this.channel?.kind === 'scroll') this.breakChannel('受击，卷轴读条中断');
    for (const c of this.chests) if (c.prog > 0 && !c.opened) { c.prog = 0; c.bar?.clear(); }
    // 引导局锁血：HP 最低 1，不进死亡流程（GDD v1.2 §10.2）
    if (this.hp <= 0 && this.tutorial && Cfg.gp.tutorial_hp_lock) { this.hp = 1; if (this.now - this.lockTipT > 3) { this.lockTipT = this.now; this.banner('小心！', '快躲开怪物，引导局不会倒下'); } }
    this.refreshHud();
    if (this.hp <= 0) this.onDeath();
  }

  // ======== 飘字（同屏最多 30 个） ========
  dmgText(x: number, y: number, v: number, kind: 'normal' | 'crit' | 'hurt' | 'heal' | 'gold', target?: any) {
    // 同一目标 0.3 秒内的普通伤害合并成一个数字（数字变大、轻弹一下）
    if (target && kind === 'normal') {
      const old: any = this.dmgTexts.find((t: any) => t.target === target && t.kind === 'normal' && t.life < 0.3);
      if (old) { old.v += v; old.setText(String(old.v)); old.life = 0; old.x0 = x; old.y0 = y - old.stackOff; old.setFontSize(Math.min(40, 28 + Math.log2(1 + old.hits++) * 4) + 'px'); old.setScale(1.25); this.tweens.add({ targets: old, scale: 1, duration: 100 }); return; }
    }
    // 错开：附近已有的飘字越多，新的越往上
    let stack = 0; for (const t of this.dmgTexts as any[]) if (t.life < 0.45 && Math.abs(t.x0 - x) < 70 && Math.abs(t.y0 - y) < 90) stack++;
    const stackOff = Math.min(stack, 4) * 30;
    y -= stackOff; x += (stack % 2 ? 1 : -1) * Math.min(stack, 4) * 14;
    if (this.dmgTexts.length >= 30) { const i = this.dmgTexts.findIndex((t: any) => t.kind === 'normal'); if (i >= 0 && kind !== 'crit' && kind !== 'hurt') return; if (i >= 0) { this.dmgTexts[i].destroy(); this.dmgTexts.splice(i, 1); } }
    const style: any = { fontFamily: FONT, fontStyle: 'bold', stroke: '#1a0f08', strokeThickness: 6 };
    let s = String(v), size = 28, color = '#ffffff';
    if (kind === 'crit') { s = '暴击 ' + v; size = 40; color = '#ffb020'; }
    if (kind === 'hurt') { s = '-' + v; size = 32; color = '#ff4040'; }
    if (kind === 'heal') { s = '+' + v; color = '#66ff77'; }
    if (kind === 'gold') { s = '+' + v; size = 24; color = '#ffd84a'; }
    const t: any = this.add.text(x + (Math.random() - 0.5) * 20, y, s, { ...style, fontSize: size + 'px', color }).setOrigin(0.5).setDepth(12000);
    if (kind === 'crit') t.setGradient?.(0);
    t.kind = kind; t.target = target; t.v = v; t.hits = 1; t.stackOff = stackOff; t.life = 0; t.dur = kind === 'crit' ? 0.8 : 0.6; t.y0 = t.y; t.x0 = t.x;
    if (kind === 'crit') { t.setScale(1.5); this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' }); }
    this.dmgTexts.push(t);
  }
  updateDmgTexts(dt: number) {
    for (let i = this.dmgTexts.length - 1; i >= 0; i--) {
      const t: any = this.dmgTexts[i]; t.life += dt; const k = t.life / t.dur;
      if (t.kind === 'hurt') t.y = t.y0 + 30 * k; else t.y = t.y0 - (t.kind === 'crit' ? 60 : 40) * Math.min(1, k * 1.3);
      if (t.kind === 'crit' && t.life < 0.25) t.x = t.x0 + Math.sin(t.life * 80) * 3;
      t.setAlpha(k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      if (k >= 1) { t.destroy(); this.dmgTexts.splice(i, 1); }
    }
  }

  // ======== 技能 ========
  cd(key: string, base: number, dt: number) { this.timers[key] = (this.timers[key] ?? 0) - dt; if (this.timers[key] <= 0) { this.timers[key] = base * this.cdMul; return true; } return false; }
  updateSkills(dt: number) {
    if (this.dead || this.extracting) return;
    const gp = Cfg.gp;
    // 魔法弹弓
    if (this.cd('sling', gp._slingshot_cd, dt)) {
      const t = this.nearest(this.px, this.py, gp._slingshot_range * CELL);
      if (t) { const a = Math.atan2(t.y - 30 - (this.py - 50), t.x - this.px); this.shoot('pellet', a, gp._bullet_speed * CELL, 1, { r: 14 }); Sfx.play('sfx_shoot', 1, 0.06); }
      else this.timers.sling = 0.1;
    }
    let l: number;
    if ((l = this.lv('skill_boomerang'))) { const r = Cfg.lvl('skill_boomerang', l); if (this.cd('boom', r.cooldown, dt)) { const t = this.nearest(this.px, this.py, 9 * CELL); const base = t ? Math.atan2(t.y - this.py, t.x - this.px) : (this.facing > 0 ? 0 : Math.PI); for (let i = 0; i < r.count; i++) this.shoot('boomerang', base + (i - (r.count - 1) / 2) * 0.5, 9 * CELL, r.dmg_pct, { r: 22, maxDist: r.range * CELL, life: 3 }); } }
    if ((l = this.lv('skill_thunder'))) { const r = Cfg.lvl('skill_thunder', l); if (this.cd('thunder', r.cooldown, dt)) this.castThunder(r); }
    if ((l = this.lv('skill_frost'))) { const r = Cfg.lvl('skill_frost', l); if (this.cd('frost', r.cooldown, dt)) this.castFrost(r); }
    if ((l = this.lv('skill_fire'))) { const r = Cfg.lvl('skill_fire', l); if (this.moving && this.cd('fire', r.cooldown, dt)) { const s = this.add.image(this.px, this.py, 'flame').setDepth(this.py - 3).setBlendMode('ADD').setScale(0.2); this.tweens.add({ targets: s, scale: 1, duration: 150 }); this.fires.push({ x: this.px, y: this.py, t: r.duration, tick: 0, spr: s }); } }
    if ((l = this.lv('skill_bubble'))) { const r = Cfg.lvl('skill_bubble', l); if (this.cd('bubble', r.cooldown, dt)) { const t = this.nearest(this.px, this.py, 8 * CELL); if (t) this.shoot('bubble', Math.atan2(t.y - this.py, t.x - this.px), r.extra.speed * CELL, r.dmg_pct, { r: 20, bounces: r.count, life: 4 }); } }
  }
  shoot(kind: string, a: number, speed: number, pct: number, o: { r: number; maxDist?: number; life?: number; bounces?: number }) {
    const spr = this.add.image(this.px, this.py - 50, kind).setDepth(9500).setRotation(a);
    if (kind === 'bubble') spr.setScale(0.9);
    const b: Bullet = { kind, spr, x: this.px, y: this.py - 50, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg: pct, life: o.life ?? 1.2, enemy: false, r: o.r, hits: new Set(), bounces: o.bounces ?? 0, t: 0, maxDist: o.maxDist, ox: this.px, oy: this.py - 50 };
    if (kind === 'pellet') b.trail = [0, 1, 2].map((i) => this.add.image(b.x, b.y, 'pellet').setDepth(9499).setAlpha(0.45 - i * 0.13).setScale(0.85 - i * 0.18));
    this.bullets.push(b);
  }
  updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.t += dt; b.life -= dt;
      if (b.kind === 'boomerang') {
        b.spr.rotation += dt * 18;
        if (!b.back && Math.hypot(b.x - b.ox!, b.y - b.oy!) >= b.maxDist!) { b.back = true; b.hits.clear(); }
        if (b.back) { const dx = this.px - b.x, dy = this.py - 50 - b.y, d = Math.hypot(dx, dy) || 1; const sp = Math.hypot(b.vx, b.vy); b.vx = (dx / d) * sp; b.vy = (dy / d) * sp; if (d < 30) b.life = 0; }
      }
      const px = b.x, py = b.y; b.x += b.vx * dt; b.y += b.vy * dt; b.spr.setPosition(b.x, b.y);
      if (b.trail) { b.trail[2].setPosition(b.trail[1].x, b.trail[1].y); b.trail[1].setPosition(b.trail[0].x, b.trail[0].y); b.trail[0].setPosition(px, py); }
      if (b.enemy) {
        if (dist2(b.x, b.y, this.px, this.py - 40) < (b.r + 24) ** 2) { this.hurtPlayer(b.dmg, b); b.life = 0; }
      } else {
        let hit: Enemy | null = null;
        this.near(b.x, b.y + 30, b.r, (e) => { if (hit || b.hits.has(e) || e.st === 'guardian') return; hit = e; });
        if (hit) {
          const e = hit as Enemy;
          b.hits.add(e);
          this.damage(e, b.dmg, { kx: b.vx, ky: b.vy });
          if (b.kind === 'pellet') { this.sparkP.emitParticleAt(b.x, b.y, 2); b.life = 0; }
          if (b.kind === 'bubble') {
            if (b.bounces-- > 0) { const n = this.nearest(e.x, e.y, 4 * CELL, b.hits); if (n) { const a = Math.atan2(n.y - e.y, n.x - e.x); const sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.life = 2; } else b.life = 0; }
            else b.life = 0;
            this.pulse(b.spr, 1.3);
          }
        }
      }
      if (b.x < 0 || b.y < 0 || b.x > this.mapW || b.y > this.mapH) b.life = 0;
      if (b.life <= 0) { b.spr.destroy(); b.trail?.forEach((t) => t.destroy()); }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }
  updatePetals(dt: number) {
    const l = this.lv('skill_petal'); if (!l) return;
    const r = Cfg.lvl('skill_petal', l);
    while (this.petals.length < r.count) this.petals.push(this.add.image(this.px, this.py, 'petal').setDepth(9400));
    this.petalAng += dt * r.extra.rot_speed;
    const R = r.range * CELL;
    this.petals.forEach((p, i) => {
      const a = this.petalAng + (i / this.petals.length) * Math.PI * 2;
      p.setPosition(this.px + Math.cos(a) * R, this.py - 40 + Math.sin(a) * R * 0.8).setRotation(a + Math.PI / 2);
      this.near(p.x, p.y + 30, 18, (e) => { const k = e.hitCd.get(p) ?? -1; if (this.now - k >= r.extra.hit_interval) { e.hitCd.set(p, this.now); this.damage(e, r.dmg_pct, { kx: e.x - this.px, ky: e.y - this.py }); } });
    });
  }
  castThunder(r: any) {
    const cam = this.cameras.main;
    const cands = this.enemies.filter((e) => e.alive && e.st !== 'hidden' && e.st !== 'guardian' && e.x > cam.scrollX && e.x < cam.scrollX + this.W && e.y > cam.scrollY + this.topH && e.y < cam.scrollY + this.barTop);
    if (!cands.length) { this.timers.thunder = 0.3; return; }
    Phaser.Utils.Array.Shuffle(cands);
    Sfx.play('sfx_thunder');
    for (const e of cands.slice(0, r.count)) {
      const g = this.add.graphics().setDepth(11000).setBlendMode('ADD');
      let x = e.x + this.rng.range(-30, 30), y = e.y - 700; g.lineStyle(8, 0xfff27a, 1); g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 7; i++) { x = e.x + this.rng.range(-26, 26) * (1 - i / 7); y += (e.y - 30 - (e.y - 700)) / 7; g.lineTo(x, y); } g.strokePath();
      g.lineStyle(3, 0xffffff, 1); g.strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
      const flash = this.add.image(e.x, e.y - 20, 'disc').setTint(0xfff27a).setBlendMode('ADD').setScale(0.6).setDepth(11000);
      this.tweens.add({ targets: flash, alpha: 0, scale: 1.1, duration: 200, onComplete: () => flash.destroy() });
      e.stunT = Math.max(e.stunT, r.extra.stun);
      this.damage(e, r.dmg_pct);
    }
  }
  castFrost(r: any) {
    const R = r.range * CELL;
    const ring = this.add.image(this.px, this.py - 20, 'ring').setTint(0xaaf0ff).setBlendMode('ADD').setScale(0.2).setDepth(9300);
    const disc = this.add.image(this.px, this.py - 20, 'disc').setTint(0x7fdcff).setAlpha(0.35).setScale(0.2).setDepth(9299).setBlendMode('ADD');
    this.tweens.add({ targets: [ring, disc], scale: (R * 2) / 128, duration: 260, ease: 'Quad.out' });
    this.tweens.add({ targets: [ring, disc], alpha: 0, delay: 180, duration: 260, onComplete: () => { ring.destroy(); disc.destroy(); } });
    this.near(this.px, this.py, R, (e) => { e.slowT = r.duration; e.slow = r.extra.slow; this.damage(e, r.dmg_pct, { kx: e.x - this.px, ky: e.y - this.py }); if (!e.boss) e.spr.setTint(0x9fe6ff); });
  }
  updateFires(dt: number) {
    const l = this.lv('skill_fire'); const r = l ? Cfg.lvl('skill_fire', l) : null;
    for (const f of this.fires) {
      f.t -= dt; f.tick -= dt; f.spr.setScale(0.9 + Math.sin(this.now * 20 + f.x) * 0.1);
      if (r && f.tick <= 0) { f.tick = r.extra.tick; this.near(f.x, f.y, r.range * CELL, (e) => this.damage(e, r.dmg_pct, { noCrit: false })); }
      if (f.t <= 0) this.tweens.add({ targets: f.spr, alpha: 0, scale: 0.3, duration: 200, onComplete: () => f.spr.destroy() });
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  // ======== 地面预警（Boss 技能、落石） ========
  addWarn(o: { x: number; y: number; shape: 'circle' | 'fan'; r: number; dur: number; dmg: number; kind: string; ang?: number; spread?: number; onHit?: () => void }) {
    const g = this.add.graphics().setDepth(-400);
    this.warns.push({ ...o, t: 0, g });
    if (o.kind === 'rock') { const sh = this.add.image(o.x, o.y, 'shadow').setDepth(-399).setScale(0.3).setAlpha(0.6); this.tweens.add({ targets: sh, scale: 1.6, duration: o.dur * 1000, onComplete: () => sh.destroy() }); }
  }
  updateWarns(dt: number) {
    for (const w of this.warns) {
      w.t += dt; const k = Math.min(1, w.t / w.dur);
      const g = w.g; g.clear();
      g.fillStyle(0xff2a2a, 0.18 + 0.2 * k); g.lineStyle(4, 0xff3b3b, 0.9);
      if (w.shape === 'circle') { g.fillCircle(w.x, w.y, w.r); g.strokeCircle(w.x, w.y, w.r); g.fillStyle(0xff2a2a, 0.35); g.fillCircle(w.x, w.y, w.r * k); }
      else { g.slice(w.x, w.y, w.r, w.ang! - w.spread! / 2, w.ang! + w.spread! / 2, false); g.fillPath(); g.strokePath(); g.fillStyle(0xff2a2a, 0.3); g.slice(w.x, w.y, w.r * k, w.ang! - w.spread! / 2, w.ang! + w.spread! / 2, false); g.fillPath(); }
      if (w.t >= w.dur) {
        const dx = this.px - w.x, dy = this.py - w.y; const d = Math.hypot(dx, dy);
        let hit = d < w.r + 20;
        if (w.shape === 'fan' && hit) { const a = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - w.ang!); hit = Math.abs(a) <= w.spread! / 2; }
        if (hit) this.hurtPlayer(w.dmg * (this.bossEnrage2() && w.kind !== 'rock' ? 2 : 1), w);
        if (w.kind === 'rock') {
          const rk = this.add.image(w.x, w.y - 600, 'rock_fall').setDepth(w.y + 1);
          this.tweens.add({ targets: rk, y: w.y - 20, duration: 120, onComplete: () => { this.particles.setParticleTint(0xb8ab98); this.particles.emitParticleAt(w.x, w.y, 8); if (d < 6 * CELL) this.juice.shake('shake_rock'); this.tweens.add({ targets: rk, alpha: 0, delay: 300, duration: 300, onComplete: () => rk.destroy() }); } });
        } else { this.juice.shake('shake_boss_hit'); this.particles.setParticleTint(0x6fbf4a); this.particles.emitParticleAt(w.x, w.y, 10); }
        w.onHit?.();
        g.destroy();
      }
    }
    this.warns = this.warns.filter((w) => w.t < w.dur);
  }

  // ======== 掉落 ========
  spawnDrop(kind: 'exp' | 'gold' | 'heart' | 'magnet', x: number, y: number, value: number) {
    const key = kind === 'exp' ? 'icon_exp_star' : kind === 'gold' ? 'icon_coin' : 'obj_pickup_' + kind;
    const sc = kind === 'heart' || kind === 'magnet' ? 1.1 : 1.3 * (kind === 'exp' ? (value >= 50 ? 0.5 : value >= 10 ? 0.38 : 0.24) : 0.26);
    const spr = this.add.image(x, y, key).setScale(sc).setDepth(y);
    const a = Math.random() * Math.PI * 2, dd = this.rng.range(0.3, 0.8) * CELL;
    const d: Drop = { kind, spr, x, y, z: 0, value, st: 'bounce', t: 0, dur: (Cfg.juice.bounce_exp?.duration_ms ?? 300) / 1000, h: Cfg.juice.bounce_exp?.amplitude ?? 24, sx: x, sy: y, tx: clamp(x + Math.cos(a) * dd, 20, this.mapW - 20), ty: clamp(y + Math.sin(a) * dd, 20, this.mapH - 20), vx: 0, vy: 0, mt: 0 };
    (d as any).sc = sc;
    this.drops.push(d); return d;
  }
  spawnItem(item: BagItem, x: number, y: number, delay = 0) {
    const spr = this.add.image(x, y, this.itemIcon(item)).setScale(item.kind === 'treasure' ? 0.72 : 0.55).setDepth(y);
    const a = -Math.PI / 2 + this.rng.range(-1.2, 1.2), dd = this.rng.range(0.8, 1.4) * CELL;
    const j = Cfg.juice.bounce_treasure;
    const d: Drop = { kind: 'item', spr, x, y, z: 0, value: item.value ?? 0, item, st: 'bounce', t: -delay, dur: (j?.duration_ms ?? 450) / 1000, h: j?.amplitude ?? 48, sx: x, sy: y, tx: clamp(x + Math.cos(a) * dd, 30, this.mapW - 30), ty: clamp(y + Math.sin(a) * dd * 0.6 + 30, 30, this.mapH - 30), vx: 0, vy: 0, mt: 0, fx: [] };
    (d as any).sc = spr.scale; spr.setVisible(delay <= 0);
    // 品质光柱：白无、绿/蓝/紫/金依次变高变亮；紫色以上地面脉冲光环
    if (item.kind === 'treasure') {
      const r = this.treasureRarity(item.id); const ri = RARITY_ORDER.indexOf(r);
      if (ri >= 1) {
        const beam = this.add.graphics().setBlendMode('ADD');
        const hgt = 60 + ri * 45, a0 = 0.18 + ri * 0.08;
        beam.fillGradientStyle(RARITY_COLOR[r], RARITY_COLOR[r], RARITY_COLOR[r], RARITY_COLOR[r], 0, 0, a0, a0); beam.fillRect(-16, -hgt, 32, hgt);
        beam.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0, 0, a0, a0); beam.fillRect(-5, -hgt, 10, hgt);
        beam.setVisible(false); d.fx!.push(beam);
      }
      if (ri >= 3) { const ring = this.add.image(0, 0, 'ring').setTint(RARITY_COLOR[r]).setBlendMode('ADD').setScale(0.3, 0.15).setVisible(false); this.tweens.add({ targets: ring, scaleX: 0.9, scaleY: 0.45, alpha: 0, duration: 1100, repeat: -1 }); d.fx!.push(ring); }
    }
    this.drops.push(d); return d;
  }
  rollTreasure(minRarity: Rarity | null, depth: boolean, weights?: Record<string, number>): BagItem {
    let r: Rarity = minRarity ?? 'common';
    if (weights) { r = this.rng.weighted(weights) as Rarity; if (minRarity && RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf(minRarity)) r = minRarity; } // 保底品质不被权重覆盖
    if (this.seekerUp && this.rng.chance(this.seekerUp)) r = RARITY_ORDER[Math.min(4, RARITY_ORDER.indexOf(r) + 1)];
    let pool = Cfg.treasure.filter((t) => t.region === 'garden' && t.rarity === r);
    while (!pool.length) { r = RARITY_ORDER[RARITY_ORDER.indexOf(r) - 1]; pool = Cfg.treasure.filter((t) => t.region === 'garden' && t.rarity === r); } // 区域没有该品质时降档
    const t = this.rng.pick(pool);
    return { id: t.id, count: 1, kind: 'treasure', value: Math.round(t.base_value * this.regionCoef * (depth ? this.depthCoef() : 1)) };
  }
  updateDrops(dt: number) {
    const gp = Cfg.gp; const pr = gp._pickup_radius * CELL * this.pickMul;
    for (const d of this.drops) {
      if (d.st === 'dead') continue;
      d.t += dt;
      if (d.t < 0) continue;
      d.spr.setVisible(true);
      if (d.st === 'bounce') {
        const k = Math.min(1, d.t / d.dur);
        d.x = d.sx + (d.tx - d.sx) * k; d.y = d.sy + (d.ty - d.sy) * k;
        d.z = Math.sin(Math.PI * k) * d.h;
        if (k >= 1) {
          const bounces = d.kind === 'item' ? 2 : 1;
          const ex: any = d; ex.bn = (ex.bn ?? 0) + 1;
          if (ex.bn <= bounces) { d.sx = d.tx; d.sy = d.ty; d.t = 0; d.dur = 0.16; d.h = ex.bn === 1 ? 8 + (d.kind === 'item' ? 8 : 0) : 5; }
          else { d.st = 'idle'; d.t = Math.random() * 2; if (d.kind === 'gold') this.tweens.add({ targets: d.spr, scaleX: { from: -(d as any).sc, to: (d as any).sc }, duration: 300 }); }
        }
      } else if (d.st === 'idle') {
        d.z = 3 + Math.sin(d.t * (Math.PI * 2 / 1.2)) * 3;
        if (d.kind === 'gold' && Math.floor(d.t / 2) !== Math.floor((d.t - dt) / 2)) this.sparkP.emitParticleAt(d.x + 6, d.y - d.z - 6, 1);
        const dd = dist2(d.x, d.y, this.px, this.py);
        if (d.kind === 'item') {
          const full = !this.canFit(d.item!);
          if (d.ignoreUntilFar) { if (dd > (2 * CELL) ** 2) d.ignoreUntilFar = false; }
          else if (full) {
            if (!d.full) { d.full = this.add.image(0, 0, 'disc').setTint(0xff3b3b).setScale(0.22); (d.full as any).t = txt(this, 0, 0, '满', 20); }
            if (dd < (1 * CELL) ** 2 && !this.fullPopup && !this.fullQueue.includes(d)) this.fullQueue.push(d);
          } else if (dd < pr * pr) this.startMagnet(d);
          if (!full && d.full) { (d.full as any).t.destroy(); d.full.destroy(); d.full = undefined; }
        } else if (dd < pr * pr) this.startMagnet(d);
      } else if (d.st === 'mag') {
        d.mt += dt;
        const dx = this.px - d.x, dy = this.py - 40 - d.y, l = Math.hypot(dx, dy) || 1;
        if (d.mt < 0.08) { d.x -= (dx / l) * 0.1 * CELL * dt / 0.08; d.y -= (dy / l) * 0.1 * CELL * dt / 0.08; }
        else {
          const sp = 4 * CELL + (Cfg.juice.magnet_pickup?.amplitude ?? 30) * CELL * (d.mt - 0.08);
          const step = sp * dt;
          if (step >= l || d.mt > (Cfg.juice.magnet_pickup?.duration_ms ?? 400) / 1000) { this.collect(d); continue; }
          d.x += (dx / l) * step; d.y += (dy / l) * step;
        }
        d.z = 0;
      }
      d.spr.setPosition(d.x, d.y - d.z - 10).setDepth(d.y);
      if (d.fx) for (const f of d.fx as any[]) { f.setPosition(d.x, d.y).setDepth(d.y - 2).setVisible(d.st !== 'mag'); }
      if (d.full) { d.full.setPosition(d.x + 26, d.y - 60).setDepth(d.y + 1); (d.full as any).t.setPosition(d.x + 26, d.y - 60).setDepth(d.y + 2); }
    }
    if (this.drops.some((d) => d.st === 'dead')) this.drops = this.drops.filter((d) => d.st !== 'dead');
    if (this.fullQueue.length && !this.fullPopup && !this.modal) this.openFullPopup(this.fullQueue.shift()!);
  }
  startMagnet(d: Drop) { d.st = 'mag'; d.mt = 0; }
  collect(d: Drop) {
    // 拾取：图标在主角头顶放大弹一下再消失
    const pop = this.add.image(this.px, this.py - 70, d.spr.texture.key).setScale(d.spr.scaleX).setDepth(this.py + 5);
    this.tweens.add({ targets: pop, scale: d.spr.scaleX * 1.6, y: pop.y - 26, duration: 110, ease: 'Back.out', yoyo: true, hold: 30, onComplete: () => pop.destroy() });
    d.st = 'dead'; d.spr.destroy(); d.fx?.forEach((f: any) => f.destroy());
    this.sparkP.emitParticleAt(this.px, this.py - 50, 1);
    if (d.kind === 'exp') {
      // 1 秒内连续拾取音调升半音，最多 8 次
      if (this.now - this.expPitchT > 1) this.expPitch = 0; this.expPitchT = this.now;
      Sfx.play('sfx_exp_pick', Math.pow(2, Math.min(8, this.expPitch++) / 12), 0.02);
      this.gainExp(d.value); this.pulse(this.hud.lv, 1.2);
    } else if (d.kind === 'gold') { this.runGold += d.value; Sfx.play('sfx_coin_pick', 1, 0.05); this.dmgText(this.px, this.py - 130, d.value, 'gold'); }
    else if (d.kind === 'heart') { const v = Math.round(this.maxHp * 0.2); this.hp = Math.min(this.maxHp, this.hp + v); this.dmgText(this.px, this.py - 120, v, 'heal'); }
    else if (d.kind === 'magnet') { for (const o of this.drops) if (o.kind !== 'item' && o.st === 'idle') this.startMagnet(o); }
    else if (d.kind === 'item') this.addToBag(d.item!, true);
    this.refreshHud();
  }
  gainExp(v: number) {
    this.exp += v;
    while (this.exp >= this.expNeed()) { this.exp -= this.expNeed(); this.level++; this.pendingLv++; this.levelUpFx(); }
  }
  levelUpFx() {
    Sfx.play('sfx_level_up');
    const ring = this.add.image(this.px, this.py, 'ring').setTint(0xffd84a).setBlendMode('ADD').setScale(0.2, 0.1).setDepth(this.py + 1);
    this.tweens.add({ targets: ring, scaleX: 2.2, scaleY: 1.1, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    const t = txt(this, this.px, this.py - 150, 'LEVEL UP', 40, '#ffe27a').setDepth(12001);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    // 清掉身边 1.5 格内的敌方子弹
    for (const b of this.bullets) if (b.enemy && dist2(b.x, b.y, this.px, this.py - 40) < (1.5 * CELL) ** 2) b.life = 0;
  }

  // ======== 背包 ========
  canFit(it: BagItem) {
    if (it.kind === 'material') { const st = this.bag.find((b) => b.kind === 'material' && b.id === it.id && b.count < Cfg.gp.material_stack_max); if (st) return true; }
    return this.bag.length < this.bagSlots || (this.safe.length < this.safeSlots);
  }
  addToBag(it: BagItem, fly: boolean): boolean {
    const gp = Cfg.gp;
    let slotIdx = -1, isSafe = false;
    if (it.kind === 'material') {
      const st = this.bag.find((b) => b.kind === 'material' && b.id === it.id && b.count < gp.material_stack_max);
      if (st) { const add = Math.min(it.count, gp.material_stack_max - st.count); st.count += add; slotIdx = this.bag.indexOf(st); it = { ...it, count: it.count - add }; if (it.count <= 0) { this.afterBag(slotIdx, false, st, fly); return true; } }
    }
    if (this.bag.length < this.bagSlots) { this.bag.push({ ...it }); slotIdx = this.bag.length - 1; }
    else if (this.safe.length < this.safeSlots) { this.safe.push({ ...it }); slotIdx = this.safe.length - 1; isSafe = true; }
    else return false;
    const placed = isSafe ? this.safe[slotIdx] : this.bag[slotIdx];
    this.afterBag(slotIdx, isSafe, placed, fly);
    return true;
  }
  afterBag(idx: number, isSafe: boolean, it: BagItem, fly: boolean) {
    let finalSafe = isSafe, finalIdx = idx;
    // 自动安全格：把价值最高的宝物换进安全格（手动锁定的不动）
    if (Save.data.settings.auto_safe_slot !== false && it.kind === 'treasure') {
      const r = this.autoSafe(it); if (r) { finalSafe = r.safe; finalIdx = r.i; }
    }
    const slot = this.hud.slots.find((s: any) => s.safe === finalSafe && s.i === finalIdx);
    const rar = it.kind === 'treasure' ? this.treasureRarity(it.id) : null;
    const done = () => { for (const s of this.hud.slots) this.drawSlot(s); if (slot) { this.drawSlot(slot, rar ? RARITY_COLOR[rar] : 0xffffff); this.time.delayedCall(140, () => this.drawSlot(slot)); const ic = slot.ic; this.tweens.killTweensOf(ic); const k = ic.scaleX; ic.setScale(k * 1.35); this.tweens.add({ targets: ic, scaleX: k, scaleY: k, duration: 220, ease: 'Back.out' }); } };
    if (fly && slot) {
      // 宝物飞向底栏对应格子
      const cam = this.cameras.main; const ic = this.add.image(this.px - cam.scrollX, this.py - 60 - cam.scrollY, this.itemIcon(it)).setScrollFactor(0).setDepth(18000).setDisplaySize(90, 90);
      this.tweens.add({ targets: ic, x: slot.x, y: slot.y, duration: 380, ease: 'Cubic.in', onComplete: () => { ic.destroy(); done(); Sfx.play('sfx_coin_pick', 0.7); } });
    } else done();
    if (rar && RARITY_ORDER.indexOf(rar) >= 3) this.nameBar(it);
    console.log('[track] pickup', it.id);
  }
  autoSafe(it: BagItem): { safe: boolean; i: number } | null {
    const bi = this.bag.indexOf(it); if (bi < 0) return null;
    const cand = this.safe.map((s, i) => ({ s, i })).filter((o) => !o.s.locked && (o.s.kind !== 'treasure' || (o.s.value ?? 0) < (it.value ?? 0)));
    if (this.safe.length < this.safeSlots) { this.bag.splice(bi, 1); this.safe.push(it); console.log('[track] safe_slot_change', { item_id: it.id, mode: 'auto' }); return { safe: true, i: this.safe.length - 1 }; }
    if (!cand.length) return null;
    cand.sort((a, b) => (a.s.value ?? 0) - (b.s.value ?? 0));
    const tgt = cand[0]; this.bag[bi] = tgt.s; this.safe[tgt.i] = it;
    console.log('[track] safe_slot_change', { item_id: it.id, mode: 'auto' });
    return { safe: true, i: tgt.i };
  }
  nameBar(it: BagItem) {
    const r = this.treasureRarity(it.id);
    const c = this.add.container(this.W / 2, this.barTop - 70).setScrollFactor(0).setDepth(17500);
    const g = this.add.graphics(); g.fillStyle(C.out, 0.9); g.fillRoundedRect(-230, -34, 460, 68, 30); g.lineStyle(4, RARITY_COLOR[r]); g.strokeRoundedRect(-230, -34, 460, 68, 30);
    c.add([g, txt(this, 0, 0, `${RARITY_NAME[r]} · ${this.trName(it.id)}  ${fmt(it.value ?? 0)}`, 28, '#' + RARITY_COLOR[r].toString(16).padStart(6, '0'))]);
    c.setScale(0.6); this.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: c, alpha: 0, delay: 1200, duration: 250, onComplete: () => c.destroy() });
  }
  tapSlot(s: any) {
    if (this.modal && !this.paused) return;
    if (this.fullPopup) { // 背包满弹窗时：直接点任意一格替换
      if (!s.safe && this.bag[s.i]) this.resolveFull('replace', s.i);
      return;
    }
    const arr = s.safe ? this.safe : this.bag;
    if (!this.selSlot) { if (arr[s.i]) { this.selSlot = { safe: s.safe, i: s.i }; Sfx.play('sfx_ui_click'); } }
    else {
      const a = this.selSlot; this.selSlot = null;
      if (a.safe !== s.safe) {
        const bagI = a.safe ? s.i : a.i, safeI = a.safe ? a.i : s.i;
        const b = this.bag[bagI], sf = this.safe[safeI];
        if (b) { b.locked = true; if (sf) { sf.locked = false; this.bag[bagI] = sf; this.safe[safeI] = b; } else if (safeI < this.safeSlots) { this.bag.splice(bagI, 1); this.safe.push(b); } }
        else if (sf && this.bag.length < this.bagSlots) { this.safe.splice(safeI, 1); sf.locked = false; this.bag.push(sf); }
        console.log('[track] safe_slot_change', { mode: 'manual' });
        Sfx.play('sfx_coin_pick', 0.8);
      }
    }
    for (const sl of this.hud.slots) this.drawSlot(sl);
  }

  // 背包满弹窗：0.3 倍速、2 秒（真实时间），超时默认丢下新宝物
  openFullPopup(d: Drop) {
    Sfx.play('sfx_bag_full');
    const it = d.item!; const cheapest = this.bag.map((b, i) => ({ b, i })).sort((x, y) => (x.b.value ?? (x.b.kind === 'material' ? 1 : 0)) - (y.b.value ?? 0))[0];
    const y0 = this.barTop - 190;
    const c = this.add.container(this.W / 2, y0 + 80).setScrollFactor(0).setDepth(17600);
    c.add(panel(this, 0, 0, 600, 170, 0xfff2c4, 24));
    c.add(this.add.image(-210, -20, this.itemIcon(it)).setDisplaySize(84, 84));
    c.add(txt(this, -210, 38, fmt(it.value ?? it.count), 22, '#7a4a10', '#fff', 4));
    c.add(txt(this, -110, -20, '⇄', 44, '#7a4a10', '#fff', 4));
    if (cheapest) { c.add(this.add.image(-10, -20, this.itemIcon(cheapest.b)).setDisplaySize(70, 70)); c.add(txt(this, -10, 38, fmt(cheapest.b.value ?? cheapest.b.count), 22, '#7a4a10', '#fff', 4)); }
    c.add(button(this, 150, -32, 160, 64, '替换', () => this.resolveFull('replace', cheapest?.i ?? 0), C.green, C.greenD, 28));
    c.add(button(this, 150, 44, 160, 60, '丢下', () => this.resolveFull('discard'), C.red, C.redD, 26));
    const bar = this.add.graphics(); c.add(bar);
    c.add(txt(this, 0, -100, '背包满了！', 30, '#ffe27a'));
    c.setScale(0.8); this.tweens.add({ targets: c, scale: 1, duration: 120, ease: 'Back.out' });
    this.fullPopup = { c, bar, d, t: 0, y0, cheapest };
  }
  updateFullPopup(realDt: number) {
    const f = this.fullPopup; if (this.paused) return; f.t += realDt;
    const k = 1 - f.t / Cfg.gp.full_popup_sec; f.bar.clear(); f.bar.fillStyle(C.out); f.bar.fillRoundedRect(-280, 72, 560, 16, 8); f.bar.fillStyle(0xffa630); f.bar.fillRoundedRect(-278, 74, Math.max(0, 556 * k), 12, 6);
    if (k <= 0) this.resolveFull('timeout');
  }
  resolveFull(action: 'replace' | 'discard' | 'timeout', idx = 0) {
    const f = this.fullPopup; if (!f) return; this.fullPopup = null; f.c.destroy();
    const d: Drop = f.d;
    if (action === 'replace' && this.bag[idx]) {
      const old = this.bag[idx]; this.bag.splice(idx, 1);
      this.addToBag(d.item!, true); d.st = 'dead'; d.spr.destroy(); d.fx?.forEach((x: any) => x.destroy()); if (d.full) { (d.full as any).t.destroy(); d.full.destroy(); }
      const nd = this.spawnItem(old, this.px, this.py); nd.ignoreUntilFar = true;
    } else { d.ignoreUntilFar = true; d.spr.setAlpha(0.7); }
    console.log('[track] backpack_full_popup', { new_item: d.item?.id, action });
    this.refreshHud(true);
  }

  // ======== 宝箱 / 陶罐 ========
  updateChests(dt: number) {
    const cam = this.cameras.main; const hintR = (Cfg.gp.chest_hint_radius_cells ?? 12) * CELL;
    for (const c of this.chests) {
      // 屏幕外 12 格内的未开宝箱：屏幕边缘金色箭头（和光门的青色区分）
      let arr: Img = (c as any).arrow;
      if (!arr) { arr = (c as any).arrow = this.add.image(0, 0, 'arrow_ind').setScrollFactor(0).setDepth(15400).setTint(0xffc533).setScale(0.8); }
      const sx = c.x - cam.scrollX, sy = c.y - cam.scrollY;
      const off = sx < 30 || sx > this.W - 30 || sy < this.topH + 30 || sy > this.barTop - 30;
      const show = !c.opened && !c.mimic && off && dist2(c.x, c.y, this.px, this.py) < hintR * hintR;
      arr.setVisible(show);
      if (show) { const cx = this.W / 2, cy = (this.topH + this.barTop) / 2; const a = Math.atan2(sy - cy, sx - cx); const hw = this.W / 2 - 46, hh = (this.barTop - this.topH) / 2 - 46; const t = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), hh / Math.abs(Math.sin(a) || 1e-6)); arr.setPosition(cx + Math.cos(a) * t, cy + Math.sin(a) * t).setRotation(a).setAlpha(0.75 + Math.sin(this.now * 6) * 0.25); }
      if (c.opened) continue;
      const near = dist2(c.x, c.y, this.px, this.py) < (Cfg.gp._chest_open_dist * CELL) ** 2;
      const row = Cfg.chestRow(c.id);
      if (near && !this.dead) {
        c.prog += dt;
        if (!c.bar) c.bar = this.add.graphics().setDepth(11000);
        const k = c.prog / row.open_time; c.bar.clear(); c.bar.fillStyle(C.out); c.bar.fillRoundedRect(c.x - 44, c.y - 110, 88, 18, 9); c.bar.fillStyle(0xffd84a); c.bar.fillRoundedRect(c.x - 41, c.y - 107, 82 * Math.min(1, k), 12, 6);
        c.spr.x = c.x + Math.sin(this.now * 50) * 1.5 * k;
        if (c.prog >= row.open_time) this.openChest(c);
      } else if (c.prog > 0) { c.prog = 0; c.bar?.clear(); c.spr.x = c.x; }
    }
  }
  openChest(c: Chest) {
    c.opened = true; c.bar?.destroy(); c.spr.x = c.x;
    const row = Cfg.chestRow(c.id);
    if (c.mimic) { // 宝箱怪现身
      c.spr.destroy(); const e = this.spawnEnemy('mon_mimic', c.x, c.y); e.st = 'chase'; this.toast('是宝箱怪！', '#ff9c9c'); Sfx.play('sfx_player_hurt', 1.5); return;
    }
    this.tweens.killTweensOf(c.spr);
    c.spr.setTexture(row.sprite + '_open').setScale(1.25, 0.8); this.tweens.add({ targets: c.spr, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.out' });
    Sfx.play('sfx_chest_open');
    const glow = this.add.image(c.x, c.y - 30, 'disc').setTint(0xffe9a0).setBlendMode('ADD').setScale(0.3).setDepth(c.y + 1);
    this.tweens.add({ targets: glow, scale: 1.4, alpha: 0, duration: 450, onComplete: () => glow.destroy() });
    // 盖子弹开 → 停顿 150ms → 物品依次喷出（间隔 80ms）
    const items: BagItem[] = [];
    for (let i = 0; i < row.item_count; i++) items.push(this.rollTreasure(i === 0 ? ((c as any).minRarity ?? null) : null, row.apply_depth_coef, row.rarity_weights));
    for (const [m, [a, b]] of Object.entries(row.materials)) { const n = this.rng.int(a, b); if (n > 0) items.push({ id: m, count: n, kind: 'material' }); }
    if ((row as any).blueprint_rate && this.rng.chance((row as any).blueprint_rate)) items.push({ id: 'bp_random', count: 1, kind: 'blueprint' });
    items.forEach((it, i) => this.spawnItem(it, c.x, c.y - 20, 0.15 + i * 0.08));
    const g = this.rng.int(row.gold[0], row.gold[1]); for (let i = 0; i < g; i++) this.time.delayedCall(150 + i * 60, () => this.spawnDrop('gold', c.x, c.y, 1));
    if (items.some((i) => i.kind === 'treasure' && RARITY_ORDER.indexOf(this.treasureRarity(i.id)) >= 3)) this.juice.shake('shake_chest_epic');
    if (row.on_open?.spawn_elite) { const p = this.spawnPos(); this.spawnEnemy(this.rng.pick(['mon_slime', 'mon_archer', 'mon_golem']), p.x, p.y, true); this.toast('诅咒触发！精英怪来了，怪物加速 3 秒', '#d58cff'); for (const e of this.enemies) { const s = e.spd; e.spd *= 1.5; this.time.delayedCall(row.on_open.haste_sec * 1000, () => { e.spd = s; }); } }
    console.log('[track] chest_open', { chest_id: c.id, items: items.map((i) => i.id) });
  }
  updatePots() {
    for (const p of this.pots) {
      if (p.broken || dist2(p.x, p.y, this.px, this.py) > (0.8 * CELL) ** 2) continue;
      p.broken = true; p.spr.setTexture('prop_pot_broken'); this.particles.setParticleTint(0xc8703a); this.particles.emitParticleAt(p.x, p.y - 30, 8); Sfx.play('sfx_hit', 0.6);
      const gp = Cfg.gp; const n = this.rng.int(gp._pot_gold[0], gp._pot_gold[1]); for (let i = 0; i < n; i++) this.spawnDrop('gold', p.x, p.y, 1);
      const r = Math.random(); if (r < gp._pot_heart_rate) this.spawnDrop('heart', p.x, p.y, 1); else if (r < gp._pot_heart_rate + gp._pot_magnet_rate) this.spawnDrop('magnet', p.x, p.y, 1);
      this.tweens.add({ targets: p.spr, alpha: 0, delay: 3000, duration: 500 });
    }
  }

  // ======== 道具 ========
  useItem(id: string) {
    if (this.modal || this.dead || !(this.carried[id] > 0)) return;
    this.carried[id]--;
    const ef = Cfg.item.find((i) => i.id === id)!.effect;
    if (id === 'it_potion') { const v = Math.round(this.maxHp * ef.heal_pct); this.hp = Math.min(this.maxHp, this.hp + v); this.dmgText(this.px, this.py - 120, v, 'heal'); Sfx.play('sfx_level_up', 1.4); const r = this.add.image(this.px, this.py - 40, 'disc').setTint(0x66ff77).setBlendMode('ADD').setScale(0.3).setDepth(9000); this.tweens.add({ targets: r, scale: 1.2, alpha: 0, duration: 400, onComplete: () => r.destroy() }); }
    if (id === 'it_bomb') {
      const t = this.nearest(this.px, this.py, 5 * CELL); const tx = t ? t.x : this.px + this.facing * 2 * CELL, ty = t ? t.y : this.py;
      const b = this.add.image(this.px, this.py - 50, 'icon_bomb').setScale(0.4).setDepth(9500);
      this.tweens.add({ targets: b, x: tx, duration: ef.delay * 1000 * 0.5 });
      this.tweens.add({ targets: b, y: { from: this.py - 50, to: ty - 20 }, duration: ef.delay * 1000 * 0.5, ease: 'Quad.in', onComplete: () => {
        this.tweens.add({ targets: b, scale: 0.55, duration: 100, yoyo: true, repeat: 1, onComplete: () => {
          b.destroy(); Sfx.play('sfx_explode'); this.juice.shake('shake_bomb');
          const ex = this.add.image(tx, ty - 20, 'disc').setTint(0xffa030).setBlendMode('ADD').setScale(0.2).setDepth(11000); this.tweens.add({ targets: ex, scale: (ef.radius * CELL * 2) / 128, alpha: 0, duration: 350, onComplete: () => ex.destroy() });
          this.particles.setParticleTint(0xffb040); this.particles.emitParticleAt(tx, ty, 24);
          this.near(tx, ty, ef.radius * CELL, (e) => this.damage(e, ef.dmg_pct, { kx: e.x - tx, ky: e.y - ty }));
        } });
      } });
    }
    if (id === 'it_shield') this.shieldT = ef.invuln_sec;
    this.refreshHud();
  }

  // ======== 撤离 ========
  updateExits(dt: number) {
    const gp = Cfg.gp; const cam = this.cameras.main;
    for (const e of this.exits) {
      if (!e.active) continue;
      if (e.until !== Infinity && this.floorT > e.until) { e.active = false; this.tweens.add({ targets: e.spr, alpha: 0, scaleY: 0, duration: 400 }); e.parts?.stop(); e.ring.clear(); continue; }
      const R = (e.kind === 'stairs' ? 1 : gp.portal_radius) * CELL;
      const inside = dist2(e.x, e.y, this.px, this.py) < R * R;
      const g = e.ring; g.clear();
      const col = e.kind === 'stairs' ? 0xffe1a0 : e.kind === 'emergency' ? 0xffd27a : 0x8ff6ff;
      g.lineStyle(inside ? 7 : 4, col, inside ? 1 : 0.55 + Math.sin(this.now * 4) * 0.2); g.strokeEllipse(e.x, e.y, R * 2, R * 1.2);
      g.fillStyle(col, inside ? 0.18 : 0.08); g.fillEllipse(e.x, e.y, R * 2, R * 1.2);
      if (e.until !== Infinity) { const left = e.until - this.floorT; g.fillStyle(0x000000, 0.5); g.fillRoundedRect(e.x - 40, e.y - 200, 80, 34, 12); }
      if (inside && !this.dead && (!this.channel || this.channel.exit !== e) && this.channel?.kind !== 'scroll') this.startChannel(e.kind === 'stairs' ? 'stairs' : 'portal', e.kind === 'stairs' ? gp.stairs_channel_sec : gp.portal_channel_sec, e);
      if (!inside && this.channel?.exit === e) this.breakChannel(e.kind === 'stairs' ? '' : '离开光圈，撤离中断');
      // 屏幕外方向箭头
      const sx = e.x - cam.scrollX, sy = e.y - cam.scrollY;
      let arr: Img = (e as any).arrow;
      if (!arr) { arr = (e as any).arrow = this.add.image(0, 0, 'arrow_ind').setScrollFactor(0).setDepth(15500).setTint(e.kind === 'stairs' ? 0xffe1a0 : 0xffffff); }
      const off = sx < 30 || sx > this.W - 30 || sy < this.topH + 30 || sy > this.barTop - 30;
      arr.setVisible(off && e.kind !== 'boss_entry');
      if (off) { const cx = this.W / 2, cy = (this.topH + this.barTop) / 2; const a = Math.atan2(sy - cy, sx - cx); const hw = this.W / 2 - 50, hh = (this.barTop - this.topH) / 2 - 50; const t = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), hh / Math.abs(Math.sin(a) || 1e-6)); arr.setPosition(cx + Math.cos(a) * t, cy + Math.sin(a) * t).setRotation(a).setScale(1 + Math.sin(this.now * 8) * 0.12); }
    }
  }
  startChannel(kind: string, need: number, exit?: Exit) {
    this.channel?.g.destroy();
    this.channel = { kind, t: 0, need, exit, g: this.add.graphics().setDepth(11500) };
    if (kind !== 'stairs') console.log('[track] exit_channel', { floor: this.floor, exit_type: exit?.kind ?? 'scroll', state: 'start' });
  }
  breakChannel(msg: string) {
    const c = this.channel; if (!c) return; this.channel = null;
    // 读条碎裂 + 屏幕闪暗 + "噗"
    c.g.destroy();
    if (c.kind !== 'stairs') {
      this.particles.setParticleTint(c.kind === 'scroll' ? 0x6fb6ff : 0x8ff6ff); this.particles.emitParticleAt(this.px, this.py, 14);
      const dark = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.35).setOrigin(0).setScrollFactor(0).setDepth(15900); this.tweens.add({ targets: dark, alpha: 0, duration: 100, onComplete: () => dark.destroy() });
      Sfx.play('sfx_hit', 0.4); if (msg) this.toast(msg, '#ff9c9c');
      console.log('[track] exit_channel', { state: 'break' });
    }
  }
  updateChannel(dt: number) {
    const c = this.channel; if (!c || this.dead) return;
    c.t += dt; const k = Math.min(1, c.t / c.need);
    const last = c.need - c.t <= 1 && c.kind !== 'stairs';
    const col = c.kind === 'scroll' ? 0x6fb6ff : last ? 0xffd84a : 0x8ff6ff;
    const g = c.g; g.clear();
    g.lineStyle(14, C.out, 0.8); g.strokeCircle(this.px, this.py - 50, 64);
    g.lineStyle(9, col, 1); g.beginPath(); g.arc(this.px, this.py - 50, 64, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.strokePath();
    if (c.kind !== 'stairs') {
      // 嗡鸣音调随进度升高；最后 1 秒心跳
      if (Math.floor(c.t * 4) !== Math.floor((c.t - dt) * 4)) Sfx.play('sfx_portal_appear', 0.5 + k * 0.8, 0.2);
      if (last) { this.heartbeatT -= dt; if (this.heartbeatT <= 0) { this.heartbeatT = 0.4; Sfx.play('sfx_explode', 0.4); this.pulse(this.hero, 1.06); } }
      if (c.exit?.parts) c.exit.parts.frequency = last ? 25 : 90;
    }
    if (c.t >= c.need) {
      g.destroy(); this.channel = null;
      if (c.kind === 'stairs') this.nextFloor(); else this.extract(c.exit?.kind ?? 'scroll');
    }
  }
  useScroll() {
    if (this.modal || this.dead || this.extracting) return;
    if (this.isBoss && this.bossStarted && !Cfg.gp.boss_allow_scroll) return this.toast('Boss 战中不能使用卷轴');
    if (!(this.carried.it_scroll > 0)) {
      // 没卷轴：闪一次指向最近撤离点的箭头
      const ex = this.exits.filter((e) => e.active && e.kind !== 'stairs').sort((a, b) => dist2(a.x, a.y, this.px, this.py) - dist2(b.x, b.y, this.px, this.py))[0];
      this.toast(ex ? '没有撤离卷轴，去光门撤离！' : '没有撤离卷轴，光门会在倒计时剩 15 秒时出现');
      return;
    }
    if (this.channel?.kind === 'scroll') return;
    this.carried.it_scroll--; this.refreshHud();
    this.startChannel('scroll', Cfg.gp.scroll_channel_sec);
    this.toast('卷轴读条中：不能移动，受击会中断', '#9fd0ff');
  }
  extract(kind: string) {
    if (this.extracting) return; this.extracting = true;
    Sfx.play('sfx_extract'); this.juice.vibrate('vibrate_extract');
    console.log('[track] exit_channel', { floor: this.floor, exit_type: kind, state: 'done' });
    // 光柱包住主角上升 + 白闪 300ms
    const beam = this.add.graphics().setBlendMode('ADD').setDepth(this.py + 10);
    beam.fillGradientStyle(0x9ff8ff, 0x9ff8ff, 0x9ff8ff, 0x9ff8ff, 0, 0, 0.9, 0.9); beam.fillRect(this.px - 60, this.py - 900, 120, 900);
    beam.setAlpha(0); this.tweens.add({ targets: beam, alpha: 1, duration: 250 });
    (this.hero as any).anims?.stop(); this.hero.setTexture('chr_player_win_01').setRotation(0);
    this.tweens.add({ targets: [this.hero], y: this.py - 300, alpha: 0, delay: 300, duration: 700, ease: 'Quad.in' });
    this.time.delayedCall(800, () => { const w = this.add.rectangle(0, 0, this.W, this.H, 0xffffff, 0).setOrigin(0).setScrollFactor(0).setDepth(30000); this.tweens.add({ targets: w, alpha: 1, duration: 300, onComplete: () => this.endRun('extract') }); });
  }
  nextFloor() {
    const fr = Cfg.floorRow('garden', this.floor + 1); if (!fr) return this.extract('portal');
    console.log('[track] floor_choice', { floor: this.floor, choice: 'deeper', backpack_value: this.bagValue(), time_left: this.timeLeft });
    this.extracting = true;
    // 跨层状态保存（S2 快照在下一层 create 里写）
    this.registry.set('runState', { level: this.level, exp: this.exp, kills: this.kills, runGold: this.runGold, revived: this.revived, firstPick: this.firstPick, refreshLeft: this.refreshLeft, carried: this.carried,
      hp: this.hp, baseHp: this.baseHp, atk: this.atk, time0: this.time0, skillsArr: [...this.skills.entries()] });
    Save.data.active_run!.floor_snapshot = { floor: this.floor + 1, backpack: this.bag, safe: this.safe, run_gold: this.runGold, account_exp: 0 };
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ floor: this.floor + 1 }));
  }
  snapshot() {
    const a = Save.data.active_run; if (!a) return;
    a.floor_snapshot = { floor: this.floor, backpack: this.bag.map((i) => ({ ...i })), safe: this.safe.map((i) => ({ ...i })), run_gold: this.runGold, account_exp: 0 };
    Save.write(false); // S2：只写本地
  }

  // ======== Boss ========
  bossEnrage2() { return this.isBoss && this.bossT >= Cfg.gp.boss_enrage2_sec; }
  updateBoss(dt: number) {
    if (!this.bossStarted) { if (this.py < this.bossRoomY - 40) this.startBoss(); return; }
    const b = this.boss; if (!b || !b.alive) return;
    const gp = Cfg.gp;
    const enr1 = this.bossT >= gp.boss_enrage1_sec || (gp.boss_enrage_hp_pct != null && b.hp <= b.maxHp * gp.boss_enrage_hp_pct); const spdMul = enr1 ? 1.5 : 1; const sumMul = this.bossEnrage2() ? 2 : 1;
    for (const sk of Cfg.bossSkill.filter((s) => s.boss_id === b.boss!.id)) {
      if (b.hp / b.maxHp > sk.hp_below) continue;
      const key = 'bs_' + sk.skill_id; if (this.timers[key] === undefined) this.timers[key] = sk.cooldown * 0.5;
      this.timers[key] -= dt * spdMul * (sk.shape === 'summon' ? sumMul : 1);
      if (this.timers[key] > 0) continue;
      this.timers[key] = sk.cooldown;
      this.castBoss(b, sk);
    }
    if (b.st === 'cast') { b.t2 -= dt; if (b.t2 <= 0) { b.st = 'move'; b.spr.setTexture('boss_vine_golem_idle'); } }
    if (enr1 && !(this as any).enr1) { (this as any).enr1 = true; this.banner('咕噜噜狂暴了！', '攻速和召唤加快，注意躲开地面预警'); b.spr.setTint(0xffb0a0); this.juice.shake('shake_elite_die'); Sfx.play('sfx_explode', 0.6); this.pulse(b.spr, 1.15); }
    if (this.bossEnrage2() && !(this as any).enr2) { (this as any).enr2 = true; this.toast('咕噜噜彻底狂暴！伤害翻倍', '#ff5c5c'); }
  }
  startBoss() {
    this.bossStarted = true;
    const brow = Cfg.boss.find((x) => x.id === Cfg.floorRow('garden', this.floor).boss_id)!;
    // 门关闭
    const gate = this.add.graphics().setDepth(this.bossRoomY + 40); gate.fillStyle(0x6b4a2e); gate.fillRect(this.mapW / 2 - 2 * CELL, this.bossRoomY + 10, 4 * CELL, 36); gate.lineStyle(6, C.out); gate.strokeRect(this.mapW / 2 - 2 * CELL, this.bossRoomY + 10, 4 * CELL, 36);
    this.obst.push({ x: this.mapW / 2, y: this.bossRoomY + 30, r: 10 });
    // 登场：暂停 2 秒
    this.modal = true; this.joy.active = false; this.joyBase.setAlpha(0); this.joyKnob.setAlpha(0);
    const b = this.spawnEnemy(brow.id, this.mapW / 2, CELL * 8, false, brow); this.boss = b;
    b.spr.setTexture('boss_vine_golem_idle');
    this.cameras.main.flash(200, 255, 255, 255);
    Sfx.play('sfx_boss_warn', 0.6); this.juice.shake('shake_boss_hit');
    this.hud.bossT.setVisible(true).setText(brow.name);
    const name = txt(this, this.W / 2, this.H * 0.42, brow.name, 56, '#ffe27a').setScrollFactor(0).setDepth(17000).setScale(2).setAlpha(0);
    this.tweens.add({ targets: name, scale: 1, alpha: 1, duration: 300, ease: 'Back.out' });
    this.time.delayedCall(2000, () => { name.destroy(); this.modal = false; });
    console.log('[track] boss_start', { boss_id: brow.id });
    // Boss 层显示 BOSS + 正计时
  }
  castBoss(b: Enemy, sk: BossSkillRow) {
    const p = sk.params;
    b.st = 'cast'; b.t2 = sk.warn_time + 0.3; b.spr.setTexture('boss_vine_golem_attack');
    Sfx.play('sfx_boss_warn');
    if (sk.shape === 'fan') { const a = Math.atan2(this.py - b.y, this.px - b.x); this.addWarn({ x: b.x, y: b.y, shape: 'fan', r: p.radius * CELL, ang: a, spread: Phaser.Math.DegToRad(p.angle), dur: sk.warn_time, dmg: sk.damage, kind: 'boss' }); }
    if (sk.shape === 'circle') for (let i = 0; i < p.count; i++) { const ox = i === 0 ? 0 : this.rng.range(-p.spread, p.spread) * CELL, oy = i === 0 ? 0 : this.rng.range(-p.spread, p.spread) * CELL; this.addWarn({ x: this.px + ox, y: this.py + oy, shape: 'circle', r: p.radius * CELL, dur: sk.warn_time, dmg: sk.damage, kind: 'boss' }); }
    if (sk.shape === 'summon') { b.t2 = 0.6; for (let i = 0; i < p.count; i++) { const a = (i / p.count) * Math.PI * 2; this.time.delayedCall(i * 80, () => this.spawnEnemy(p.monster, clamp(b.x + Math.cos(a) * 140, 40, this.mapW - 40), clamp(b.y + Math.sin(a) * 100 + 60, 40, this.bossRoomY - 40))); } }
  }
  drawBossBar() {
    const b = this.boss; if (!b) return; const g = this.hud.bossG; const y = this.topH + 10; g.clear();
    if (!b.alive) return;
    const k = clamp(b.hp / b.maxHp, 0, 1);
    g.fillStyle(C.out); g.fillRoundedRect(60, y, this.W - 120, 34, 17); g.fillStyle(0x3a1010); g.fillRoundedRect(66, y + 5, this.W - 132, 24, 12);
    g.fillStyle(0x8fe04a); g.fillRoundedRect(66, y + 5, Math.max(12, (this.W - 132) * k), 24, 12);
    this.hud.bossT.setY(y + 56);
  }
  onBossKilled(b: Enemy) {
    this.bossKilled = true;
    // 顿帧 250ms + 全屏慢动作 0.3 倍 600ms + 震屏
    const hs = this.juice.hitstop('hitstop_boss_kill', this.time.now); if (hs) this.globalFreeze = hs;
    const sl = Cfg.juice.slowmo_boss_kill; this.slowScale = sl?.amplitude ?? 0.3; this.slowUntil = this.now + (sl?.duration_ms ?? 600) / 1000;
    this.juice.shake('shake_boss_die'); this.juice.vibrate('vibrate_boss_die');
    const dead = this.add.image(b.x, b.y, 'boss_vine_golem_dead').setOrigin(0.5, 0.92).setDepth(b.y);
    this.tweens.add({ targets: dead, alpha: 0, delay: 1600, duration: 600, onComplete: () => dead.destroy() });
    for (const e of this.enemies) if (e.alive && e !== b) { this.particles.setParticleTint(e.color); this.particles.emitParticleAt(e.x, e.y - 20, 5); this.removeEnemy(e); }
    for (const w of this.warns) w.g.destroy(); this.warns = [];
    this.hud.bossG.clear(); this.hud.bossT.setVisible(false);
    for (let i = 0; i < 10; i++) this.spawnDrop('exp', b.x, b.y, 5);
    const ch = this.addChest(b.boss!.drop_chest, b.x, b.y + 20);
    for (const [m, n] of Object.entries(b.boss!.drops)) this.spawnItem({ id: m, count: n, kind: 'material' }, b.x, b.y, 0.3);
    this.time.delayedCall(900, () => { this.addExit('boss_exit', this.mapW / 2, CELL * 4); Sfx.play('sfx_portal_appear'); this.banner('击败了咕噜噜！', '打开 Boss 宝箱，走进光门撤离'); });
    console.log('[track] boss_end', { result: 'win', duration_s: Math.round(this.bossT) });
    void ch;
  }

  // ======== HUD 实时 ========
  updateHudLive(dt: number) {
    const h = this.hud;
    if (this.isBoss) h.cd.setText(this.bossStarted ? `${Math.floor(this.bossT / 60)}:${String(Math.floor(this.bossT % 60)).padStart(2, '0')}` : 'BOSS').setColor('#ffb0a0');
    else { const t = Math.max(0, Math.ceil(this.timeLeft)); h.cd.setText(this.collapse ? '崩塌!' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`).setColor(this.timeLeft <= 10 ? '#ff5050' : '#ffffff'); }
    // 背包价值滚动（300ms），涨幅大时变金色
    const v = this.bagValue(); if (h.valShown !== v) { const diff = v - h.valShown; h.valShown += Math.sign(diff) * Math.max(1, Math.abs(diff) * dt / 0.3); if (Math.abs(v - h.valShown) < 1) h.valShown = v; h.val.setText(fmt(h.valShown)).setColor(diff > 50 ? '#ffd84a' : '#ffe27a'); }
    // 低血量：红色暗角呼吸 + 心跳
    const low = this.hp / this.maxHp < 0.3 && !this.dead;
    if (low) { h.red.setAlpha(Math.max(h.red.alpha * 0.98, 0.25 + Math.sin(this.now * 6) * 0.15)); if (Math.floor(this.now / 0.8) !== Math.floor((this.now - dt) / 0.8)) Sfx.play('sfx_explode', 0.3); }
    else if (h.red.alpha > 0) h.red.setAlpha(Math.max(0, h.red.alpha - dt * 2));
    if (Math.floor(this.now * 4) !== Math.floor((this.now - dt) * 4)) this.refreshHud();
  }

  // ======== 三选一 ========
  openLevelUp() {
    this.pendingLv--; this.modal = true; this.joy.active = false; this.joyBase.setAlpha(0); this.joyKnob.setAlpha(0);
    const opts = this.rollSkills();
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(19000);
    c.add(this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.65).setOrigin(0).setInteractive());
    const cy = this.H * 0.47;
    c.add(txt(this, this.W / 2, cy - 330, `升级！ Lv.${this.level}`, 60, '#ffe27a', '#2b1d14', 10));
    const pick = (s: SkillRow | null, card: Phaser.GameObjects.Container) => {
      if ((c as any).done) return; (c as any).done = true;
      Sfx.play('sfx_level_up', 1.2);
      if (s) { this.skills.set(s.id, this.lv(s.id) + 1); if (s.category === 'active') this.firstPick = false; this.recalc(s.id === 'skill_tough'); }
      else { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3); }
      console.log('[track] level_up_pick', { run_level: this.level, options: opts.map((o) => o?.id), picked: s?.id });
      // 卡片飞向主角
      const cam = this.cameras.main;
      this.tweens.add({ targets: card, x: this.px - cam.scrollX, y: this.py - 60 - cam.scrollY, scale: 0.1, alpha: 0.4, duration: 300, ease: 'Cubic.in', onComplete: () => {
        c.destroy(); this.modal = false; this.refreshHud();
        const fl = this.add.image(this.px, this.py - 50, 'disc').setTint(0xffe27a).setBlendMode('ADD').setScale(0.2).setDepth(this.py + 2); this.tweens.add({ targets: fl, scale: 1, alpha: 0, duration: 300, onComplete: () => fl.destroy() });
      } });
    };
    opts.forEach((s, i) => {
      const x = this.W / 2 + (i - 1) * 236, w = 216, h = 400;
      const card = this.add.container(x, cy);
      const lvNow = s ? this.lv(s.id) : 0;
      const g = this.add.graphics();
      const col = !s ? 0x66cc66 : s.category === 'active' ? 0xff9a3c : 0x5aa8ff;
      g.fillStyle(C.out); g.fillRoundedRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 14, 24); g.fillStyle(col); g.fillRoundedRect(-w / 2, -h / 2, w, h, 20); g.fillStyle(0xfff6e0); g.fillRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 16);
      card.add(g);
      card.add(this.add.image(0, -h / 2 + 90, s ? this.skillIcon(s.id) : 'obj_pickup_heart').setDisplaySize(124, s ? 124 : 115));
      card.add(txt(this, 0, -h / 2 + 180, s ? s.name : '回复', 32, '#4a3520', '#ffffff', 5));
      card.add(txt(this, 0, -h / 2 + 222, s ? (lvNow ? `Lv.${lvNow} → ${lvNow + 1}` : '新！') : '', 26, lvNow ? '#2e7d32' : '#e65100', '#ffffff', 4));
      const desc = s ? this.descOf(s, lvNow + 1) : '立即回复 30% 生命';
      card.add(this.add.text(0, -h / 2 + 300, desc, { fontFamily: FONT, fontSize: '23px', color: '#5a4630', align: 'center', lineSpacing: 6, wordWrap: { width: w - 34, useAdvancedWrap: true } }).setOrigin(0.5));
      card.add(txt(this, 0, h / 2 - 28, s ? (s.category === 'active' ? '攻击' : '被动') : '', 22, '#ffffff', '#2b1d14', 4));
      if (s && !lvNow && s.category === 'active') { const shine = this.add.graphics(); shine.fillStyle(0xffffff, 0.22); shine.fillRect(-8, -h / 2 + 10, 16, h - 20); shine.setBlendMode('ADD'); card.add(shine); this.tweens.add({ targets: shine, x: { from: -w / 2 + 18, to: w / 2 - 18 }, duration: 1100, repeat: -1, repeatDelay: 600 }); }
      card.setSize(w, h).setInteractive();
      card.on('pointerup', () => pick(s, card));
      // 三张卡依次翻面（间隔 100ms）
      card.setScale(0, 1); this.tweens.add({ targets: card, scaleX: 1, delay: 120 + i * 100, duration: 180, ease: 'Back.out' });
      c.add(card);
    });
    if (this.refreshLeft > 0 && Cfg.gp.enabled_ad_placements.includes('A4')) {
      c.add(button(this, this.W / 2, cy + 300, 340, 86, `📺 换一批 (${this.refreshLeft})`, async () => {
        const r = await this.showAd('A4'); if (r) { this.refreshLeft--; c.destroy(); this.pendingLv++; this.modal = false; }
      }, C.purple, C.purpleD, 30));
    }
  }
  descOf(s: SkillRow, l: number) {
    const r = Cfg.lvl(s.id, l); const e = r.extra ?? {};
    return s.desc_tpl.replace('{cd}', String(r.cooldown)).replace('{count}', String(r.count)).replace('{dmg}', String(Math.round(r.dmg_pct * 100))).replace('{range}', String(r.range)).replace('{duration}', String(r.duration))
      .replace('{v}', String(Math.round((e.v ?? 0) * 100) / (s.id === 'skill_leech' ? 100 : 1))).replace('{v2}', String(Math.round((e.v2 ?? 0) * 100)));
  }
  rollSkills(): (SkillRow | null)[] {
    const gp = Cfg.gp; const [wNew, wUp] = gp._skill_new_vs_upgrade;
    const ownedA = [...this.skills.keys()].filter((k) => Cfg.skill.find((s) => s.id === k)?.category === 'active').length;
    const ownedP = this.skills.size - ownedA;
    const pool = Cfg.skill.filter((s) => {
      const l = this.lv(s.id); if (l >= s.max_level) return false; if (s.unlock_floor > this.floor) return false;
      if (!l && s.category === 'active' && ownedA >= gp._active_max) return false;
      if (!l && s.category === 'passive' && ownedP >= gp._passive_max) return false;
      return true;
    });
    const w = (s: SkillRow) => s.weight * (this.lv(s.id) ? (s.upgrade_weight_mul ?? wUp / wNew) : 1);
    const out: SkillRow[] = [];
    const take = (cands: SkillRow[]) => { const tot = cands.reduce((a, s) => a + w(s), 0); let r = this.rng.next() * tot; for (const s of cands) { if ((r -= w(s)) < 0) return s; } return cands[cands.length - 1]; };
    // 每局第 1 次三选一保证至少 1 个攻击类主动技能
    if (this.firstPick) { const atk = pool.filter((s) => s.category === 'active' && s.first_pick_ok); if (atk.length) out.push(take(atk)); }
    while (out.length < 3) { const c = pool.filter((s) => !out.includes(s)); if (!c.length) break; out.push(take(c)); }
    Phaser.Utils.Array.Shuffle(out);
    const res: (SkillRow | null)[] = out; while (res.length < 3) res.push(null);
    return res;
  }

  // ======== 暂停 ========
  openPause() {
    if (this.paused || this.dead || this.extracting) return;
    this.paused = true; this.modal = true;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(19000);
    c.add(this.add.rectangle(0, 0, this.W, this.barTop, 0x000000, 0.6).setOrigin(0).setInteractive());
    const cy = this.H * 0.4;
    c.add(panel(this, this.W / 2, cy, 600, 560, C.panel));
    c.add(txt(this, this.W / 2, cy - 230, '暂停', 52, '#4a3520', '#ffffff', 8));
    c.add(this.add.text(this.W / 2, cy - 160, '背包整理：点底栏的宝物，再点安全格（蓝框）\n安全格里的东西阵亡也不会丢', { fontFamily: FONT, fontSize: '24px', color: '#5a4630', align: 'center' }).setOrigin(0.5));
    const close = () => { c.destroy(); this.paused = false; this.modal = false; };
    c.add(button(this, this.W / 2, cy - 50, 380, 96, '继续', close, C.green, C.greenD, 38));
    const auto = button(this, this.W / 2, cy + 70, 380, 86, `自动安全格：${Save.data.settings.auto_safe_slot !== false ? '开' : '关'}`, () => { Save.data.settings.auto_safe_slot = !(Save.data.settings.auto_safe_slot !== false); auto.label.setText(`自动安全格：${Save.data.settings.auto_safe_slot ? '开' : '关'}`); Save.write(); }, C.blue, C.blueD, 30);
    c.add(auto);
    c.add(button(this, this.W / 2, cy + 190, 380, 86, '放弃本局（视为阵亡）', () => { close(); this.dead = true; this.endRun('quit'); }, C.red, C.redD, 28));
  }

  // ======== 阵亡 / 复活 ========
  onDeath() {
    if (this.dead) return; this.dead = true; this.hp = 0;
    this.channel?.g.destroy(); this.channel = null;
    console.log('[track] player_death', { floor: this.floor, backpack_value: this.bagValue() });
    // 画面变灰 + 慢动作 0.5 秒
    const fx = (this.cameras.main as any).postFX?.addColorMatrix?.(); fx?.grayscale(0.85);
    this.slowScale = 0.3; this.slowUntil = this.now + 0.5;
    (this.hero as any).anims?.stop(); this.hero.setTexture('chr_player_dead_01').setRotation(0);
    this.time.delayedCall(600, () => { this.modal = true; this.openRevive(fx); });
  }
  openRevive(fx: any) {
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(19000);
    c.add(this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.55).setOrigin(0).setInteractive());
    const cy = this.H * 0.42;
    c.add(panel(this, this.W / 2, cy, 600, 480, C.panel));
    c.add(txt(this, this.W / 2, cy - 180, '你倒下了…', 50, '#b03a2e', '#ffffff', 8));
    const prot = Save.data.active_run?.is_protected;
    c.add(txt(this, this.W / 2, cy - 100, prot ? '新手保护：这次宝物不会丢' : `背包价值 ${fmt(this.bag.filter((i) => i.kind === 'treasure').reduce((s, i) => s + (i.value ?? 0), 0))} 将会丢失`, 30, '#4a3520', '#ffffff', 4));
    const cdT = txt(this, this.W / 2, cy - 40, '5', 44, '#e65100', '#ffffff', 6); c.add(cdT);
    let left = 5; let done = false;
    const giveUp = () => { if (done) return; done = true; ev.remove(); c.destroy(); this.loseItemsFx(() => this.endRun('death')); };
    const ev = this.time.addEvent({ delay: 1000, repeat: 4, callback: () => { left--; cdT.setText(String(left)); if (left <= 0) giveUp(); } });
    if (!this.revived && Cfg.gp.enabled_ad_placements.includes('A1')) {
      c.add(button(this, this.W / 2, cy + 60, 440, 100, '📺 原地复活（每局 1 次）', async () => {
        if (done) return; ev.paused = true;
        const ok = await this.showAd('A1');
        if (!ok) { ev.paused = false; return; }
        done = true; ev.remove(); c.destroy(); fx && (this.cameras.main as any).postFX.remove(fx);
        this.revived = true; this.dead = false; this.modal = false; this.hp = Math.round(this.maxHp * Cfg.gp._revive_hp_pct); this.invT = Cfg.gp._revive_invuln_sec;
        // 复活冲击波推开怪物
        this.near(this.px, this.py, 3 * CELL, (e) => { if (!e.boss) { e.kbx += (e.x - this.px) * 0.4; e.kby += (e.y - this.py) * 0.4; } });
        for (const b of this.bullets) if (b.enemy) b.life = 0;
        this.levelUpFx(); this.refreshHud();
      }, C.green, C.greenD, 32));
    }
    c.add(button(this, this.W / 2, cy + 175, 260, 80, '放弃', giveUp, 0x9a8a7a, 0x5c5048, 30));
  }
  /** 阵亡：丢失的宝物从背包里一件件掉出变灰 */
  loseItemsFx(then: () => void) {
    const prot = Save.data.active_run?.is_protected;
    const lostSlots = prot ? [] : this.hud.slots.filter((s: any) => !s.safe && this.bag[s.i]);
    if (!lostSlots.length) return then();
    lostSlots.forEach((s: any, i: number) => this.time.delayedCall(i * 140, () => {
      Sfx.play('sfx_hit', 0.35);
      const ic = this.add.image(s.x, s.y, s.ic.texture.key).setScrollFactor(0).setDepth(20000).setDisplaySize(76, 76).setTint(0x777777);
      s.ic.setVisible(false); s.n.setText('');
      this.tweens.add({ targets: ic, y: s.y + 260, angle: this.rng.range(-90, 90), alpha: 0, duration: 700, ease: 'Quad.in', onComplete: () => ic.destroy() });
    }));
    this.time.delayedCall(lostSlots.length * 140 + 700, then);
  }

  async showAd(placement: string): Promise<boolean> {
    const gp = Cfg.gp;
    if (!gp.enabled_ad_placements.includes(placement)) return false;
    const day = new Date().toISOString().slice(0, 10); const d: any = Save.data.daily; if (d.date !== day) { d.date = day; d.ad_counts = {}; }
    console.log('[track] ad_click', { placement });
    const prevPaused = this.paused; this.paused = true; this.sound.pauseAll();
    const r = await getPlatform().showRewardedAd(gp._ad_units?.[placement] ?? '');
    this.paused = prevPaused; this.sound.resumeAll();
    console.log('[track] ad_result', { placement, result: r.result });
    if (r.result !== 'complete') { if (r.result === 'fail') this.toast('暂无广告，请稍后再试'); return false; }
    d.ad_counts = d.ad_counts ?? {}; d.ad_counts[placement] = (d.ad_counts[placement] ?? 0) + 1; Save.write();
    return true;
  }

  // ======== 结束 ========
  endRun(result: 'extract' | 'death' | 'quit') {
    if ((this as any).ended) return; (this as any).ended = true;
    const run = Save.data.active_run!;
    const res: RunResult = { run_id: run.run_id, region_id: run.region_id, result, floor: this.floor, backpack: this.bag, safe: this.safe, run_gold: this.runGold, account_exp: this.kills,
      kills: this.kills, time_s: Math.round((Date.now() - this.time0) / 1000), boss_killed: this.bossKilled, is_protected: run.is_protected };
    // S3：先写结算，再播结算动画
    const rep = settleRun(res);
    this.registry.remove('runState');
    this.scene.start('Settle', { rep });
  }
}
