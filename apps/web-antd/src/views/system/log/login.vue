<script lang="ts" setup>
/** 登录日志：只读审计列表，无详情抽屉(字段少、无详情接口)。 */

import type { LoginLogItem } from '#/api/system/log';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Button, Card, Input, Table, Tag } from 'ant-design-vue';

import { getLoginLogs } from '#/api/system/log';

const loading = ref(false);
const list = ref<LoginLogItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, page_size: 20, username: '' });

async function loadList() {
  loading.value = true;
  try {
    const data = await getLoginLogs(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

/** 重置：清空全部筛选条件并回到第 1 页重新查询 */
function resetQuery() {
  query.username = '';
  query.page = 1;
  loadList();
}

/** 状态归类：10 成功，其余按 message 展示 */
function statusText(s: number) {
  return s === 10 ? '成功' : '失败';
}
function statusColor(s: number) {
  return s === 10 ? 'green' : 'red';
}

const columns = [
  { title: '时间', dataIndex: 'created_at', ellipsis: true },
  { title: '用户名', dataIndex: 'username', ellipsis: true },
  { title: '结果', dataIndex: 'status', ellipsis: true },
  { title: 'IP', dataIndex: 'ip', ellipsis: true },
  { title: '说明', dataIndex: 'message', ellipsis: true },
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
          placeholder="用户名"
          style="width: 160px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <Button @click="resetQuery">重置</Button>
      </div>
    </Card>

    <!-- 数据区：Card 与 Table 均 size="small" 紧凑布局 -->
    <Card size="small">
      <Table
        :columns="columns"
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
        row-key="id"
        :scroll="{ x: 'max-content' }"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="statusColor(record.status)">{{ statusText(record.status) }}</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'ip'">
            {{ record.ip ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'message'">
            {{ record.message ?? '—' }}
          </template>
        </template>
      </Table>
    </Card>
  </Page>
</template>
