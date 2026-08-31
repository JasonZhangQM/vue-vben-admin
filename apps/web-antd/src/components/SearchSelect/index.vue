<script lang="ts" setup>
/** 全局搜索下拉组件：内置 show-search + label/value 双匹配 filter-option。
 *
 * 两类用法：
 * 1) 字典/枚举(默认)：:options="dictOptions"，下拉即加载全部选项
 *    <SearchSelect v-model:value="form.status" :options="STATUS_OPTIONS" />
 * 2) 外键关联(remote)：:remote="true" + @search 事件走后端分页接口
 *    <SearchSelect v-model:value="form.customer_id" remote :options="remoteOptions" @search="onSearchCustomer" />
 *
 * 替代业务页面零散的 <Select show-search option-filter-prop="label" />。
 */

import { Select, SelectOptGroup, SelectOption } from 'ant-design-vue';

interface OptionItem {
  label: string;
  value: string | number;
  disabled?: boolean;
}

defineOptions({ name: 'SearchSelect', inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** 本地选项(字典/枚举模式) */
    options?: OptionItem[];
    /** 是否远程搜索(外键关联模式) */
    remote?: boolean;
    /** 远程搜索防抖毫秒数，remote=true 时生效 */
    debounce?: number;
    /** 直接透传给 a-select 的原始 options(支持 group 等高级结构) */
    rawOptions?: any[];
    /** 透传：是否可清除 */
    allowClear?: boolean;
    /** 透传：占位 */
    placeholder?: string;
    /** 透传：尺寸 */
    size?: 'small' | 'middle' | 'large';
    /** 透传：是否禁用 */
    disabled?: boolean;
    /** 透传：宽度 */
    style?: Record<string, any>;
  }>(),
  {
    debounce: 300,
  },
);

const emit = defineEmits<{
  /** 远程搜索触发：(keyword: string) => void */
  search: [keyword: string];
  /** 值变更 */
  change: [value: any];
  /** 下拉打开 */
  'dropdown-visible-change': [open: boolean];
}>();

/** 本地 filter-option：同时匹配 label(中文/名称)和 value(编码/ID)
 * option.label 可能是纯字符串(来自 :label 属性)或渲染函数(来自插槽)，
 * 取 label 属性的字符串值优先，fallback 到 children 字段。
 */
function filterOption(input: any, option: any) {
  const kw = String(input ?? '').toLowerCase();
  const rawLabel = option?.label;
  // :label 属性绑定的是纯字符串，插槽内容会让 label 变成渲染函数
  const labelStr = typeof rawLabel === 'function'
    ? String(option?.children ?? '').toLowerCase()
    : String(rawLabel ?? '').toLowerCase();
  const value = String(option?.value ?? '').toLowerCase();
  return labelStr.includes(kw) || value.includes(kw);
}

/** 远程搜索防抖。
 * 注意：remote 模式下 filter-option 必须传 false(见模板)，
 * 传 undefined 会落回 AntD 默认按 value(数字ID)本地过滤，
 * 中文关键字会把远程返回的选项全部滤掉(下拉显示"暂无数据")。
 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function onRemoteSearch(val: string) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => emit('search', val), props.debounce);
}
</script>

<template>
  <!-- value 绑定不经 v-model 声明：父组件 v-model:value 经 inheritAttrs=false
       落入 $attrs，由下方 v-bind 整体透传给 Select(remote 分支追加 onSearch) -->
  <Select
    show-search
    :allow-clear="allowClear"
    :disabled="disabled"
    :placeholder="placeholder"
    :size="size"
    :style="style"
    :filter-option="remote ? false : filterOption"
    @change="emit('change', $event)"
    @dropdown-visible-change="emit('dropdown-visible-change', $event)"
    v-bind="remote ? { ...$attrs, onSearch: onRemoteSearch } : $attrs"
  >
    <template v-if="rawOptions">
      <template v-for="opt in rawOptions" :key="String(opt.value ?? opt.label)">
        <SelectOption
          v-if="!opt.options"
          :value="opt.value"
          :label="opt.label"
          :disabled="opt.disabled"
        >
          {{ opt.label }}
        </SelectOption>
        <SelectOptGroup v-else :key="String(opt.label)" :label="opt.label">
          <SelectOption
            v-for="gopt in opt.options"
            :key="String(gopt.value)"
            :value="gopt.value"
            :label="gopt.label"
            :disabled="gopt.disabled"
          >
            {{ gopt.label }}
          </SelectOption>
        </SelectOptGroup>
      </template>
    </template>
    <template v-else-if="options">
      <SelectOption
        v-for="opt in options"
        :key="String(opt.value)"
        :value="opt.value"
        :label="opt.label"
        :disabled="opt.disabled"
      >
        {{ opt.label }}
      </SelectOption>
    </template>
  </Select>
</template>
