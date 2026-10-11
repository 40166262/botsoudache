/**
 * 平台抽象层。游戏逻辑只依赖这个接口，不直接调 tap.* / wx.* / tt.*。
 * 新平台 = 新写一个实现类 + 在 index.ts 里注册。
 */
export type PlatformId = 'taptap_h5' | 'wechat' | 'douyin' | 'web';

export interface SafeArea { top: number; bottom: number; left: number; right: number; width: number; height: number; }
export interface SystemInfo { screenWidth: number; screenHeight: number; pixelRatio: number; safeArea: SafeArea; platform: string; raw?: unknown; }

export type AdResult = { result: 'complete' | 'skip' | 'fail'; errorCode?: string | number; errMsg?: string };
export interface ShareOptions { templateId?: string; sceneParam?: string; title?: string; imageUrl?: string; }
export interface LeaderboardScore { leaderboardId: string; score: number; }
export interface CloudArchive { uuid: string; fileId?: string; name: string; summary?: string; modifiedAt?: number; }

/** 所有方法失败时不抛业务异常到游戏层，统一返回 {ok:false, err} 便于兜底和埋点 */
export type Res<T = void> = { ok: true; data: T } | { ok: false; err: string; code?: string | number };

export interface IPlatform {
  readonly id: PlatformId;
  init(): Promise<void>;
  getSystemInfo(): SystemInfo;

  login(): Promise<Res<{ code: string }>>;

  /** 激励视频：只有 complete 才能发奖（GDD §14.2 / §14.5） */
  showRewardedAd(adUnitId: string): Promise<AdResult>;
  preloadRewardedAd(adUnitId: string): void;
  showInterstitialAd(adUnitId: string): Promise<AdResult>;

  share(opts: ShareOptions): Promise<Res>;
  openFriendList(): Promise<Res>;
  /** 启动参数里带的 sceneParam（被邀请进入时） */
  getLaunchSceneParam(): string | undefined;

  submitScore(s: LeaderboardScore): Promise<Res>;
  openLeaderboard(leaderboardId: string): Promise<Res>;

  /** 云存档：data 为整份存档 JSON 字符串。注意 TapTap 限制每分钟最多上传 1 次 */
  cloudSave(name: string, data: string): Promise<Res<{ uuid: string }>>;
  cloudLoad(name: string): Promise<Res<string | null>>;

  /** 本地 KV（同步） */
  localGet(key: string): string | null;
  localSet(key: string, val: string): boolean;

  onHide(cb: () => void): void;
  onShow(cb: () => void): void;
  vibrateShort(): void;
}
