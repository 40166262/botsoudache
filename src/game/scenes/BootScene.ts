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
  'prop_bush_flower', 'prop_pillar', 'prop_portal_evac', 'prop_pot', 'prop_pot_broken', 'prop_rock', 'prop_stairs_down', 'prop_statue', 'tile_garden_grass', 'tile_garden_stone'];

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
    await getPlatform().init();
    Save.load();
    Sfx.vol = Save.data.settings.sfx;
    getPlatform().onHide(() => { Save.flushCloud(); });
    this.scene.start('Menu', { fromBoot: true });
  }
}
