import type { DictItem, DictMap } from '#/api/core/dicts';

import { defineStore } from 'pinia';
import { ref } from 'vue';

import { getAllDictsApi } from '#/api/core/dicts';

/**
 * 全局字典 store：缓存后端 GET /api/v1/dicts 聚合返回的全部枚举。
 *
 * 三值分离里的 label 真相源 —— 业务页面一律从这里取 options，
 * 禁止在业务代码里硬编码 const OPTIONS = [{ value, label }]。
 */
export const useDictStore = defineStore('dict', () => {
  /** 全部枚举：{ "customer.classification": [{value, label}, ...] } */
  const dictMap = ref<DictMap>({});
  /** 加载中(首次启动或手动刷新时) */
  const loading = ref(false);
  /** 上次加载时间戳 */
  const lastLoadedAt = ref(0);
  /** TTL 毫秒(10 分钟) */
  const TTL = 10 * 60 * 1000;

  /** 是否还有效(未过期且已加载) */
  function isFresh() {
    return Object.keys(dictMap.value).length > 0 &&
      Date.now() - lastLoadedAt.value < TTL;
  }

  /** 加载全部字典(幂等：已加载则跳过) */
  async function loadAll(force = false) {
    if (!force && isFresh()) return dictMap.value;
    loading.value = true;
    try {
      const data = await getAllDictsApi();
      dictMap.value = data;
      lastLoadedAt.value = Date.now();
    } finally {
      loading.value = false;
    }
    return dictMap.value;
  }

  /** 手动刷新(跳过 TTL 检查) */
  async function refresh() {
    return loadAll(true);
  }

  /**
   * 取指定字典的 options 数组(供 <SearchSelect> :options 使用)。
   *
   * @param key 完整字典 key，如 'customer.classification'
   * @returns [{value, label}, ...]；未加载或不存在时返回空数组
   */
  function get(key: string): DictItem[] {
    return dictMap.value[key] ?? [];
  }

  /**
   * 用 value 反查 label(列表页行渲染、详情页字段显示用)。
   *
   * @returns 中文 label；找不到返回 `—`
   */
  function labelOf(key: string, value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const items = dictMap.value[key];
    if (!items) return '—';
    return items.find((i) => i.value === value)?.label ?? '—';
  }

  function $reset() {
    dictMap.value = {};
    loading.value = false;
    lastLoadedAt.value = 0;
  }

  return {
    $reset,
    dictMap,
    get,
    labelOf,
    loading,
    loadAll,
    refresh,
  };
});
