import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { RunScene } from './game/scenes/RunScene';
import { SettleScene } from './game/scenes/SettleScene';
import { installDebug } from './game/Debug';
import { patchFactories } from './game/Atlas';
patchFactories();

// 宽度固定 750，高度随屏幕比例 1334~1750（资源规范 §1）
const W = 750;
const ratio = window.innerHeight / Math.max(1, window.innerWidth);
const calcH = () => Math.round(Math.min(1800, Math.max(1334, W * (window.innerHeight / Math.max(1, window.innerWidth)))));
const H = calcH(); void ratio;

// 固定在屏幕上的容器：子对象也跟着不滚动，否则点击判定会被相机偏移（Phaser 子对象各自用自己的 scrollFactor 做命中检测）
const CP = Phaser.GameObjects.Container.prototype as any; const _add = CP.add;
CP.add = function (child: any) { _add.call(this, child); if (this.scrollFactorX === 0) { for (const o of Array.isArray(child) ? child : [child]) { if (o.setScrollFactor) o.setScrollFactor(0, 0, true); } } return this; };
const _sf = CP.setScrollFactor; CP.setScrollFactor = function (x: number, y?: number, upd?: boolean) { return _sf.call(this, x, y, upd ?? (x === 0)); };
installDebug(null as any);
(window as any).__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#20252f',
  width: W, height: H,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: !/[?&]tf=0/.test(location.search), antialiasGL: /[?&]msaa=1/.test(location.search), roundPixels: false, powerPreference: 'high-performance', mipmapFilter: '' },
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  input: { activePointers: 3 },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, RunScene, SettleScene],
} as any);

// 屏幕比例变了（转屏、浏览器工具栏收起、电脑上切换模拟机型）：重新算高度，首页和结算页重排，避免上下黑边
let rzT = 0;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = window.setTimeout(() => {
  const g = (window as any).__game as Phaser.Game; const nh = calcH();
  if (Math.abs(nh - g.scale.height) < 8) return;
  const act = g.scene.getScenes(true).map((s) => s.scene.key);
  if (act.includes('Run')) { (g as any).__pendingH = nh; return; } // 局内不打断，回到首页时再重排
  g.scale.setGameSize(750, nh); for (const k of act) g.scene.getScene(k).scene.restart();
}, 250); });
