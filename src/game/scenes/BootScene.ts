import Phaser from 'phaser';
import { Cfg, TABLES } from '../../config/Config';
import { getPlatform } from '../../platform';
import { Save } from '../../save/SaveManager';
import { makeTextures } from '../Textures';
import { Sfx } from '../Sfx';
import { txt } from '../ui';
import { ATLASES, indexAtlases } from '../Atlas';

const IMGS = ['tile_garden_grass', 'tile_garden_stone', 'tile_garden_stone_64', 'tile_garden_grass_64'];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const { width: w, height: h } = this.scale;
    txt(this, w / 2, h / 2 - 120, '遗迹快跑', 84, '#ffd76a', '#2b1d14', 12);
    const bar = this.add.graphics();
    this.load.on('progress', (v: number) => { bar.clear(); bar.fillStyle(0x2b1d14); bar.fillRoundedRect(w / 2 - 254, h / 2 + 6, 508, 40, 20); bar.fillStyle(0x7ee36b); bar.fillRoundedRect(w / 2 - 248, h / 2 + 12, 496 * v, 28, 14); });
    for (const t of TABLES) this.load.json('cfg_' + t, `config/${t}.json`);
    for (const k of IMGS) this.load.image(k, `assets/img/${k}.png`);
    for (const a of ATLASES) this.load.atlas(a, `assets/atlas/${a}.png`, `assets/atlas/${a}.json`);
  }
  async create() {
    const raw: Record<string, any> = {};
    for (const t of TABLES) raw[t] = this.cache.json.get('cfg_' + t);
    Cfg.load(raw);
    indexAtlases(this);
    makeTextures(this);
    // 主角序列帧（美术：跑 8 帧 12fps、待机 6 帧 8fps、受击 2 帧）
    const fr = (n: string, k: number) => Array.from({ length: k }, (_, i) => ({ key: 'atlas_common', frame: `chr_player_${n}_${String(i + 1).padStart(2, '0')}` }));
    if (!this.anims.exists('hero_run')) {
      this.anims.create({ key: 'hero_run', frames: fr('run', 8), frameRate: 14, repeat: -1 });
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
