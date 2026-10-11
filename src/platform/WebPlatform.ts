import type { AdResult, IPlatform, LeaderboardScore, Res, ShareOptions, SystemInfo } from './IPlatform';

/** 普通浏览器/调试用实现：广告和社交全部 mock，便于在电脑或手机浏览器里直接试玩 */
export class WebPlatform implements IPlatform {
  readonly id = 'web' as const;
  async init() {}

  getSystemInfo(): SystemInfo {
    const w = window.innerWidth, h = window.innerHeight;
    // 读 CSS env(safe-area-inset-*)
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const t = parseFloat(cs.paddingTop) || 0, b = parseFloat(cs.paddingBottom) || 0;
    const l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
    probe.remove();
    return { screenWidth: w, screenHeight: h, pixelRatio: window.devicePixelRatio || 1, platform: 'web',
      safeArea: { top: t, bottom: h - b, left: l, right: w - r, width: w - l - r, height: h - t - b } };
  }

  async login(): Promise<Res<{ code: string }>> { return { ok: true, data: { code: 'web-mock-code' } }; }

  preloadRewardedAd() {}
  async showRewardedAd(id: string): Promise<AdResult> {
    // 模拟广告：全屏遮罩 5 秒倒计时，看满才算 complete，中途关闭算 skip
    return new Promise((resolve) => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,12,20,.92);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:bold 20px sans-serif;gap:18px';
      d.innerHTML = `<div style="font-size:15px;opacity:.7">模拟激励视频（${id || '测试广告位'}）</div><div id="adt" style="font-size:56px">5</div><div style="font-size:15px;opacity:.7">真机上这里是 TapTap 广告</div><button id="adc" style="font-size:16px;padding:10px 26px;border-radius:20px;border:0;background:#555;color:#fff">关闭（不发奖励）</button>`;
      document.body.appendChild(d);
      let n = 5; const t = d.querySelector('#adt')!, c = d.querySelector('#adc') as HTMLButtonElement;
      const done = (r: AdResult) => { clearInterval(iv); d.remove(); resolve(r); };
      const iv = setInterval(() => { n--; t.textContent = String(n); if (n <= 0) { c.textContent = '领取奖励'; c.style.background = '#3c9d3c'; c.onclick = () => done({ result: 'complete' }); clearInterval(iv); } }, 1000);
      c.onclick = () => done({ result: 'skip' });
    });
  }
  async showInterstitialAd(id: string): Promise<AdResult> { console.log('[mock interstitial]', id); return { result: 'complete' }; }

  async share(o: ShareOptions): Promise<Res> { console.log('[mock share]', o); return { ok: true, data: undefined }; }
  async openFriendList(): Promise<Res> { return { ok: false, err: 'web 平台不支持好友面板' }; }
  getLaunchSceneParam() { return new URLSearchParams(location.search).get('sceneParam') ?? undefined; }

  async submitScore(s: LeaderboardScore): Promise<Res> { console.log('[mock score]', s); return { ok: true, data: undefined }; }
  async openLeaderboard(): Promise<Res> { return { ok: false, err: 'web 平台不支持排行榜' }; }

  async cloudSave(name: string, data: string): Promise<Res<{ uuid: string }>> { localStorage.setItem('cloud_' + name, data); return { ok: true, data: { uuid: 'web-' + name } }; }
  async cloudLoad(name: string): Promise<Res<string | null>> { return { ok: true, data: localStorage.getItem('cloud_' + name) }; }

  localGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
  localSet(k: string, v: string) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

  onHide(cb: () => void) { document.addEventListener('visibilitychange', () => { if (document.hidden) cb(); }); window.addEventListener('pagehide', cb); }
  onShow(cb: () => void) { document.addEventListener('visibilitychange', () => { if (!document.hidden) cb(); }); }
  vibrateShort() { try { navigator.vibrate?.(15); } catch { /* ignore */ } }
}
