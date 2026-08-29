/** 字典/枚举 API：拉取后端 GET /api/v1/dicts 统一聚合。 */

import { requestClient } from '#/api/request';

/** 单个字典项 */
export interface DictItem {
  label: string;
  value: number;
  /** 可选：后端 dict 接口扩展的样式标签（如 tag_color: 'red'） */
  tag_color?: string;
}

/** 聚合返回：{ "module.enum_name": [{value, label}, ...] } */
export type DictMap = Record<string, DictItem[]>;

/** 拉取全部枚举字典（前端启动时拉取一次，Pinia 全局缓存）。 */
export async function getAllDictsApi(): Promise<DictMap> {
  return requestClient.get<DictMap>('/dicts');
}
