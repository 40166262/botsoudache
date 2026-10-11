import Phaser from 'phaser';
import { Cfg } from '../../config/Config';
import { Save } from '../../save/SaveManager';
import { checkAbnormal } from '../Settle';
import { Sfx } from '../Sfx';
import { button, C, FONT, iconCount, panel, txt } from '../ui';
import { fmt } from '../util';
import { getPlatform } from '../../platform';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }
  private cur: Record<string, Phaser.GameObjects.Text> = {};
  private modal: Phaser.GameObjects.Container | null = null;

  create(data: { fromBoot?: boolean; again?: boolean }) {
    const g: any = this.game; if (g.__pendingH) { const nh = g.__pendingH; g.__pendingH = 0; this.scale.setGameSize(750, nh); }
    const { width: W, height: H } = this.scale;
    const sa = safeInsets(this);
    // 版面从底部往上排，长屏/短屏都不挤（底部菜单 → 新手保护 → 出发 → 区域卡 → 主角）
    const by = H - sa.bottom - 70;
    const btnY = by - 190, regY = btnY - 150, heroY = regY - 110;
    // 背景：花园地面 + 暖色暗角
    this.add.tileSprite(0, 0, W, H, 'tile_garden_grass').setOrigin(0).setTileScale(1);
    const v = this.add.graphics(); v.fillGradientStyle(0x1c120a, 0x1c120a, 0x1c120a, 0x1c120a, 0.55, 0.55, 0, 0); v.fillRect(0, 0, W, H * 0.35);
    v.fillGradientStyle(0x1c120a, 0x1c120a, 0x1c120a, 0x1c120a, 0, 0, 0.7, 0.7); v.fillRect(0, H * 0.6, W, H * 0.4);
    // 装饰
    this.add.image(90, heroY - 190, 'prop_pillar').setOrigin(0.5, 1).setScale(1.1);
    this.add.image(W - 80, heroY - 150, 'prop_statue').setOrigin(0.5, 1).setScale(1.1).setFlipX(true);
    this.add.image(150, heroY - 40, 'prop_bush_flower').setOrigin(0.5, 1);
    this.add.image(W - 160, heroY - 20, 'prop_bush_flower').setOrigin(0.5, 1).setScale(0.8);
    const portal = this.add.image(W / 2, heroY - 260, 'prop_portal_evac').setOrigin(0.5, 1).setScale(1.5).setAlpha(0.95);
    this.tweens.add({ targets: portal, alpha: 0.75, duration: 1200, yoyo: true, repeat: -1 });

    // 顶部货币
    const top = sa.top + 20;
    const d = Save.data;
    this.cur.gold = iconCount(this, 40, top + 30, 'icon_coin', fmt(d.currency.gold)).t;
    this.cur.shard = iconCount(this, 290, top + 30, 'icon_relic_shard', fmt(d.currency.shard)).t;
    this.cur.crystal = iconCount(this, 540, top + 30, 'icon_mana_crystal', fmt(d.currency.crystal)).t;
    txt(this, W / 2, top + 130, '遗迹快跑', 96, '#ffd76a', '#2b1d14', 14);
    txt(this, W / 2, top + 205, '搜 · 打 · 撤', 32, '#fff3d6', '#2b1d14', 6);

    // 主角
    const hero = this.add.image(W / 2, heroY, 'char_hero_idle').setOrigin(0.5, 1).setScale(2.2);
    this.add.image(W / 2, heroY, 'shadow').setScale(2.4, 2).setDepth(-1);
    this.tweens.add({ targets: hero, scaleY: 2.27, scaleX: 2.15, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const lvTag = txt(this, W / 2, heroY + 34, `探险家 Lv.${d.player.level}`, 30, '#fff', '#2b1d14', 6);

    // 区域卡
    panel(this, W / 2, regY, 520, 110, C.cream);
    const reg = d.progress.regions.garden;
    txt(this, W / 2, regY - 20, '萌芽花园遗迹', 38, '#3a6b2a', '#ffffff', 6);
    txt(this, W / 2, regY + 28, `3 层 · 最深到达 ${reg?.best_floor ?? 0} 层${reg?.first_clear ? ' · 已通关 ★' : ''}`, 24, '#5a4630', '#ffffff', 0);
    const shrineLock = txt(this, W / 2 + 300, regY, '▶', 40, '#ffffff').setAlpha(0.5).setInteractive();
    shrineLock.on('pointerup', () => this.toast('沉沙神殿：击败咕噜噜 + 角色 Lv5 解锁（制作中）'));

    button(this, W / 2, btnY, 440, 110, '出 发 探 险', () => this.startRun(), C.gold, C.goldD, 46);
    if (d.progress.newbie_protect_left > 0) txt(this, W / 2, btnY + 90, `新手保护：还剩 ${d.progress.newbie_protect_left} 局阵亡不丢宝物`, 22, '#d4ffc4', '#2b1d14', 5);

    // 底部功能
    const bw = 165;
    button(this, 95, by, bw, 92, '训练营', () => this.openTrain(lvTag), C.blue, C.blueD, 30);
    button(this, 95 + 187, by, bw, 92, '背包工坊', () => this.openWorkshop(), C.purple, C.purpleD, 28);
    button(this, 95 + 374, by, bw, 92, '商店', () => this.openShop(), C.red, C.redD, 30);
    button(this, 95 + 561, by, bw, 92, '设置', () => this.openSettings(), 0x7a8a9a, 0x4a5866, 30);

    this.input.once('pointerdown', () => Sfx.unlock());

    if (data?.fromBoot) {
      const rep = checkAbnormal();
      if (rep) this.alert('上一局探险中断', '已按探险失败结算。\n安全格里的东西已保留' + (rep.pityShard ? `，获得保底碎片 ×${rep.pityShard}` : '') + '。');
      this.refresh();
    }
    if (data?.again) this.time.delayedCall(50, () => this.startRun());
  }

  private refresh() {
    const d = Save.data;
    this.cur.gold.setText(fmt(d.currency.gold)); this.cur.shard.setText(fmt(d.currency.shard)); this.cur.crystal.setText(fmt(d.currency.crystal));
  }

  private startRun() {
    const d = Save.data;
    if (d.active_run) return;
    // 携带道具（S1 之前扣除）
    const gp = Cfg.gp; const carried: Record<string, number> = {};
    for (const [id, n] of Object.entries(gp._carry_default as Record<string, number>)) { const have = d.inventory.consumables[id] ?? 0; const take = Math.min(have, id === 'it_scroll' ? gp.scroll_carry_max : n); if (take > 0) carried[id] = take; }
    for (const [id, n] of Object.entries(carried)) d.inventory.consumables[id] -= n;
    const run_id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
    const seed = Math.floor(Math.random() * 2 ** 31);
    const is_protected = d.progress.newbie_protect_left > 0;
    d.active_run = { run_id, region_id: 'garden', seed, started_at: Date.now(), is_protected, carried, floor_snapshot: { floor: 1, backpack: [], safe: [], run_gold: 0, account_exp: 0 } };
    // S1：必须写成功才进局
    if (!Save.write(true)) {
      for (const [id, n] of Object.entries(carried)) d.inventory.consumables[id] += n;
      d.active_run = null;
      this.alert('存档失败', '请检查存储空间后重试。');
      return;
    }
    console.log('[track] run_start', { run_id, region_id: 'garden', carried, is_protected });
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Run', { floor: 1 }));
  }

  // ---------- 弹窗 ----------
  private openModal(title: string, h = 700) {
    this.modal?.destroy();
    const { width: W, height: H } = this.scale;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setInteractive();
    c.add(dim);
    c.add(panel(this, W / 2, H / 2, 640, h, C.panel));
    const tb = this.add.graphics(); tb.fillStyle(C.out); tb.fillRoundedRect(W / 2 - 200, H / 2 - h / 2 - 34, 400, 70, 30); tb.fillStyle(0xe28a3a); tb.fillRoundedRect(W / 2 - 194, H / 2 - h / 2 - 28, 388, 58, 26);
    c.add(tb); c.add(txt(this, W / 2, H / 2 - h / 2, title, 36));
    c.add(button(this, W / 2 + 290, H / 2 - h / 2 + 10, 70, 70, '✕', () => { this.modal?.destroy(); this.modal = null; this.refresh(); }, C.red, C.redD, 34));
    this.modal = c;
    c.setScale(0.9).setAlpha(0); this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 160, ease: 'Back.out' });
    return { c, cx: W / 2, top: H / 2 - h / 2 };
  }
  private alert(title: string, body: string) {
    const { c, cx, top } = this.openModal(title, 380);
    c.add(this.add.text(cx, top + 150, body, { fontFamily: FONT, fontSize: '30px', color: '#4a3520', align: 'center', wordWrap: { width: 540, useAdvancedWrap: true } }).setOrigin(0.5));
    c.add(button(this, cx, top + 300, 240, 84, '知道了', () => { this.modal?.destroy(); this.modal = null; this.refresh(); }));
  }
  private toast(msg: string) {
    const { width: W, height: H } = this.scale;
    const t = txt(this, W / 2, H * 0.4, msg, 28, '#fff', '#2b1d14', 6).setDepth(200).setWordWrapWidth(640);
    this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, delay: 1200, duration: 500, onComplete: () => t.destroy() });
  }

  private openTrain(lvTag: Phaser.GameObjects.Text) {
    const d = Save.data;
    const { c, cx, top } = this.openModal('训练营', 620);
    const L = d.player.level; const cur = Cfg.charLv(L), nxt = Cfg.charLv(L + 1);
    c.add(this.add.image(cx - 180, top + 230, 'char_hero_win').setScale(1.5));
    c.add(txt(this, cx + 80, top + 120, `Lv.${L}  →  Lv.${L + 1}`, 40, '#4a3520', '#fff', 6));
    c.add(txt(this, cx + 80, top + 190, `生命 ${cur.hp} → ${nxt.hp}`, 30, '#c0392b', '#fff', 5));
    c.add(txt(this, cx + 80, top + 240, `攻击 ${cur.atk} → ${nxt.atk}`, 30, '#e67e22', '#fff', 5));
    const rw = nxt.reward?.backpack_slot ? '升级奖励：背包 +1 格' : nxt.reward?.safe_slot ? '升级奖励：安全格 +1' : '';
    if (rw) c.add(txt(this, cx + 80, top + 290, rw, 26, '#2e7d32', '#fff', 5));
    const max = L >= (Cfg.gp.char_level_cap ?? 30);
    const ok = !max && d.currency.gold >= cur.gold_cost && d.currency.shard >= cur.shard_cost;
    c.add(txt(this, cx, top + 380, max ? '已满级' : `需要  金币 ${fmt(cur.gold_cost)}   碎片 ${cur.shard_cost}`, 30, ok ? '#4a3520' : '#b03a2e', '#fff', 5));
    c.add(txt(this, cx, top + 420, `拥有  金币 ${fmt(d.currency.gold)}   碎片 ${d.currency.shard}`, 24, '#7a6040', '#fff', 0));
    c.add(button(this, cx, top + 520, 320, 96, '升 级', () => {
      d.currency.gold -= cur.gold_cost; d.currency.shard -= cur.shard_cost; d.player.level++;
      Save.write(); console.log('[track] upgrade', { type: 'char', level_after: d.player.level });
      Sfx.play('sfx_level_up'); lvTag.setText(`探险家 Lv.${d.player.level}`); this.openTrain(lvTag); this.refresh();
    }).setEnabled(ok));
  }

  private openWorkshop() {
    const d = Save.data;
    const { c, cx, top } = this.openModal('背包工坊', 640);
    c.add(txt(this, cx, top + 110, `背包格 ${Save.backpackSlots} / ${Cfg.gp.backpack_perm_cap}（局内上限 ${Cfg.gp.backpack_run_cap}）`, 30, '#4a3520', '#fff', 5));
    const bar = this.add.graphics(); c.add(bar);
    for (let i = 0; i < Cfg.gp.backpack_perm_cap; i++) { bar.fillStyle(C.out); bar.fillRoundedRect(cx - 270 + i * 54, top + 150, 48, 48, 8); bar.fillStyle(i < Save.backpackSlots ? 0xe6b85c : 0x8a7a66); bar.fillRoundedRect(cx - 266 + i * 54, top + 154, 40, 40, 6); }
    const nb = Cfg.workshop.find((w) => w.type === 'backpack' && w.step === d.workshop.backpack_step + 1);
    if (nb) {
      const ok = d.currency.gold >= nb.gold && d.currency.crystal >= nb.crystal;
      c.add(txt(this, cx, top + 250, `下一次：金币 ${fmt(nb.gold)} + 魔晶 ${nb.crystal}`, 28, ok ? '#4a3520' : '#b03a2e', '#fff', 5));
      c.add(button(this, cx, top + 330, 300, 88, '扩容背包', () => { d.currency.gold -= nb.gold; d.currency.crystal -= nb.crystal; d.workshop.backpack_step++; Save.write(); Sfx.play('sfx_level_up'); this.openWorkshop(); }).setEnabled(ok));
    } else c.add(txt(this, cx, top + 290, '背包工坊已升满', 30, '#2e7d32', '#fff', 5));
    c.add(txt(this, cx, top + 430, `安全格 ${Save.safeSlots} / ${Cfg.gp.safe_cap}`, 30, '#2257a8', '#fff', 5));
    const ns = Cfg.workshop.find((w) => w.type === 'safe' && w.step === d.workshop.safe_step + 1);
    if (ns) {
      const lvOk = d.player.level >= ns.require_level; const ok = lvOk && d.currency.gold >= ns.gold && d.currency.crystal >= ns.crystal;
      c.add(txt(this, cx, top + 480, lvOk ? `下一次：金币 ${fmt(ns.gold)} + 魔晶 ${ns.crystal}` : `角色 Lv${ns.require_level} 后解锁`, 26, ok ? '#4a3520' : '#b03a2e', '#fff', 5));
      c.add(button(this, cx, top + 560, 300, 80, '增加安全格', () => { d.currency.gold -= ns.gold; d.currency.crystal -= ns.crystal; d.workshop.safe_step++; Save.write(); this.openWorkshop(); }, C.blue, C.blueD, 30).setEnabled(ok));
    }
  }

  private openShop() {
    const d = Save.data;
    const { c, cx, top } = this.openModal('商店', 620);
    const items = Cfg.item.filter((i) => i.shop_price > 0);
    items.forEach((it, idx) => {
      const y = top + 140 + idx * 170;
      const g = this.add.graphics(); g.fillStyle(0xfff8e6); g.fillRoundedRect(cx - 280, y - 70, 560, 140, 20); c.add(g);
      c.add(this.add.image(cx - 210, y, it.icon).setScale(0.8));
      c.add(this.add.text(cx - 130, y - 40, it.name, { fontFamily: FONT, fontSize: '32px', color: '#4a3520', fontStyle: 'bold' }));
      c.add(this.add.text(cx - 130, y + 6, `拥有 ${d.inventory.consumables[it.id] ?? 0}  ·  每局最多带 ${(Cfg.gp._carry_default as any)[it.id] ?? 1}`, { fontFamily: FONT, fontSize: '22px', color: '#7a6040' }));
      c.add(button(this, cx + 190, y, 160, 76, `${it.shop_price}金`, () => { d.currency.gold -= it.shop_price; d.inventory.consumables[it.id] = (d.inventory.consumables[it.id] ?? 0) + 1; Save.write(); this.openShop(); }, C.gold, C.goldD, 28).setEnabled(d.currency.gold >= it.shop_price));
    });
    c.add(txt(this, cx, top + 520, `撤离卷轴：拥有 ${d.inventory.consumables.it_scroll ?? 0}（签到 / 任务获得）`, 24, '#7a6040', '#fff', 0));
  }

  private openSettings() {
    const s: any = Save.data.settings;
    const { c, cx, top } = this.openModal('设置', 560);
    const row = (y: number, label: string, get: () => boolean, set: (v: boolean) => void) => {
      c.add(this.add.text(cx - 250, y, label, { fontFamily: FONT, fontSize: '30px', color: '#4a3520', fontStyle: 'bold' }).setOrigin(0, 0.5));
      const b = button(this, cx + 200, y, 150, 70, get() ? '开' : '关', () => { set(!get()); b.label.setText(get() ? '开' : '关'); Save.write(); }, C.blue, C.blueD, 30); c.add(b);
    };
    row(top + 120, '音效', () => s.sfx > 0, (v) => { s.sfx = v ? 0.8 : 0; Sfx.vol = s.sfx; });
    row(top + 210, '减弱画面震动', () => !!s.reduce_motion, (v) => { s.reduce_motion = v; });
    row(top + 300, '手机震动', () => s.vibrate !== false, (v) => { s.vibrate = v; });
    row(top + 390, '自动安全格', () => s.auto_safe_slot !== false, (v) => { s.auto_safe_slot = v; });
    c.add(txt(this, cx, top + 490, `版本 0.1.0 · ${getPlatform().id} · uid ${Save.data.player.uid.slice(0, 8)}`, 20, '#7a6040', '#fff', 0));
  }
}

export function safeInsets(s: Phaser.Scene) {
  const info = getPlatform().getSystemInfo();
  const k = s.scale.width / Math.max(1, info.screenWidth);
  const top = Math.max(0, info.safeArea.top * k);
  const bottom = Math.max(0, (info.screenHeight - info.safeArea.bottom) * k);
  return { top: Math.min(top, 120), bottom: Math.min(bottom, 90) };
}
