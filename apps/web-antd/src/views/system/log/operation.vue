<script lang="ts" setup>
import type { OperationLogItem } from '#/api/system/log';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Button, Card, Descriptions, DescriptionsItem, Drawer, Input, Modal, Select, Table, Tag } from 'ant-design-vue';

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

// ================= 详情抽屉 =================
const detailVisible = ref(false);
const current = ref<OperationLogItem | null>(null);

function openDetail(row: OperationLogItem) {
  current.value = row;
  detailVisible.value = true;
}

const columns = [
  { title: '时间', dataIndex: 'created_at', width: 170 },
  { title: '操作人', dataIndex: 'username', width: 100 },
  { title: '模块', dataIndex: 'module', width: 80 },
  { title: '动作', dataIndex: 'action', width: 110 },
  { title: '对象', dataIndex: 'target_type', width: 100 },
  { title: '结果', dataIndex: 'status', width: 80 },
  { title: 'IP', dataIndex: 'ip', width: 130 },
  { title: '操作', key: 'actions', width: 80, fixed: 'right' },
];

onMounted(loadList);
</script>

<template>
  <Page title="操作日志" description="全部写操作审计轨迹（含失败记录）">
    <Card>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.username"
          allow-clear
          placeholder="操作人用户名"
          style="width: 160px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <Select
          v-model:value="query.module"
          allow-clear
          placeholder="模块"
          style="width: 120px"
          :options="moduleOptions"
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
        :scroll="{ x: 900 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="record.status === 10 ? 'green' : 'red'">
              {{ record.status === 10 ? '成功' : '失败' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button size="small" type="link" @click="openDetail(record)">详情</Button>
          </template>
        </template>
      </Table>
    </Card>

    <Drawer v-model:open="detailVisible" :width="520" title="操作日志详情">
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
