<template>
  <a-select
    v-bind="$attrs"
    :options="resolvedOptions"
    :show-search="true"
    :filter-option="combinedFilter"
    :loading="loading || dictStore.loading"
    :value="modelValue"
    v-on="$listeners"
    @change="onUpdate"
  />
</template>

<script setup lang="ts">
import type { DictItem } from '#/api/core/dicts';

import { computed } from 'vue';

import { useDictStore } from '#/store';

/**
 * SearchSelect 统一封装：
 * - 同时匹配 label（中文）和 value（编码）—— 输入"正常"或"10"都能搜到五级分类
 * - 两种使用模式：
 *   1. 自动模式 <SearchSelect :dict-key="'customer.classification'" v-model="val" />
 *   2. 手动模式 <SearchSelect :options="myOptions" v-model="val" @search="onRemoteSearch" />
 */
const props = defineProps<{
  modelValue?: number | string | number[] | null;
  /** 自动模式：字典 key，如 'customer.classification' */
  dictKey?: string;
  /** 手动模式：直接传 options */
  options?: DictItem[];
  /** 手动模式下的加载状态（远程搜索时用） */
  loading?: boolean;
}>();

const emit = defineEmits<{
  search: [value: string];
  'update:modelValue': [value: any];
}>();

const dictStore = useDictStore();

/** 最终 options：优先手动传的，否则从 dictStore 按 dictKey 取 */
const resolvedOptions = computed<DictItem[]>(() => {
  if (props.options?.length) return props.options;
  if (props.dictKey) {
    // 首次访问时触发加载（loadAll 幂等+TTL 缓存）
    dictStore.loadAll().catch(() => {});
    return dictStore.get(props.dictKey);
  }
  return [];
});

/**
 * 同时匹配 label（中文/名称）和 value（编码/ID）。
 * 解决"没人记得 key"问题。
 */
function combinedFilter(input: string, option: any) {
  const kw = input.toLowerCase().trim();
  if (!kw) return true;
  const label = String(option.label ?? '').toLowerCase();
  const value = String(option.value ?? '').toLowerCase();
  return label.includes(kw) || value.includes(kw);
}

function onUpdate(val: any) {
  emit('update:modelValue', val);
}
</script>
