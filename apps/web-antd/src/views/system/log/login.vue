<script lang="ts" setup>
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

/** 状态归类：10 成功，其余按 message 展示 */
function statusText(s: number) {
  return s === 10 ? '成功' : '失败';
}
function statusColor(s: number) {
  return s === 10 ? 'green' : 'red';
}

const columns = [
  { title: '时间', dataIndex: 'created_at', width: 180 },
  { title: '用户名', dataIndex: 'username', width: 120 },
  { title: '结果', dataIndex: 'status', width: 80 },
  { title: 'IP', dataIndex: 'ip', width: 140 },
  { title: '说明', dataIndex: 'message', ellipsis: true },
];

onMounted(loadList);
</script>

<template>
  <Page title="登录日志" description="登录成功 / 失败 / 锁定全量记录">
    <Card>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.username"
          allow-clear
          placeholder="用户名"
          style="width: 160px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
      </div>

      <Table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number) => { query.page = p; loadList(); },
        }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="statusColor(record.status)">{{ statusText(record.status) }}</Tag>
          </template>
        </template>
      </Table>
    </Card>
  </Page>
</template>
