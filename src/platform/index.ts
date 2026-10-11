import type { IPlatform } from './IPlatform';
import { TapTapPlatform } from './TapTapPlatform';
import { WebPlatform } from './WebPlatform';

export * from './IPlatform';

let inst: IPlatform | null = null;

/** 按运行环境自动选择；URL 加 ?platform=web 可强制用 mock */
export function getPlatform(): IPlatform {
  if (inst) return inst;
  const force = new URLSearchParams(location.search).get('platform');
  if (force !== 'web' && TapTapPlatform.available()) inst = new TapTapPlatform();
  // 以后：else if (typeof wx !== 'undefined') inst = new WechatPlatform(); else if (typeof tt !== 'undefined') inst = new DouyinPlatform();
  else inst = new WebPlatform();
  return inst;
}
