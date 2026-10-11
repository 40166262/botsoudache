import Phaser from 'phaser';
import { RARITY_COLOR, Rarity } from '../config/Config';

/** 程序生成的占位贴图（子弹、特效、技能图标、宝物图标）。美术正式图到位后按同名 key 替换 */
const OUT = 0x2b1d14; // B 风格深色描边

export function makeTextures(s: Phaser.Scene) {
  const g = s.make.graphics({ x: 0, y: 0 }, false);
  const tex = (key: string, w: number, h: number, draw: () => void) => { g.clear(); draw(); g.generateTexture(key, w, h); };

  tex('shadow', 64, 24, () => { g.fillStyle(0x000000, 0.28); g.fillEllipse(32, 12, 60, 20); });
  tex('dot', 16, 16, () => { g.fillStyle(0xffffff); g.fillCircle(8, 8, 8); });
  tex('px', 4, 4, () => { g.fillStyle(0xffffff); g.fillRect(0, 0, 4, 4); });
  tex('pellet', 24, 24, () => { g.fillStyle(OUT); g.fillCircle(12, 12, 10); g.fillStyle(0xffe27a); g.fillCircle(12, 12, 7); g.fillStyle(0xffffff); g.fillCircle(10, 10, 3); });
  tex('arrow', 40, 14, () => { g.fillStyle(OUT); g.fillRoundedRect(0, 3, 40, 8, 4); g.fillStyle(0xd94dff); g.fillRoundedRect(2, 5, 30, 4, 2); g.fillTriangle(30, 0, 40, 7, 30, 14); g.fillStyle(0xff7ae0); g.fillTriangle(31, 3, 37, 7, 31, 11); });
  tex('enemy_orb', 26, 26, () => { g.fillStyle(0x6a0f4a); g.fillCircle(13, 13, 12); g.fillStyle(0xff4fa8); g.fillCircle(13, 13, 8); g.fillStyle(0xffd0ee); g.fillCircle(11, 11, 3); });
  tex('boomerang', 48, 48, () => { g.fillStyle(OUT); g.fillTriangle(4, 8, 44, 24, 4, 40); g.fillStyle(0x58d0ff); g.fillTriangle(9, 13, 37, 24, 9, 35); g.fillStyle(0xffffff); g.fillTriangle(10, 17, 22, 24, 10, 22); });
  tex('petal', 40, 40, () => { g.fillStyle(OUT); g.fillEllipse(20, 20, 36, 22); g.fillStyle(0xff8fc7); g.fillEllipse(20, 20, 30, 16); g.fillStyle(0xffd6ea); g.fillEllipse(15, 17, 12, 6); });
  tex('bubble', 40, 40, () => { g.fillStyle(OUT); g.fillCircle(20, 20, 18); g.fillStyle(0x8ee8ff); g.fillCircle(20, 20, 15); g.fillStyle(0xd8f8ff); g.fillCircle(20, 20, 10); g.fillStyle(0xffffff); g.fillCircle(14, 13, 4); });
  tex('flame', 48, 48, () => { g.fillStyle(0xff5a1f, 0.85); g.fillCircle(24, 28, 18); g.fillStyle(0xffa12b, 0.9); g.fillCircle(24, 26, 12); g.fillStyle(0xfff0a0); g.fillCircle(24, 26, 6); });
  tex('ring', 128, 128, () => { g.lineStyle(10, 0xffffff, 1); g.strokeCircle(64, 64, 58); });
  tex('disc', 128, 128, () => { g.fillStyle(0xffffff, 1); g.fillCircle(64, 64, 64); });
  tex('star', 32, 32, () => { g.fillStyle(0xffffff); g.fillPoints(starPts(16, 16, 15, 6, 5), true); });
  tex('spark', 24, 24, () => { g.fillStyle(0xffffff); g.fillPoints(starPts(12, 12, 12, 3, 4), true); });
  tex('rock_fall', 70, 60, () => { g.fillStyle(OUT); g.fillCircle(35, 32, 26); g.fillStyle(0x9a8e80); g.fillCircle(35, 30, 22); g.fillStyle(0xc8bfb2); g.fillCircle(28, 23, 8); });
  tex('guardian', 150, 170, () => {
    g.fillStyle(OUT); g.fillRoundedRect(10, 20, 130, 145, 40); g.fillStyle(0x7d7a86); g.fillRoundedRect(16, 26, 118, 133, 36);
    g.fillStyle(0x5f5c68); g.fillRoundedRect(16, 110, 118, 49, 20); g.fillStyle(0xff3d3d); g.fillCircle(52, 70, 11); g.fillCircle(98, 70, 11); g.fillStyle(0xffd0d0); g.fillCircle(49, 67, 4); g.fillCircle(95, 67, 4);
    g.fillStyle(0x4a7c3a); g.fillEllipse(75, 30, 100, 26);
  });
  tex('joy_base', 180, 180, () => { g.fillStyle(0xffffff, 0.14); g.fillCircle(90, 90, 88); g.lineStyle(5, 0xffffff, 0.5); g.strokeCircle(90, 90, 85); });
  tex('joy_knob', 90, 90, () => { g.fillStyle(OUT, 0.5); g.fillCircle(45, 47, 42); g.fillStyle(0xfff6e0, 0.9); g.fillCircle(45, 43, 40); g.fillStyle(0xffd27a, 1); g.fillCircle(45, 43, 26); });
  tex('arrow_ind', 60, 60, () => { g.fillStyle(OUT); g.fillTriangle(56, 30, 8, 4, 8, 56); g.fillStyle(0x7ff6ff); g.fillTriangle(48, 30, 13, 12, 13, 48); });
  tex('heart', 48, 44, () => { g.fillStyle(OUT); heart(g, 24, 22, 22); g.fillStyle(0xff4d6a); heart(g, 24, 22, 17); g.fillStyle(0xffb3c0); g.fillCircle(16, 14, 4); });
  tex('magnet', 52, 52, () => { g.lineStyle(14, OUT); g.beginPath(); g.arc(26, 22, 16, Math.PI, 0); g.strokePath(); g.lineStyle(9, 0xff3b3b); g.beginPath(); g.arc(26, 22, 16, Math.PI, 0); g.strokePath(); g.fillStyle(OUT); g.fillRect(3, 20, 14, 26); g.fillRect(35, 20, 14, 26); g.fillStyle(0xdddddd); g.fillRect(6, 32, 9, 12); g.fillRect(37, 32, 9, 12); });

  // 宝物占位图标：宝石 + 稀有度色
  (['common', 'uncommon', 'rare', 'epic', 'legend'] as Rarity[]).forEach((r) => {
    const c = RARITY_COLOR[r];
    tex('gem_' + r, 96, 96, () => {
      g.fillStyle(OUT); g.fillPoints([p(48, 8), p(86, 36), p(48, 90), p(10, 36)], true);
      g.fillStyle(c); g.fillPoints([p(48, 16), p(77, 37), p(48, 80), p(19, 37)], true);
      g.fillStyle(0xffffff, 0.6); g.fillPoints([p(48, 16), p(62, 37), p(48, 37), p(30, 30)], true);
    });
    tex('frame_' + r, 96, 96, () => { g.fillStyle(OUT); g.fillRoundedRect(0, 0, 96, 96, 18); g.fillStyle(c); g.fillRoundedRect(5, 5, 86, 86, 14); g.fillStyle(0x3b2a20); g.fillRoundedRect(11, 11, 74, 74, 10); });
  });

  // 技能占位图标
  const icon = (key: string, bg: number, draw: () => void) => tex(key, 128, 128, () => { g.fillStyle(OUT); g.fillRoundedRect(0, 0, 128, 128, 26); g.fillStyle(bg); g.fillRoundedRect(7, 7, 114, 114, 20); g.fillStyle(0xffffff, 0.18); g.fillRoundedRect(7, 7, 114, 50, 20); draw(); });
  icon('ic_skill_boomerang', 0x2f7fd6, () => { g.fillStyle(OUT); g.fillTriangle(24, 30, 104, 64, 24, 98); g.fillStyle(0x9ee6ff); g.fillTriangle(33, 40, 88, 64, 33, 88); });
  icon('ic_skill_petal', 0xd84f8e, () => { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.fillStyle(OUT); g.fillCircle(64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26, 20); g.fillStyle(0xffb8dc); g.fillCircle(64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26, 15); } g.fillStyle(0xffe066); g.fillCircle(64, 64, 14); });
  icon('ic_skill_thunder', 0x3d3a8f, () => { g.fillStyle(OUT); g.fillPoints([p(72, 14), p(30, 72), p(60, 72), p(48, 116), p(98, 50), p(68, 50), p(84, 14)], true); g.fillStyle(0xffe14d); g.fillPoints([p(72, 22), p(40, 66), p(66, 66), p(58, 100), p(88, 56), p(60, 56), p(77, 22)], true); });
  icon('ic_skill_frost', 0x2aa6c7, () => { g.lineStyle(12, OUT); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; g.lineBetween(64 - Math.cos(a) * 44, 64 - Math.sin(a) * 44, 64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); } g.lineStyle(6, 0xe6fbff); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; g.lineBetween(64 - Math.cos(a) * 40, 64 - Math.sin(a) * 40, 64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40); } });
  icon('ic_skill_fire', 0xb8401c, () => { g.fillStyle(OUT); g.fillCircle(64, 76, 36); g.fillTriangle(30, 76, 64, 10, 98, 76); g.fillStyle(0xff8a1f); g.fillCircle(64, 78, 29); g.fillTriangle(38, 76, 64, 22, 90, 76); g.fillStyle(0xffe27a); g.fillCircle(64, 84, 15); });
  icon('ic_skill_bubble', 0x2c8fb8, () => { [[48, 70, 30], [86, 46, 20], [88, 90, 14]].forEach(([x, y, r]) => { g.fillStyle(OUT); g.fillCircle(x, y, r + 4); g.fillStyle(0xbdf3ff); g.fillCircle(x, y, r); g.fillStyle(0xffffff); g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.25); }); });
  icon('ic_skill_boots', 0x7c5a2e, () => { g.fillStyle(OUT); g.fillRoundedRect(36, 22, 36, 70, 10); g.fillRoundedRect(36, 72, 64, 34, 14); g.fillStyle(0xd98b3a); g.fillRoundedRect(42, 28, 24, 62, 8); g.fillRoundedRect(42, 78, 52, 22, 10); g.fillStyle(0xffffff); g.fillTriangle(14, 50, 32, 42, 32, 58); g.fillTriangle(10, 74, 30, 66, 30, 82); });
  icon('ic_skill_beat', 0x8f2f8f, () => { g.fillStyle(OUT); g.fillCircle(64, 66, 42); g.fillStyle(0xffd34d); g.fillCircle(64, 66, 35); g.lineStyle(8, OUT); g.lineBetween(64, 66, 64, 40); g.lineBetween(64, 66, 84, 76); });
  icon('ic_skill_magnet', 0x2b5ea8, () => { g.lineStyle(26, OUT); g.beginPath(); g.arc(64, 60, 32, Math.PI, 0); g.strokePath(); g.lineStyle(16, 0xff4545); g.beginPath(); g.arc(64, 60, 32, Math.PI, 0); g.strokePath(); g.fillStyle(OUT); g.fillRect(19, 58, 26, 46); g.fillRect(83, 58, 26, 46); g.fillStyle(0xeeeeee); g.fillRect(24, 80, 16, 20); g.fillRect(88, 80, 16, 20); });
  icon('ic_skill_tough', 0xa8323e, () => { g.fillStyle(OUT); heart(g, 64, 64, 44); g.fillStyle(0xff5a6e); heart(g, 64, 64, 36); g.fillStyle(0xffffff); g.fillRect(56, 44, 16, 40); g.fillRect(44, 56, 40, 16); });
  icon('ic_skill_clover', 0x2f8a3a, () => { [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => { g.fillStyle(OUT); g.fillCircle(64 + dx * 22, 60 + dy * 22, 22); g.fillStyle(0x7ee36b); g.fillCircle(64 + dx * 22, 60 + dy * 22, 17); }); g.lineStyle(8, OUT); g.lineBetween(64, 64, 80, 112); });
  icon('ic_skill_seeker', 0xb98a1c, () => { g.fillStyle(OUT); g.fillCircle(56, 56, 34); g.fillStyle(0xd8f4ff); g.fillCircle(56, 56, 26); g.lineStyle(16, OUT); g.lineBetween(80, 80, 108, 108); g.fillStyle(0xffd94d); g.fillPoints(starPts(56, 56, 16, 7, 5), true); });
  icon('ic_skill_greed', 0x6e1c1c, () => { g.fillStyle(OUT); heart(g, 64, 64, 42); g.fillStyle(0xffc233); heart(g, 64, 64, 34); });
  icon('ic_skill_leech', 0x4a1c4a, () => { g.fillStyle(OUT); g.fillCircle(64, 70, 36); g.fillStyle(0xd12f5a); g.fillCircle(64, 70, 28); });
  g.destroy();
}
const p = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
function starPts(cx: number, cy: number, R: number, r: number, n: number) { const pts = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r : R; pts.push(p(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)); } return pts; }
function heart(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number) { g.fillCircle(cx - s * 0.5, cy - s * 0.25, s * 0.55); g.fillCircle(cx + s * 0.5, cy - s * 0.25, s * 0.55); g.fillTriangle(cx - s * 1.03, cy - s * 0.05, cx + s * 1.03, cy - s * 0.05, cx, cy + s); }
