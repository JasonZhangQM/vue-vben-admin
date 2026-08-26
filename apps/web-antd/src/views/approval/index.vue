<script lang="ts" setup>
/** 审批中心：待我审批 / 我的申请，审批通过后 executor 自动生效。 */

import type {
  ApprovalInstanceDetail,
  ApprovalInstanceItem,
} from '#/api/basic/approval';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Drawer,
  message,
  Modal,
  Space,
  Table,
  Tabs,
  TabPane,
  Tag,
  Textarea,
  Timeline,
  TimelineItem,
} from 'ant-design-vue';

import {
  actTask,
  getInstanceDetail,
  getMySubmitted,
  getMyTasks,
  withdrawInstance,
} from '#/api/basic/approval';

// 实例状态（与后端 approval/enums.py 对齐）
const STATUS_COLOR: Record<number, string> = {
  10: 'processing',
  20: 'success',
  30: 'error',
  40: 'default',
};
// 任务状态（轨迹展示）
const TASK_STATUS_COLOR: Record<number, string> = {
  10: 'processing',
  20: 'success',
  30: 'error',
  40: 'default',
  50: 'default',
};

// ================= 待我审批 =================
const tasksLoading = ref(false);
const tasksList = ref<ApprovalInstanceItem[]>([]);
const tasksTotal = ref(0);
const tasksQuery = reactive({ page: 1, page_size: 20 });

async function loadTasks() {
  tasksLoading.value = true;
  try {
    const data = await getMyTasks(tasksQuery);
    tasksList.value = data.items;
    tasksTotal.value = data.total;
  } finally {
    tasksLoading.value = false;
  }
}

// ================= 我的申请 =================
const mineLoading = ref(false);
const mineList = ref<ApprovalInstanceItem[]>([]);
const mineTotal = ref(0);
const mineQuery = reactive({ page: 1, page_size: 20 });

async function loadMine() {
  mineLoading.value = true;
  try {
    const data = await getMySubmitted(mineQuery);
    mineList.value = data.items;
    mineTotal.value = data.total;
  } finally {
    mineLoading.value = false;
  }
}

// ================= 审批动作（同意 / 驳回） =================
const actVisible = ref(false);
const actLoading = ref(false);
const actTarget = ref<ApprovalInstanceItem | null>(null);
const actAction = ref(10); // 10 同意 / 20 驳回
const actOpinion = ref('');

function openAct(record: any, action: number) {
  actTarget.value = record;
  actAction.value = action;
  actOpinion.value = '';
  actVisible.value = true;
}

async function submitAct() {
  if (!actTarget.value?.current_task_id) return;
  if (actAction.value === 20 && !actOpinion.value.trim()) {
    message.warning('驳回必须填写审批意见');
    return;
  }
  actLoading.value = true;
  try {
    await actTask(actTarget.value.current_task_id, actAction.value, actOpinion.value || undefined);
    message.success(actAction.value === 10 ? '已同意' : '已驳回');
    actVisible.value = false;
    await loadTasks();
  } finally {
    actLoading.value = false;
  }
}

// ================= 撤回 =================
async function onWithdraw(record: any) {
  await withdrawInstance(record.id);
  message.success('申请已撤回');
  await loadMine();
}

// ================= 实例详情 =================
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<ApprovalInstanceDetail | null>(null);

/** payload 分字段展示（创建草稿 / 修改 diff / 移交 ID 列表） */
const payloadEntries = ref<{ key: string; value: string }[]>([]);

function renderPayload(payload: Record<string, any>) {
  payloadEntries.value = Object.entries(payload ?? {}).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'),
  }));
}

async function openDetail(record: any) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getInstanceDetail(record.id);
    renderPayload(detail.value.payload);
  } finally {
    detailLoading.value = false;
  }
}

const baseColumns: TableColumnType[] = [
  { title: '审批单号', dataIndex: 'id', width: 90 },
  { title: '流程', dataIndex: 'flow_name', width: 130 },
  { title: '摘要', dataIndex: 'summary', ellipsis: true },
  { title: '提交人', dataIndex: 'submitted_by_name', width: 100 },
  { title: '提交时间', dataIndex: 'submitted_at', width: 170 },
];

const taskColumns: TableColumnType[] = [
  ...baseColumns,
  { title: '当前节点', dataIndex: 'current_step', width: 90 },
  { title: '状态', dataIndex: 'status_display', width: 90 },
  { title: '操作', key: 'actions', width: 210, fixed: 'right' },
];

const mineColumns: TableColumnType[] = [
  ...baseColumns,
  { title: '状态', dataIndex: 'status_display', width: 90 },
  { title: '完成时间', dataIndex: 'finished_at', width: 170 },
  { title: '操作', key: 'actions', width: 170, fixed: 'right' },
];

onMounted(() => {
  loadTasks();
  loadMine();
});
</script>

<template>
  <Page title="审批中心" description="客户创建 / 敏感修改 / 批量移交易等审批流转">
    <Card>
      <Tabs>
        <!-- 待我审批 -->
        <TabPane key="tasks" :tab="`待我审批（${tasksTotal}）`">
          <Table
            :columns="taskColumns"
            :data-source="tasksList"
            :loading="tasksLoading"
            :pagination="{
              current: tasksQuery.page,
              pageSize: tasksQuery.page_size,
              total: tasksTotal,
              showTotal: (t: number) => `共 ${t} 条`,
              onChange: (p: number) => { tasksQuery.page = p; loadTasks(); },
            }"
            :scroll="{ x: 1100 }"
            row-key="id"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'status'">
                <Tag :color="STATUS_COLOR[record.status]">{{ record.status_display }}</Tag>
              </template>
              <template v-else-if="column.key === 'actions'">
                <Space :size="4">
                  <Button size="small" type="primary" @click="openAct(record, 10)">同意</Button>
                  <Button danger size="small" @click="openAct(record, 20)">驳回</Button>
                  <Button size="small" type="link" @click="openDetail(record)">详情</Button>
                </Space>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 我的申请 -->
        <TabPane key="mine" :tab="`我的申请（${mineTotal}）`">
          <Table
            :columns="mineColumns"
            :data-source="mineList"
            :loading="mineLoading"
            :pagination="{
              current: mineQuery.page,
              pageSize: mineQuery.page_size,
              total: mineTotal,
              showTotal: (t: number) => `共 ${t} 条`,
              onChange: (p: number) => { mineQuery.page = p; loadMine(); },
            }"
            :scroll="{ x: 1100 }"
            row-key="id"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'status'">
                <Tag :color="STATUS_COLOR[record.status]">{{ record.status_display }}</Tag>
              </template>
              <template v-else-if="column.dataIndex === 'finished_at'">
                {{ record.finished_at ?? '—' }}
              </template>
              <template v-else-if="column.key === 'actions'">
                <Space :size="4">
                  <Button size="small" type="link" @click="openDetail(record)">详情</Button>
                  <Button
                    v-if="record.status === 10"
                    danger
                    size="small"
                    type="link"
                    @click="onWithdraw(record)"
                  >
                    撤回
                  </Button>
                </Space>
              </template>
            </template>
          </Table>
        </TabPane>
      </Tabs>
    </Card>

    <!-- 审批动作弹窗 -->
    <Modal
      v-model:open="actVisible"
      :confirm-loading="actLoading"
      :ok-button-props="{ danger: actAction === 20 }"
      :ok-text="actAction === 10 ? '确认同意' : '确认驳回'"
      :title="`${actAction === 10 ? '同意' : '驳回'}审批单 #${actTarget?.id ?? ''}`"
      @ok="submitAct"
    >
      <div class="mb-2 text-sm text-gray-500">{{ actTarget?.summary }}</div>
      <Textarea
        v-model:value="actOpinion"
        :placeholder="actAction === 20 ? '驳回意见（必填）' : '审批意见（可空）'"
        :rows="3"
      />
    </Modal>

    <!-- 实例详情 -->
    <Drawer
      v-model:open="detailVisible"
      :title="`审批单 #${detail?.id ?? ''} · ${detail?.flow_name ?? ''}`"
      width="640"
    >
      <div v-if="detail" class="space-y-4">
        <Card size="small" title="基本信息">
          <Descriptions :column="2" size="small">
            <DescriptionsItem label="流程">{{ detail.flow_name }}</DescriptionsItem>
            <DescriptionsItem label="状态">
              <Tag :color="STATUS_COLOR[detail.status]">{{ detail.status_display }}</Tag>
            </DescriptionsItem>
            <DescriptionsItem label="提交人">{{ detail.submitted_by_name }}</DescriptionsItem>
            <DescriptionsItem label="提交时间">{{ detail.submitted_at }}</DescriptionsItem>
            <DescriptionsItem label="完成时间">{{ detail.finished_at ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="当前节点">第 {{ detail.current_step }} 步</DescriptionsItem>
            <DescriptionsItem label="摘要" :span="2">{{ detail.summary }}</DescriptionsItem>
          </Descriptions>
        </Card>

        <Card size="small" title="申请内容">
          <Descriptions :column="1" size="small">
            <DescriptionsItem
              v-for="entry in payloadEntries"
              :key="entry.key"
              :label="entry.key"
            >
              {{ entry.value }}
            </DescriptionsItem>
          </Descriptions>
        </Card>

        <Card size="small" title="审批轨迹">
          <Timeline v-if="detail.tasks.length">
            <TimelineItem
              v-for="task in detail.tasks"
              :key="task.id"
              :color="TASK_STATUS_COLOR[task.status]"
            >
              <div class="text-sm">
                <span class="font-medium">{{ task.node_name }}</span>
                <span class="ml-2 text-gray-500">{{ task.approver_name }}</span>
                <Tag class="ml-2" :color="TASK_STATUS_COLOR[task.status]">
                  {{ task.status_display }}
                </Tag>
              </div>
              <div v-if="task.opinion" class="text-xs text-gray-500">意见：{{ task.opinion }}</div>
              <div v-if="task.acted_at" class="text-xs text-gray-400">{{ task.acted_at }}</div>
            </TimelineItem>
          </Timeline>
          <div v-else class="text-sm text-gray-400">暂无任务</div>
        </Card>
      </div>
    </Drawer>
  </Page>
</template>
