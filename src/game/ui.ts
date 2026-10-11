import Phaser from 'phaser';
import { Sfx } from './Sfx';

export const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const C = { out: 0x2b1d14, cream: 0xfff3d6, panel: 0xf6e3b8, panelDark: 0xd9b77c, green: 0x58c44a, greenD: 0x2f8a2a, blue: 0x3d8df0, blueD: 0x2257a8, red: 0xe8513f, redD: 0x9c2a1f, gold: 0xffc533, goldD: 0xc98a12, gray: 0x9a9a9a, grayD: 0x5c5c5c, purple: 0x9b59e8, purpleD: 0x5d2ca0 };

export function txt(s: Phaser.Scene, x: number, y: number, t: string, size = 30, color = '#ffffff', stroke = '#2b1d14', strokeW = 6) {
  return s.add.text(x, y, t, { fontFamily: FONT, fontSize: size + 'px', color, stroke, strokeThickness: strokeW, fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
}

/** B 风格面板：粗深描边 + 平涂 + 一层亮边 */
export function panel(s: Phaser.Scene, x: number, y: number, w: number, h: number, fill = C.panel, r = 26) {
  const g = s.add.graphics();
  g.fillStyle(0x000000, 0.25); g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 10, w, h, r);
  g.fillStyle(C.out); g.fillRoundedRect(x - w / 2 - 5, y - h / 2 - 5, w + 10, h + 10, r + 4);
  g.fillStyle(fill); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.35); g.fillRoundedRect(x - w / 2 + 8, y - h / 2 + 6, w - 16, 10, 5);
  return g;
}

export interface Btn extends Phaser.GameObjects.Container { setEnabled(v: boolean): Btn; label: Phaser.GameObjects.Text; }
export function button(s: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, color = C.green, dark = C.greenD, size = 34): Btn {
  const c = s.add.container(x, y) as Btn;
  const g = s.add.graphics();
  let enabled = true;
  const draw = (pressed: boolean) => {
    g.clear(); const fill = enabled ? color : C.gray, d = enabled ? dark : C.grayD; const oy = pressed ? 4 : 0;
    g.fillStyle(C.out); g.fillRoundedRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 14, 22);
    g.fillStyle(d); g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18);
    g.fillStyle(fill); g.fillRoundedRect(-w / 2, -h / 2 + oy, w, h - 6, 18);
    g.fillStyle(0xffffff, 0.3); g.fillRoundedRect(-w / 2 + 10, -h / 2 + 6 + oy, w - 20, 9, 5);
    t.y = -3 + oy;
  };
  const t = txt(s, 0, -3, label, size);
  c.add([g, t]); c.label = t;
  draw(false);
  c.setSize(w + 10, h + 14).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { if (enabled) draw(true); });
  c.on('pointerout', () => draw(false));
  c.on('pointerup', () => { draw(false); if (!enabled) return; Sfx.unlock(); Sfx.play('sfx_ui_click'); onClick(); });
  c.setEnabled = (v: boolean) => { enabled = v; draw(false); return c; };
  return c;
}

export function iconCount(s: Phaser.Scene, x: number, y: number, key: string, v: string, scale = 0.38) {
  const c = s.add.container(x, y);
  const bg = s.add.graphics(); bg.fillStyle(0x000000, 0.35); bg.fillRoundedRect(-6, -22, 150, 44, 22);
  const i = s.add.image(12, 0, key).setScale(scale);
  const t = s.add.text(40, 0, v, { fontFamily: FONT, fontSize: '28px', color: '#fff', stroke: '#2b1d14', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0, 0.5);
  c.add([bg, i, t]);
  return { c, t };
}
