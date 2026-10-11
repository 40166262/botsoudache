import Phaser from 'phaser';
/** 图集帧名 → 图集 key。代码里仍按"文件名"取图，这里统一翻译成 (图集, 帧名)，一套图集一次绑定，合批更稳 */
export const FRAME_OF: Record<string, string> = {};
export const ATLASES = ['atlas_common', 'atlas_garden', 'atlas_ui_hud'];
const ALIAS: Record<string, string> = { boss_vine_golem_attack: 'boss_gulu_attack', boss_vine_golem_idle: 'boss_gulu_idle', boss_vine_golem_dead: 'boss_gulu_dead', mon_archer: 'mon_mushroom_archer', mon_thief: 'mon_thief_rat' };
export function indexAtlases(scene: Phaser.Scene) {
  for (const a of ATLASES) { const t = scene.textures.get(a); for (const f of t.getFrameNames()) FRAME_OF[f] = a; }
  for (const [k, v] of Object.entries(ALIAS)) if (FRAME_OF[v]) FRAME_OF[k] = FRAME_OF[v];
}
/** 返回 [贴图 key, 帧名]；不在图集里的（程序生成的贴图、地砖）原样返回 */
export function resolve(key: any, frame?: any): [any, any] {
  if (typeof key === 'string' && frame === undefined && FRAME_OF[key]) return [FRAME_OF[key], ALIAS[key] ?? key];
  return [key, frame];
}
export function hasImg(scene: Phaser.Scene, key: string) { return !!FRAME_OF[key] || scene.textures.exists(key); }
export function patchFactories() {
  const F = Phaser.GameObjects.GameObjectFactory.prototype as any;
  for (const m of ['image', 'sprite']) { const o = F[m]; F[m] = function (x: number, y: number, key: any, frame?: any) { const [k, f] = resolve(key, frame); return o.call(this, x, y, k, f); }; }
  for (const C of [Phaser.GameObjects.Image, Phaser.GameObjects.Sprite] as any[]) {
    const o = C.prototype.setTexture; C.prototype.setTexture = function (key: any, frame?: any, ...rest: any[]) { const [k, f] = resolve(key, frame); return o.call(this, k, f, ...rest); };
  }
}
