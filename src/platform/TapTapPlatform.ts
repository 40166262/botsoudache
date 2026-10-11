import type { AdResult, IPlatform, LeaderboardScore, Res, ShareOptions, SystemInfo } from './IPlatform';
import { WebPlatform } from './WebPlatform';

/* TapTap 小游戏：`tap` 是全局对象，无需安装 SDK。
 * 文档：https://developer.taptap.cn/minigameapidoc/
 * 已在文档中查到：tap.login / createRewardedVideoAd / createInterstitialAd / showShareboard / onShareMessage /
 *   openFriendList / getLeaderboardManager / getCloudSaveManager / getFileSystemManager / getSystemInfoSync
 * 是否在 H5 包里全部可用：未核实，以 sdk-test.html 真机结果为准。
 */
declare const tap: any;

const p = <T = any>(fn: (cb: { success: (r: T) => void; fail: (e: any) => void }) => void) =>
  new Promise<Res<T>>((resolve) => {
    try {
      fn({ success: (r) => resolve({ ok: true, data: r }), fail: (e) => resolve({ ok: false, err: e?.errMsg ?? String(e), code: e?.errno }) });
    } catch (e: any) { resolve({ ok: false, err: 'exception: ' + (e?.message ?? e) }); }
  });

export class TapTapPlatform implements IPlatform {
  readonly id = 'taptap_h5' as const;
  private web = new WebPlatform(); // 本地 KV / 生命周期在 H5 WebView 中沿用浏览器实现
  private rewarded: any = null;
  private rewardedUnit = '';
  private rewardedLoaded = false;
  private archives = new Map<string, string>(); // name -> uuid

  static available() { return typeof tap !== 'undefined' && !!tap; }

  async init() {
    if (typeof tap.onShareMessage === 'function') {
      try { tap.onShareMessage((r: any) => console.log('[tap] onShareMessage', r)); } catch { /* ignore */ }
    }
  }

  getSystemInfo(): SystemInfo {
    try {
      const s = tap.getSystemInfoSync();
      const w = s.windowWidth ?? s.screenWidth, h = s.windowHeight ?? s.screenHeight;
      const sa = s.safeArea ?? { top: 0, left: 0, right: w, bottom: h, width: w, height: h }; // 部分机型不返回 safeArea
      return { screenWidth: w, screenHeight: h, pixelRatio: s.pixelRatio ?? window.devicePixelRatio, platform: s.platform ?? 'taptap', safeArea: sa, raw: s };
    } catch { return this.web.getSystemInfo(); }
  }

  login() { return p<{ code: string }>((cb) => tap.login(cb)); }

  preloadRewardedAd(adUnitId: string) {
    if (this.rewarded && this.rewardedUnit === adUnitId) return;
    // 激励视频是单例；多例模式需 multiton:true（首版不用）
    this.rewarded = tap.createRewardedVideoAd({ adUnitId });
    this.rewardedUnit = adUnitId;
    this.rewarded.onLoad(() => { this.rewardedLoaded = true; });
    this.rewarded.onError((e: any) => { this.rewardedLoaded = false; console.warn('[tap] rewarded error', e); });
  }

  showRewardedAd(adUnitId: string): Promise<AdResult> {
    return new Promise((resolve) => {
      try {
        this.preloadRewardedAd(adUnitId);
        const ad = this.rewarded;
        const onClose = (r: any) => { ad.offClose?.(onClose); this.rewardedLoaded = false; resolve({ result: r && r.isEnded ? 'complete' : 'skip' }); };
        ad.onClose(onClose);
        ad.show().catch(() => ad.load().then(() => ad.show()).catch((e: any) => {
          ad.offClose?.(onClose); resolve({ result: 'fail', errorCode: e?.errCode ?? e?.errno, errMsg: e?.errMsg ?? String(e) });
        }));
      } catch (e: any) { resolve({ result: 'fail', errMsg: 'exception: ' + (e?.message ?? e) }); }
    });
  }

  showInterstitialAd(adUnitId: string): Promise<AdResult> {
    return new Promise((resolve) => {
      try {
        const ad = tap.createInterstitialAd({ adUnitId }); // 每次返回新实例，用完 destroy
        ad.onClose(() => { ad.destroy?.(); resolve({ result: 'complete' }); });
        ad.show().catch((e: any) => { ad.destroy?.(); resolve({ result: 'fail', errorCode: e?.errCode ?? e?.errno, errMsg: e?.errMsg ?? String(e) }); });
      } catch (e: any) { resolve({ result: 'fail', errMsg: 'exception: ' + (e?.message ?? e) }); }
    });
  }

  share(o: ShareOptions) { return p<void>((cb) => tap.showShareboard({ templateId: o.templateId, sceneParam: o.sceneParam, ...cb })); }
  openFriendList() { return p<void>((cb) => tap.openFriendList({ ...cb })); }
  getLaunchSceneParam(): string | undefined {
    try { const o = tap.getLaunchOptionsSync?.(); return o?.query?.sceneParam ?? o?.sceneParam; } catch { return undefined; }
  }

  // 排行榜：tap.getLeaderboardManager()（基础库 1.8.0+）。具体方法名以真机验证页打印的对象为准。
  private lb() { return tap.getLeaderboardManager(); }
  submitScore(s: LeaderboardScore) {
    return p<void>((cb) => { const m = this.lb(); m.submitScores({ scores: [{ leaderboardId: s.leaderboardId, score: s.score }], ...cb }); });
  }
  openLeaderboard(leaderboardId: string) { return p<void>((cb) => this.lb().openLeaderboard({ leaderboardId, ...cb })); }

  // 云存档：先写本地文件 tapfile://，再 create/update。单存档 ≤10MB，每分钟最多上传 1 次。
  async cloudSave(name: string, data: string): Promise<Res<{ uuid: string }>> {
    const fs = tap.getFileSystemManager();
    const cloud = tap.getCloudSaveManager();
    const path = `${tap.env.USER_DATA_PATH}/${name}.json`;
    const w = await p((cb) => fs.writeFile({ filePath: path, data, encoding: 'utf8', ...cb }));
    if (!w.ok) return w;
    if (!this.archives.has(name)) await this.refreshArchives();
    const meta = { name, summary: 'ruin-dash save', extra: '', playtime: Math.floor(Date.now() / 1000) };
    const uuid = this.archives.get(name);
    const r: Res<any> = uuid
      ? await p((cb) => cloud.updateArchive({ archiveUUID: uuid, archiveMetaData: meta, archiveFilePath: path, ...cb }))
      : await p((cb) => cloud.createArchive({ archiveMetaData: meta, archiveFilePath: path, ...cb }));
    if (!r.ok) return r;
    const newUuid = r.data?.archiveUUID ?? r.data?.uuid ?? uuid ?? '';
    if (newUuid) this.archives.set(name, newUuid);
    return { ok: true, data: { uuid: newUuid } };
  }

  private async refreshArchives() {
    const r = await p<any>((cb) => tap.getCloudSaveManager().getArchiveList({ ...cb }));
    const list: any[] = r.ok ? (r.data?.saves ?? r.data?.archiveList ?? r.data ?? []) : [];
    if (Array.isArray(list)) for (const a of list) if (a?.name) this.archives.set(a.name, a.uuid ?? a.archiveUUID);
    return list;
  }

  async cloudLoad(name: string): Promise<Res<string | null>> {
    const list = await this.refreshArchives();
    const a: any = (list as any[]).find((x) => x?.name === name);
    if (!a) return { ok: true, data: null };
    const target = `${tap.env.USER_DATA_PATH}/${name}_dl.json`;
    const d = await p<any>((cb) => tap.getCloudSaveManager().getArchiveData({ archiveUUID: a.uuid ?? a.archiveUUID, archiveFileId: a.fileId ?? a.file_id, targetFilePath: target, ...cb }));
    if (!d.ok) return d;
    const rd = await p<any>((cb) => tap.getFileSystemManager().readFile({ filePath: d.data?.filePath ?? target, encoding: 'utf8', ...cb }));
    return rd.ok ? { ok: true, data: rd.data?.data ?? null } : rd;
  }

  localGet(k: string) { return this.web.localGet(k); }
  localSet(k: string, v: string) { return this.web.localSet(k, v); }

  onHide(cb: () => void) { if (typeof tap.onHide === 'function') tap.onHide(cb); else this.web.onHide(cb); }
  onShow(cb: () => void) { if (typeof tap.onShow === 'function') tap.onShow(cb); else this.web.onShow(cb); }
  vibrateShort() { try { tap.vibrateShort?.({ type: 'light' }); } catch { /* ignore */ } }
}
