<script lang="ts" setup>
/** 行政区划：只读树形表格(懒加载子级)，按名称/代码搜索。 */

import type { RegionTreeNode } from '#/api/basic/dict';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Button, Card, Form, FormItem, Input, Table, Tag } from 'ant-design-vue';
import { useRowHighlight } from '#/composables/useRowHighlight';

import { getRegionChildren, getRegionRoots, searchRegions } from '#/api/basic/dict';

const loading = ref(false);
/** 搜索模式：true 时展示平铺搜索结果(无树形展开) */
const searchMode = ref(false);
const tree = ref<RegionTreeNode[]>([]);
/** 受控展开行(树形懒加载) */
const expandedKeys = ref<number[]>([]);
/** 已加载过子级的节点 id 集合(避免重复请求) */
const loadedIds = new Set<number>();

/** 懒加载子级：占位 children 置换为真实数据 */
async function loadChildren(record: RegionTreeNode) {
  if (loadedIds.has(record.id)) return;
  loadedIds.add(record.id);
  const children = await getRegionChildren(record.id);
  // has_children 为 true 的节点预置空数组占位，让 Table 渲染展开箭头
  record.children = children.map((c) => ({
    ...c,
    children: c.has_children ? [] : undefined,
  }));
}

/** 展开事件：首次展开时拉取子级 */
async function onExpand(expanded: boolean, record: RegionTreeNode) {
  if (expanded) {
    await loadChildren(record);
    expandedKeys.value = [...expandedKeys.value, record.id];
  } else {
    expandedKeys.value = expandedKeys.value.filter((k) => k !== record.id);
  }
}

/** 首屏：省级列表 */
async function loadRoots() {
  loading.value = true;
  try {
    searchMode.value = false;
    expandedKeys.value = [];
    loadedIds.clear();
    const roots = await getRegionRoots();
    // has_children 为 true 的节点预置空 children，让表格渲染展开箭头
    tree.value = roots.map((r) => ({
      ...r,
      children: r.has_children ? [] : undefined,
    }));
  } finally {
    loading.value = false;
  }
}

// ================= 搜索 =================
const query = reactive({ q: '' });

async function onSearch() {
  if (!query.q.trim()) {
    await loadRoots();
    return;
  }
  loading.value = true;
  try {
    searchMode.value = true;
    expandedKeys.value = [];
    tree.value = (await searchRegions(query.q.trim())).map((r) => ({
      ...r,
      children: undefined,
    }));
  } finally {
    loading.value = false;
  }
}

async function onReset() {
  query.q = '';
  await loadRoots();
}

// ================= 表格 =================
const { customRow, rowClassName } = useRowHighlight();

const LEVEL_LABELS: Record<number, string> = {
  10: '省',
  20: '市',
  30: '区县',
  40: '乡镇街道',
};

const columns: TableColumnType[] = [
  { title: '名称', dataIndex: 'name', ellipsis: true },
  { title: '代码', dataIndex: 'code', ellipsis: true },
  { title: '层级', dataIndex: 'level', width: 100 },
  { title: '状态', dataIndex: 'status', width: 90 },
];

onMounted(loadRoots);
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <!-- 筛选区：独立 Card，紧凑布局 -->
    <Card class="mb-3" size="small">
      <Form layout="inline" @submit.prevent>
        <FormItem label="名称/代码">
          <Input
            v-model:value="query.q"
            placeholder="如：杭州 / 3301"
            style="width: 220px"
            @press-enter="onSearch"
          />
        </FormItem>
        <FormItem>
          <Button type="primary" @click="onSearch">查询</Button>
        </FormItem>
        <FormItem>
          <Button @click="onReset">重置</Button>
        </FormItem>
      </Form>
    </Card>

    <!-- 数据区：Card 与 Table 均 size="small" 紧凑布局 -->
    <Card size="small">
      <Table
        :columns="columns"
        :custom-row="customRow"
        :data-source="tree"
        :loading="loading"
        :pagination="false"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        :expanded-row-keys="searchMode ? [] : expandedKeys"
        row-key="id"
        size="small"
        @expand="onExpand"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'level'">
            <Tag>{{ record.level_display || LEVEL_LABELS[record.level] || '—' }}</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="record.status === 10 ? 'green' : 'red'">
              {{ record.status === 10 ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'code'">
            {{ record.code || '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'name'">
            {{ record.name || '—' }}
          </template>
        </template>
      </Table>
    </Card>
  </Page>
</template>
