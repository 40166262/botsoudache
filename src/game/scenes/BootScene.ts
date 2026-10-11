import Phaser from 'phaser';
import { Cfg, TABLES } from '../../config/Config';
import { getPlatform } from '../../platform';
import { Save } from '../../save/SaveManager';
import { makeTextures } from '../Textures';
import { Sfx } from '../Sfx';
import { txt } from '../ui';

const IMGS = ['boss_vine_golem_attack', 'boss_vine_golem_dead', 'boss_vine_golem_idle', 'char_hero_dead', 'char_hero_hurt', 'char_hero_idle', 'char_hero_run_01', 'char_hero_run_02', 'char_hero_win',
  'chest_boss_closed', 'chest_boss_open', 'chest_cursed_closed', 'chest_cursed_open', 'chest_silver_closed', 'chest_silver_open', 'chest_wood_closed', 'chest_wood_open',
  'icon_blueprint', 'icon_bomb', 'icon_coin', 'icon_exp_star', 'icon_iron', 'icon_mana_crystal', 'icon_potion', 'icon_relic_shard', 'icon_scroll_evac', 'icon_shield',
  'mon_bat', 'mon_golem', 'mon_mimic', 'mon_archer', 'mon_slime', 'mon_slime_elite', 'mon_slime_mini', 'mon_thief',
  'prop_bush_flower', 'prop_pillar', 'prop_portal_evac', 'prop_pot', 'prop_pot_broken', 'prop_rock', 'prop_stairs_down', 'prop_statue', 'tile_garden_grass', 'tile_garden_stone', 'tile_garden_stone_64', 'tile_garden_grass_64',
  'deco_garden_flower', 'deco_garden_grass', 'deco_garden_mushroom', 'deco_garden_puddle', 'deco_garden_slab', 'deco_garden_tree', 'obs_garden_fence', 'obs_garden_wall',
  'chr_player_dead_01', 'chr_player_hurt_01', 'chr_player_hurt_02', 'chr_player_idle_01', 'chr_player_idle_02', 'chr_player_idle_03', 'chr_player_idle_04', 'chr_player_idle_05', 'chr_player_idle_06', 'chr_player_run_01', 'chr_player_run_02', 'chr_player_run_03', 'chr_player_run_04', 'chr_player_run_05', 'chr_player_run_06', 'chr_player_run_07', 'chr_player_run_08', 'chr_player_win_01', 'icon_skill_beam', 'icon_skill_beat', 'icon_skill_boomerang', 'icon_skill_boots', 'icon_skill_bubble', 'icon_skill_clover', 'icon_skill_fire', 'icon_skill_frost', 'icon_skill_greed', 'icon_skill_leech', 'icon_skill_magnet', 'icon_skill_petal', 'icon_skill_seeker', 'icon_skill_thunder', 'icon_skill_tough', 'icon_skill_turret', 'icon_tr_cat_idol', 'icon_tr_copper_bell', 'icon_tr_dew_bottle', 'icon_tr_fairy_harp', 'icon_tr_golden_scarab', 'icon_tr_hourglass_shard', 'icon_tr_pharaoh_collar', 'icon_tr_snail_whistle', 'icon_tr_sun_scepter', 'icon_tr_vine_crown', 'obj_pickup_heart', 'obj_pickup_magnet', 'ui_minimap_boss', 'ui_minimap_chest', 'ui_minimap_frame', 'ui_minimap_player', 'ui_minimap_portal', 'ui_minimap_stairs'];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const { width: w, height: h } = this.scale;
    txt(this, w / 2, h / 2 - 120, '遗迹快跑', 84, '#ffd76a', '#2b1d14', 12);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => { bar.clear(); bar.fillStyle(0x2b1d14); bar.fillRoundedRect(w / 2 - 254, h / 2 + 6, 508, 40, 20); bar.fillStyle(0x7ee36b); bar.fillRoundedRect(w / 2 - 248, h / 2 + 12, 496 * v, 28, 14); });
    for (const t of TABLES) this.load.json('cfg_' + t, `config/${t}.json`);
    for (const k of IMGS) this.load.image(k, `assets/img/${k}.png`);
  }
  async create() {
    const raw: Record<string, any> = {};
    for (const t of TABLES) raw[t] = this.cache.json.get('cfg_' + t);
    Cfg.load(raw);
    makeTextures(this);
    // 主角序列帧（美术：跑 8 帧 12fps、待机 6 帧 8fps、受击 2 帧）
    const fr = (n: string, k: number) => Array.from({ length: k }, (_, i) => ({ key: `chr_player_${n}_${String(i + 1).padStart(2, '0')}` }));
    if (!this.anims.exists('hero_run')) {
      this.anims.create({ key: 'hero_run', frames: fr('run', 8), frameRate: 12, repeat: -1 });
      this.anims.create({ key: 'hero_idle', frames: fr('idle', 6), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'hero_hurt', frames: fr('hurt', 2), frameRate: 12, repeat: -1 });
    }
    await getPlatform().init();
    Save.load();
    Sfx.vol = Save.data.settings.sfx;
    getPlatform().onHide(() => { Save.flushCloud(); });
    this.scene.start('Menu', { fromBoot: true });
  }
}
