/** 权证模块 UI 常量——枚举值 → AntD Tag 颜色映射。
 *
 *  原则：与后端 enums.py 的 LabeledIntEnum 语义对齐（同值不同枚举
 *  必须分开映射，不能"值对值"瞎复用——详见 index.vue / detail-drawer.vue
 *  各自调用各自的 STATE_COLOR）。
 *
 *  AGENTS.md §5.5 说颜色/样式标签随 dict 后端下发；但当前后端
 *  dict 未扩展 tag_color 字段，前端暂做本地映射，后端就绪后迁移。
 */

/** 权证主状态 WarrantState → AntD Tag color */
export const WARRANT_STATE_COLOR: Record<number, string> = {
  10: 'default', // 未入库
  20: 'green', // 已入库
  30: 'blue', // 已加保
  60: 'default', // 无需入库
  110: 'orange', // 续抵出库
  210: 'orange', // 已借出
  310: 'red', // 解保出库
  410: 'purple', // 已移交
  990: 'red', // 已注销
};

/** 拍卖状态 AuctionState → AntD Tag color（与 WarrantState 值有重叠，必须独立） */
export const AUCTION_STATE_COLOR: Record<number, string> = {
  10: 'green', // 正常
  20: 'red', // 查封
  30: 'blue', // 评估
  50: 'processing', // 挂网
  110: 'gold', // 成交
  210: 'red', // 流拍
  310: 'blue', // 回转
  990: 'default', // 注销
};

/** 出入库类型 StorageType → AntD Tag color（列表页 storage_latest 列用） */
export const STORAGE_TYPE_COLOR: Record<number, string> = {
  10: 'green', // 入库
  20: 'orange', // 续抵出库
  30: 'blue', // 已加保
  60: 'default', // 无需入库
  110: 'orange', // 借出
  120: 'green', // 归还
  310: 'red', // 解保出库
  410: 'purple', // 移交
  990: 'default', // 注销
};

export function warrantStateColor(s: number | undefined | null): string {
  if (s == null) return 'default';
  return WARRANT_STATE_COLOR[s] ?? 'default';
}

export function auctionStateColor(s: number | undefined | null): string {
  if (s == null) return 'default';
  return AUCTION_STATE_COLOR[s] ?? 'default';
}
