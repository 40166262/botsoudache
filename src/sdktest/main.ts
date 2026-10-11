import { getPlatform } from '../platform';
declare const tap: any;

const logEl = document.getElementById('log')!;
const log = (name: string, ok: boolean | null, detail: unknown) => {
  const line = document.createElement('div');
  line.className = ok === true ? 'ok' : ok === false ? 'bad' : '';
  const t = new Date().toTimeString().slice(0, 8);
  line.textContent = `[${t}] ${ok === true ? '✅' : ok === false ? '❌' : 'ℹ️'} ${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  logEl.prepend(line);
};
const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
const store = ['rv', 'it', 'tpl', 'lb'];
store.forEach((k) => { const el = document.getElementById(k) as HTMLInputElement; el.value = localStorage.getItem('sdkt_' + k) ?? ''; el.onchange = () => localStorage.setItem('sdkt_' + k, el.value); });

const plat = getPlatform();
const hasTap = typeof tap !== 'undefined';
log('环境', hasTap, { platform: plat.id, hasTapGlobal: hasTap, ua: navigator.userAgent });
if (hasTap) {
  const apis = ['login', 'createRewardedVideoAd', 'createInterstitialAd', 'showShareboard', 'onShareMessage', 'openFriendList',
    'getLeaderboardManager', 'getCloudSaveManager', 'getFileSystemManager', 'getSystemInfoSync', 'onShow', 'onHide', 'getLaunchOptionsSync', 'vibrateShort'];
  log('tap.* API 是否存在', null, Object.fromEntries(apis.map((a) => [a, typeof tap[a]])));
}

const tests: [string, () => Promise<unknown>][] = [
  ['系统信息/安全区', async () => plat.getSystemInfo()],
  ['登录 login', () => plat.login()],
  ['激励视频', () => plat.showRewardedAd(val('rv'))],
  ['插屏', () => plat.showInterstitialAd(val('it'))],
  ['分享面板', () => plat.share({ templateId: val('tpl'), sceneParam: 'invite_from=sdktest' })],
  ['好友面板', () => plat.openFriendList()],
  ['提交分数', () => plat.submitScore({ leaderboardId: val('lb'), score: Math.floor(Math.random() * 1000) })],
  ['排行榜面板', () => plat.openLeaderboard(val('lb'))],
  ['云存档 写', () => plat.cloudSave('sdktest', JSON.stringify({ t: Date.now(), hello: '遗迹快跑' }))],
  ['云存档 读', () => plat.cloudLoad('sdktest')],
  ['启动参数 sceneParam', async () => plat.getLaunchSceneParam() ?? '(无)'],
  ['震动', async () => { plat.vibrateShort(); return 'called'; }],
];
const box = document.getElementById('btns')!;
for (const [name, fn] of tests) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = async () => {
    log(name, null, '调用中…');
    try {
      const r: any = await fn();
      const ok = r?.ok === false || r?.result === 'fail' ? false : true;
      log(name, ok, r);
    } catch (e: any) { log(name, false, 'exception: ' + (e?.message ?? e)); }
  };
  box.appendChild(b);
}
plat.onHide(() => log('生命周期', null, 'onHide'));
plat.onShow(() => log('生命周期', null, 'onShow'));
plat.init().then(() => log('init', true, 'done'));
