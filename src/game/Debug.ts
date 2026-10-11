import Phaser from 'phaser';
/** ?debug=1：左上角显示帧率、每帧绘制调用次数、显示对象数 */
export const DEBUG = /[?&]debug=1/.test(location.search);
let draws = 0, lastDraws = 0;
export function installDebug(_g: Phaser.Game) {
  if (!DEBUG) return;
  // 在原型上计数，任何 WebGL 上下文的绘制调用都会被记到
  for (const P of [(window as any).WebGLRenderingContext, (window as any).WebGL2RenderingContext]) {
    if (!P) continue;
    for (const fn of ['drawArrays', 'drawElements']) { const o = P.prototype[fn]; P.prototype[fn] = function (...a: any[]) { draws++; return o.apply(this, a); }; }
  }
  const hookG = () => { const g = (window as any).__game as Phaser.Game; if (!g) return setTimeout(hookG, 50); g.events.on('postrender', () => { lastDraws = draws; draws = 0; }); }; hookG();
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:4px;top:4px;z-index:99999;background:rgba(0,0,0,.65);color:#7CFC00;font:12px/1.35 monospace;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  let frames = 0, t0 = performance.now(), fps = 0;
  const tick = () => {
    frames++; const now = performance.now();
    if (now - t0 >= 500) {
      fps = (frames * 1000) / (now - t0); frames = 0; t0 = now;
      const game = (window as any).__game as Phaser.Game; if (!game) { requestAnimationFrame(tick); return; } const sc = game.scene.getScenes(true)[0] as any;
      const objs = sc ? sc.children.list.length : 0; const vis = sc ? sc.children.list.filter((o: any) => o.visible).length : 0;
      el.textContent = `FPS ${fps.toFixed(0)}\ndraw ${lastDraws}\nobj ${vis}/${objs}\n${game.scale.width}x${game.scale.height}`;
      (window as any).__perf = { fps, draws: lastDraws, objs, vis };
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
