<script lang="ts" setup>
/** 操作日志：动作列为详情入口；纯只读审计，无操作按钮。 */

import type { OperationLogItem } from '#/api/system/log';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Input,
  Select,
  Table,
  Tag,
} from 'ant-design-vue';

import { getOperationLogs } from '#/api/system/log';

const loading = ref(false);
const list = ref<OperationLogItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, page_size: 20, username: '', module: undefined as string | undefined });

const moduleOptions = [
  { label: '用户', value: 'user' },
  { label: '部门', value: 'dept' },
  { label: '角色', value: 'role' },
  { label: '菜单', value: 'menu' },
];

async function loadList() {
  loading.value = true;
  try {
    const data = await getOperationLogs(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

/** 重置：清空全部筛选条件并回到第 1 页重新查询 */
function resetQuery() {
  query.username = '';
  query.module = undefined;
  query.page = 1;
  loadList();
}

// ================= 详情抽屉 =================
const detailVisible = ref(false);
const current = ref<OperationLogItem | null>(null);

// 行点击高亮：记录当前行 key
const activeRowKey = ref<number>();
const customRow = (record: any) => ({
  onClick: () => {
    activeRowKey.value = record.id;
  },
});
const rowClassName = (record: any) =>
  record.id === activeRowKey.value ? 'row-active' : '';

function openDetail(row: any) {
  activeRowKey.value = row.id; // 打开详情即高亮该行
  current.value = row;
  detailVisible.value = true;
}

const columns: TableColumnType[] = [
  { title: '动作', dataIndex: 'action' }, // 详情入口链接列：不加 ellipsis
  { title: '时间', dataIndex: 'created_at', ellipsis: true },
  { title: '操作人', dataIndex: 'username', ellipsis: true },
  { title: '模块', dataIndex: 'module', ellipsis: true },
  { title: '对象', dataIndex: 'target_type', ellipsis: true },
  { title: '结果', dataIndex: 'status', ellipsis: true },
  { title: 'IP', dataIndex: 'ip', ellipsis: true },
];

onMounted(loadList);
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <!-- 筛选区：独立 Card -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.username"
          allow-clear
          placeholder="操作人用户名"
          style="width: 160px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <Select
            show-search
          v-model:value="query.module"
          :options="moduleOptions"
          allow-clear
          placeholder="模块"
          style="width: 120px"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <Button @click="resetQuery">重置</Button>
      </div>
    </Card>

    <!-- 数据区：Card 与 Table 均 size="small" 紧凑布局 -->
    <Card size="small">
      <Table
        :columns="columns"
        :custom-row="customRow"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number) => { query.page = p; loadList(); },
          onShowSizeChange: (_c: number, s: number) => { query.page = 1; query.page_size = s; loadList(); },
        }"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'action'">
            <!-- 动作列即详情入口 -->
            <a @click="openDetail(record)">{{ record.action }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="record.status === 10 ? 'green' : 'red'">
              {{ record.status === 10 ? '成功' : '失败' }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'ip'">
            {{ record.ip ?? '—' }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 日志详情抽屉（只读） -->
    <Drawer v-model:open="detailVisible" title="操作日志详情" width="66%">
      <Descriptions v-if="current" :column="1" bordered size="small">
        <DescriptionsItem label="时间">{{ current.created_at }}</DescriptionsItem>
        <DescriptionsItem label="操作人">
          {{ current.username }}{{ current.user_name ? `（${current.user_name}）` : '' }}
        </DescriptionsItem>
        <DescriptionsItem label="模块 / 动作">
          {{ current.module }} / {{ current.action }}
        </DescriptionsItem>
        <DescriptionsItem label="对象">
          {{ current.target_type ?? '—' }} #{{ current.target_id ?? '—' }}
        </DescriptionsItem>
        <DescriptionsItem label="请求">{{ current.path }}</DescriptionsItem>
        <DescriptionsItem label="IP">{{ current.ip ?? '—' }}</DescriptionsItem>
        <DescriptionsItem label="结果">
          {{ current.status === 10 ? '成功' : '失败' }}
        </DescriptionsItem>
        <DescriptionsItem label="说明">{{ current.message ?? '—' }}</DescriptionsItem>
      </Descriptions>
    </Drawer>
  </Page>
</template>

<style scoped>
/* 行点击高亮：同时覆盖普通态与 hover 态（穿透 antd 内部样式） */
:deep(.ant-table-tbody > tr.row-active) > td,
:deep(.ant-table-tbody > tr.row-active) > td.ant-table-cell-row-hover {
  background-color: #e6f4ff;
}
</style>

