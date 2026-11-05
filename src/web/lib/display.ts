/**
 * 展示层的小工具：把开发信息翻译成读者看得懂的话。
 *
 * 原则：**只做显示，不改数据**。这里不产生任何新的档案事实，
 * 只把分类代码、人名格式这类"给机器看的"东西改成人话。
 */

/** 分类代码 → 中文分类名（对外只显示中文） */
const CATEGORY_LABEL: Record<string, string> = {
  mem: '网络热梗',
  ani: '动物梗',
  an: '动漫特摄',
  sd: '短剧角色',
  es: '电竞选手',
  intp: '公众人物',
  scr: '同人二创',
  gm: '游戏角色',
  oth: '其他档案',
};

export function categoryLabel(code: string | undefined): string {
  if (!code) return '未分类';
  return CATEGORY_LABEL[code] ?? '其他档案';
}

/** 分类配色 key：占位头像、印章环按这个取色 */
export function categoryTone(code: string | undefined): string {
  return code && code in CATEGORY_LABEL ? code : 'oth';
}

/**
 * 人名拆分：括号前为主名，括号内为副标题。
 *
 *   「做完你的做你的」鸡排主理人李俊永        → 主名整句，无副标题
 *   donk（Danil Kryshkovets / Team Spirit，CS2）→ 主名 donk / 副标题 Danil Kryshkovets · Team Spirit，CS2
 *   朱之文（大衣哥）与「你就是朱之文」句式     → 主名整句（括号在句中，不拆）
 *
 * 只有括号出现在**名称末尾**时才当作副标题，避免把句中括注切坏。
 */
export function splitName(full: string): { main: string; sub: string } {
  const s = (full ?? '').trim();
  if (!s) return { main: '', sub: '' };

  // 末尾整段括号（中/英文括号都支持）
  const tail = /^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/.exec(s);
  if (tail && tail[1] && tail[2]) {
    return { main: tail[1].trim(), sub: tail[2].trim() };
  }
  return { main: s, sub: '' };
}

/**
 * 副标题里把 " / " 换成 " · "，读起来更像档案卡的著录行。
 * 只处理分隔符，不增删内容。
 */
export function tidySubtitle(sub: string): string {
  return sub.replace(/\s*\/\s*/g, ' · ').replace(/\s*，\s*/g, '，');
}

/** 由人物 id 派生馆藏编号：mem-coke-003 → ARCH·0003 */
export function archiveNo(id: string): string {
  const m = /(\d+)\s*$/.exec(id ?? '');
  return m ? `ARCH·${m[1].padStart(4, '0')}` : 'ARCH····';
}
