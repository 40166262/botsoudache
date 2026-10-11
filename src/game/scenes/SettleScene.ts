import Phaser from 'phaser';
import { Cfg, RARITY_COLOR, RARITY_ORDER } from '../../config/Config';
import { getPlatform } from '../../platform';
import { BagItem, Save } from '../../save/SaveManager';
import { addDouble, rescueItem, SettleReport } from '../Settle';
import { Sfx } from '../Sfx';
import { button, C, FONT, panel, txt } from '../ui';
import { fmt } from '../util';

export class SettleScene extends Phaser.Scene {
  constructor() { super('Settle'); }
  create(data: { rep: SettleReport }) {
    const r = data.rep; const W = this.scale.width, H = this.scale.height;
    const ok = r.success || r.protectedRun;
    this.add.tileSprite(0, 0, W, H, 'tile_garden_grass').setOrigin(0).setAlpha(0.6);
    this.add.rectangle(0, 0, W, H, ok ? 0x1a2a10 : 0x201010, 0.65).setOrigin(0);
    this.cameras.main.fadeIn(300, 255, 255, 255);
    const top = H * 0.08;
    const title = r.success ? (r.res.boss_killed ? '通关撤离！' : '撤离成功！') : r.protectedRun ? '新手保护生效' : '探险失败…';
    const t = txt(this, W / 2, top + 40, title, 72, r.success ? '#ffe27a' : r.protectedRun ? '#a8ff9c' : '#ff9c9c', '#2b1d14', 12).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 400, ease: 'Back.out' });
    this.add.image(W / 2, top + 250, r.success ? 'chr_player_win_01' : 'chr_player_dead_01').setScale(1.2);
    txt(this, W / 2, top + 370, `第 ${r.res.floor} 层 · 击败 ${r.res.kills} 只 · 用时 ${Math.floor(r.res.time_s / 60)}:${String(r.res.time_s % 60).padStart(2, '0')}`, 26, '#fff', '#2b1d14', 5);

    // 物品格：一件件"啪"地落进格子（间隔 150ms）
    const py = top + 410;
    panel(this, W / 2, py + 170, 660, 330, 0xf6e3b8);
    txt(this, W / 2, py + 40, r.success || r.protectedRun ? '带出的物品' : `保留 ${r.kept.length} 件 · 丢失 ${r.lost.length} 件`, 30, '#4a3520', '#fff', 5);
    const items: { it: BagItem; lost: boolean }[] = [...r.kept.map((it) => ({ it, lost: false })), ...r.lost.map((it) => ({ it, lost: true }))];
    items.slice(0, 16).forEach((o, i) => {
      const x = W / 2 - 3.5 * 80 + (i % 8) * 80, y = py + 120 + Math.floor(i / 8) * 96;
      this.time.delayedCall(300 + i * 150, () => {
        const g = this.add.graphics(); const rar = o.it.kind === 'treasure' ? Cfg.treasure.find((t) => t.id === o.it.id)?.rarity : null;
        g.fillStyle(C.out); g.fillRoundedRect(x - 36, y - 36, 72, 72, 12); g.fillStyle(rar && !o.lost ? RARITY_COLOR[rar] : 0x9b7a52); g.fillRoundedRect(x - 32, y - 32, 64, 64, 10);
        const key = o.it.kind === 'treasure' ? (this.textures.exists('icon_' + o.it.id) ? 'icon_' + o.it.id : 'gem_' + (rar ?? 'common')) : o.it.kind === 'blueprint' ? 'icon_blueprint' : Cfg.material.find((m) => m.id === o.it.id)?.icon ?? 'icon_relic_shard';
        const ic = this.add.image(x, y - 40, key).setDisplaySize(54, 54); if (o.lost) ic.setTint(0x555555).setAlpha(0.6);
        this.tweens.add({ targets: ic, y, duration: 200, ease: 'Bounce.out' });
        txt(this, x + 22, y + 24, o.it.kind === 'treasure' ? fmt(o.it.value ?? 0) : '×' + o.it.count, 18, o.lost ? '#aaaaaa' : '#fff', '#2b1d14', 4);
        Sfx.play(o.lost ? 'sfx_hit' : 'sfx_coin_pick', o.lost ? 0.4 : 1 + i * 0.05);
        if (r.newCodex.includes(o.it.id) && !o.lost) { const n = txt(this, x, y - 46, '新!', 20, '#ffe27a'); this.tweens.add({ targets: n, y: n.y - 8, yoyo: true, repeat: -1, duration: 400 }); }
      });
    });
    if (!items.length) txt(this, W / 2, py + 170, '背包空空如也', 28, '#7a6040', '#fff', 0);

    // 金币滚动
    const gy = py + 380;
    this.add.image(W / 2 - 120, gy, 'icon_coin').setScale(0.42);
    const gt = this.add.text(W / 2 - 80, gy, '+0', { fontFamily: FONT, fontSize: '54px', color: '#ffe27a', stroke: '#2b1d14', strokeThickness: 8, fontStyle: 'bold' }).setOrigin(0, 0.5);
    const delay = 400 + Math.min(16, items.length) * 150;
    const shown = { v: 0 };
    this.tweens.add({ targets: shown, v: r.totalGold, delay, duration: 900, ease: 'Cubic.out', onUpdate: () => gt.setText('+' + fmt(shown.v)), onComplete: () => {
      Sfx.play('sfx_chest_open');
      const best = (Save.data as any).best_gold ?? 0;
      if (r.success && r.totalGold > best) { (Save.data as any).best_gold = r.totalGold; Save.write(); this.confetti(); txt(this, W / 2, gy - 60, '新纪录！', 30, '#ffe27a'); }
    } });
    const extra: string[] = [];
    if (!r.success && !r.protectedRun && r.res.run_gold) extra.push(`局内金币保留 ${Math.round(Cfg.gp.death_keep_run_gold_ratio * 100)}%`);
    if (r.pityShard) extra.push(`保底遗迹碎片 +${r.pityShard}`);
    if (r.goldCapped) extra.push('本区域收益已达上限，去更高的遗迹吧');
    if (r.firstClear) extra.push('首通萌芽花园！');
    if (extra.length) txt(this, W / 2, gy + 56, extra.join('  ·  '), 22, '#fff', '#2b1d14', 4);

    // 按钮
    let by = gy + 140;
    if (r.success && r.doubleCap > 0 && Save.data.progress.total_runs > 1 && Cfg.gp.enabled_ad_placements.includes('A3')) {
      const b = button(this, W / 2, by, 480, 96, `📺 金币再得 +${fmt(r.doubleCap)}`, async () => {
        const ok2 = await getPlatform().showRewardedAd(Cfg.gp._ad_units?.A3 ?? '');
        if (ok2.result === 'complete') { addDouble(r); b.setEnabled(false); b.label.setText('已领取'); gt.setText('+' + fmt(r.totalGold + r.doubleCap)); this.confetti(); }
      }, C.purple, C.purpleD, 32);
      by += 120;
    } else if (!r.success && !r.protectedRun && r.rescuable.length && Cfg.gp.enabled_ad_placements.includes('A2')) {
      const it = r.rescuable[0];
      const name = it.kind === 'treasure' ? (Cfg.treasure.find((t) => t.id === it.id)?.name ?? it.id) : '装备图纸';
      const b = button(this, W / 2, by, 520, 96, `📺 抢救 1 件：${name}`, async () => {
        const ok2 = await getPlatform().showRewardedAd(Cfg.gp._ad_units?.A2 ?? '');
        if (ok2.result === 'complete') { rescueItem(r, it); b.setEnabled(false); b.label.setText('已抢救'); Sfx.play('sfx_level_up'); }
      }, C.purple, C.purpleD, 30);
      by += 120;
    }
    if (!r.success && !r.protectedRun) txt(this, W / 2, by - 30, '提示：回训练营升级角色，或把最值钱的宝物放进安全格', 22, '#ffd6a0', '#2b1d14', 4);
    button(this, W / 2 - 150, by + 50, 260, 96, '再来一局', () => this.scene.start('Menu', { again: true }), C.gold, C.goldD, 34);
    button(this, W / 2 + 150, by + 50, 260, 96, '回基地', () => this.scene.start('Menu'), C.blue, C.blueD, 34);
    void RARITY_ORDER;
  }
  confetti() {
    const W = this.scale.width;
    const p = this.add.particles(0, -20, 'px', { x: { min: 0, max: W }, lifespan: 2200, speedY: { min: 200, max: 480 }, speedX: { min: -80, max: 80 }, rotate: { min: 0, max: 360 }, scale: { min: 2, max: 4 },
      tint: [0xffd84a, 0xff6b8a, 0x6fd3ff, 0x8fe04a, 0xb46cff], quantity: 6, frequency: 30, gravityY: 200 });
    this.time.delayedCall(700, () => p.stop());
  }
}
