<script lang="ts" setup>
/**
 * 行政区域下拉选择(全局通用组件)。
 *
 * 封装全部坑点，业务页面只需 v-model 一个值：
 * - 懒加载：首屏只拉 34 省，展开逐级加载(有子级节点预置 children:[] + isLeaf:false 渲染箭头)
 * - 远程搜索：输入名称/代码 → 后端搜索 → 平铺显示完整路径(如"四川省/成都市/武侯区")
 * - 选中回显：value 对应节点不在懒加载树中时，调详情接口插入临时节点显示完整路径
 * - AntD TreeSelect 搜索后自动清空输入框的坑：时间戳冷却期区分自动清空与用户清空
 * - 过滤属性是 filterTreeNode(不是 filterOption)，远程搜索模式禁用本地过滤
 */
import type { PropType } from 'vue';

import { computed, onMounted, ref, watch } from 'vue';

import { TreeSelect } from 'ant-design-vue';

import {
  getRegionChildren,
  getRegionDetail,
  getRegionRoots,
  searchRegions,
} from '#/api/basic/dict';

const props = defineProps({
  // 协议与调用方 v-model:value 对齐(而非标准 v-model 的 modelValue)：
  // 声明为 prop 后不再进入 fallthrough attrs，避免透传 value 覆盖内部 :value 绑定
  value: {
    type: [Number, Object] as PropType<number | null | undefined>,
    default: undefined,
  },
  allowClear: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: {
    type: String,
    default: '行政区划(输入搜索 / 展开加载子级)',
  },
});

const emit = defineEmits(['update:value']);

const regionTreeData = ref<any[]>([]);

/** 后端节点 → AntD TreeSelect treeData，title 为完整路径(选中后输入框显示完整路径) */
function toRegionNodes(nodes: any[], parentPath = ''): any[] {
  return (nodes ?? []).map((n) => {
    const fullPath = parentPath ? `${parentPath}/${n.name}` : n.name;
    return {
      key: n.id,
      title: fullPath,
      value: n.id,
      path: fullPath,
      // 有子级：空数组占位 + isLeaf:false 才会渲染展开箭头
      children: n.has_children ? [] : undefined,
      isLeaf: !n.has_children,
    };
  });
}

/** 在 treeData 中递归查找节点(返回原对象引用，修改可触发响应式) */
function findNodeInTree(nodes: any[], key: number): any | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    if (n.children?.length) {
      const hit = findNodeInTree(n.children, key);
      if (hit) return hit;
    }
  }
  return null;
}

/** 懒加载：拉取子级并替换到父节点 children */
async function loadRegionChildren(node: any) {
  const children = await getRegionChildren(node.key);
  const target = findNodeInTree(regionTreeData.value, node.key);
  if (target) {
    target.children = toRegionNodes(children, target.path);
  }
}

/** 远程搜索：防抖 + 冷却期(AntD 搜索后自动清空输入框再触发 @search("")) */
let regionSearchTimer: ReturnType<typeof setTimeout> | null = null;
let lastRegionSearchTime = 0;
const regionRootsBackup = ref<any[]>([]);

function onRegionSearch(input: string) {
  if (regionSearchTimer) clearTimeout(regionSearchTimer);
  if (!input?.trim()) {
    // 冷却期内的空输入 = TreeSelect 自动清空，忽略；否则为用户主动清空 → 恢复省级列表
    if (Date.now() - lastRegionSearchTime < 1500) return;
    if (regionRootsBackup.value.length) {
      regionTreeData.value = regionRootsBackup.value;
      // 备份覆盖后回显临时节点已丢失，需重新插入
      if (typeof props.value === 'number') ensureEchoNode(props.value);
    }
    return;
  }
  regionSearchTimer = setTimeout(async () => {
    const results = await searchRegions(input.trim());
    lastRegionSearchTime = Date.now();
    regionTreeData.value = results.map((r) => ({
      key: r.id,
      title: r.path,
      value: r.id,
      isLeaf: true,
      children: undefined,
    }));
  }, 300);
}

/** 回显：value 节点不在树中时，调详情接口插入临时节点(显示完整路径而非空白/ID) */
async function ensureEchoNode(id: number) {
  if (!id || findNodeInTree(regionTreeData.value, id)) return;
  try {
    const detail = await getRegionDetail(id);
    if (detail?.path) {
      regionTreeData.value = [
        ...regionTreeData.value,
        { key: detail.id, title: detail.path, value: detail.id, isLeaf: true },
      ];
    }
  } catch {
    // 回显失败不阻断(显示 ID 兜底)
  }
}

watch(
  () => props.value,
  (v) => {
    if (typeof v === 'number') ensureEchoNode(v);
  },
);

/**
 * 回显保护：value 对应节点尚未插入树中(roots/详情接口在途)时传 undefined，
 * 让 TreeSelect 显示 placeholder 而非裸数字 ID；节点就位后自动切换为完整路径。
 */
const displayValue = computed(() => {
  if (
    typeof props.value === 'number' &&
    !findNodeInTree(regionTreeData.value, props.value)
  ) {
    return undefined;
  }
  return props.value;
});

onMounted(async () => {
  const roots = await getRegionRoots();
  regionTreeData.value = toRegionNodes(roots);
  regionRootsBackup.value = regionTreeData.value;
  if (typeof props.value === 'number') {
    ensureEchoNode(props.value);
  }
});
</script>

<template>
  <TreeSelect
    :allow-clear="allowClear"
    :disabled="disabled"
    :field-names="{ label: 'title', value: 'value', children: 'children' }"
    :filter-tree-node="false"
    :load-data="loadRegionChildren"
    :placeholder="placeholder"
    :tree-data="regionTreeData"
    :value="displayValue"
    show-search
    @search="onRegionSearch"
    @update:value="(v: any) => emit('update:value', v)"
  />
</template>
