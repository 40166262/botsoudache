# TapTap H5 SDK 真机验证说明（M0-3）

程序这边没有手机，也登录不了 TapTap 开发者后台，所以需要有后台权限的人帮忙跑一次。

## 准备（后台）
1. TapTap 开发者中心创建 H5 小游戏（或用已有的）。
2. 开通"小游戏广告"，各创建 1 个**激励视频**和 1 个**插屏**广告位，记下 adUnitId（测试广告位也可以）。
3. 配置 1 个**分享模板**，记下 templateId。
4. 创建 1 个**排行榜**，记下 leaderboardId。
5. 隐私协议里勾选"好友关系"（排行榜/好友面板需要）。

## 上传
- 上传目录：`/workspace/game/dist/`（程序会给 zip：`/workspace/game/release/sdktest.zip`）。
- 测试入口是 `sdk-test.html`。如果后台只认 `index.html`，用 `release/sdktest_as_index.zip`（里面把验证页放成了 index.html）。

## 测试步骤（在 TapTap App 里打开测试版）
1. 把上面 4 个 ID 填到页面顶部输入框（会自动记住）。
2. 先看日志第一行：`hasTapGlobal` 是否为 true，以及 `tap.* API 是否存在` 那一行，**截图**。
3. 依次点：系统信息/安全区、登录、激励视频（看完一次 + 中途关一次）、插屏、分享面板、好友面板、提交分数、排行榜面板、云存档写、云存档读、震动。
4. 切到后台再回来一次（看 onHide / onShow 是否出现）。
5. 每一步后把日志区**截图**回传；弹出的平台面板也截一张。

## 需要的机型
- 1 台千元安卓 + 1 台 iPhone（GDD §16.3 建议 2 台千元安卓 + 1 台老 iPhone）。

## 回传给程序
所有截图 + 机型和系统版本 + TapTap App 版本号。
