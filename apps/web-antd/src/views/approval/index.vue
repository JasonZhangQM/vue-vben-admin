<script lang="ts" setup>
/** 审批中心：待我审批 / 我的申请；摘要列为详情入口，审批动作收纳在详情抽屉内。 */

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
  Popconfirm,
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
import { useDetailColumns } from '#/composables/useDetailColumns';
import { useRowHighlight } from '#/composables/useRowHighlight';

// 实例状态(与后端 approval/enums.py 对齐)
const STATUS_COLOR: Record<number, string> = {
  10: 'processing',
  20: 'success',
  30: 'error',
  40: 'default',
};
// 任务状态(轨迹展示)
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

// ================= 行点击高亮(各 Tab 独立记录) =================
const {
  customRow: tasksCustomRow,
  rowClassName: tasksRowClassName,
  highlight: highlightTasks,
} = useRowHighlight();

const {
  customRow: mineCustomRow,
  rowClassName: mineRowClassName,
  highlight: highlightMine,
} = useRowHighlight();

// 详情基本信息响应式列数(视口越宽列越多)
const { columns: detailColumns } = useDetailColumns();

// ================= 实例详情(摘要列链接 = 唯一入口) =================
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<ApprovalInstanceDetail | null>(null);
// 当前行的待办任务 ID(仅待我审批列表返回，供抽屉内审批动作使用)
const currentTaskId = ref<null | number>(null);

/** payload 分字段展示(创建草稿 / 修改 diff / 移交 ID 列表) */
const payloadEntries = ref<{ key: string; value: string }[]>([]);

function renderPayload(payload: Record<string, any>) {
  payloadEntries.value = Object.entries(payload ?? {}).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—'),
  }));
}

async function loadDetail(id: number) {
  detailLoading.value = true;
  try {
    detail.value = await getInstanceDetail(id);
    renderPayload(detail.value.payload);
  } catch {
    // 详情拉取失败：自动关闭抽屉 + 错误提示，避免页面挂死
    detailVisible.value = false;
    detail.value = null;
    message.error('审批详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

function openDetail(record: any, fromTasks: boolean) {
  if (fromTasks) highlightTasks(record);
  else highlightMine(record);
  currentTaskId.value = record.current_task_id ?? null;
  detailVisible.value = true;
  detail.value = null;
  loadDetail(record.id);
}

// ================= 审批动作(同意 / 驳回，收纳在详情抽屉) =================
const actVisible = ref(false);
const actLoading = ref(false);
const actAction = ref(10); // 10 同意 / 20 驳回
const actOpinion = ref('');

function openAct(action: number) {
  actAction.value = action;
  actOpinion.value = '';
  actVisible.value = true;
}

async function submitAct() {
  if (!currentTaskId.value) return;
  if (actAction.value === 20 && !actOpinion.value.trim()) {
    message.warning('驳回必须填写审批意见');
    return;
  }
  actLoading.value = true;
  try {
    await actTask(currentTaskId.value, actAction.value, actOpinion.value || undefined);
    message.success(actAction.value === 10 ? '已同意' : '已驳回');
    actVisible.value = false;
    detailVisible.value = false;
    await loadTasks();
  } finally {
    actLoading.value = false;
  }
}

// ================= 撤回(收纳在详情抽屉) =================
async function onWithdraw() {
  if (!detail.value) return;
  await withdrawInstance(detail.value.id);
  message.success('申请已撤回');
  detailVisible.value = false;
  await loadMine();
}

const baseColumns: TableColumnType[] = [
  // 审批单号属业务单号列，保留展示
  { title: '审批单号', dataIndex: 'id', ellipsis: true },
  { title: '流程', dataIndex: 'flow_name', ellipsis: true },
  { title: '摘要', dataIndex: 'summary' }, // 详情入口链接列：不加 ellipsis
  { title: '提交人', dataIndex: 'submitted_by_name', ellipsis: true },
  { title: '提交时间', dataIndex: 'submitted_at', ellipsis: true },
];

const taskColumns: TableColumnType[] = [
  ...baseColumns,
  { title: '当前节点', dataIndex: 'current_step', ellipsis: true },
  { title: '状态', dataIndex: 'status_display', ellipsis: true },
];

const mineColumns: TableColumnType[] = [
  ...baseColumns,
  { title: '状态', dataIndex: 'status_display', ellipsis: true },
  { title: '完成时间', dataIndex: 'finished_at', ellipsis: true },
];

onMounted(() => {
  loadTasks();
  loadMine();
});
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <Card size="small">
      <Tabs>
        <!-- 待我审批 -->
        <TabPane key="tasks" :tab="`待我审批(${tasksTotal})`">
          <Table
            :columns="taskColumns"
            :custom-row="tasksCustomRow"
            :data-source="tasksList"
            :loading="tasksLoading"
            :pagination="{
              current: tasksQuery.page,
              pageSize: tasksQuery.page_size,
              total: tasksTotal,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (t: number) => `共 ${t} 条`,
              onChange: (p: number) => { tasksQuery.page = p; loadTasks(); },
              onShowSizeChange: (_c: number, s: number) => { tasksQuery.page = 1; tasksQuery.page_size = s; loadTasks(); },
            }"
            :row-class-name="tasksRowClassName"
            :scroll="{ x: 'max-content' }"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'summary'">
                <!-- 摘要列即详情入口 -->
                <a @click="openDetail(record, true)">{{ record.summary }}</a>
              </template>
              <template v-else-if="column.dataIndex === 'status'">
                <Tag :color="STATUS_COLOR[record.status]">{{ record.status_display }}</Tag>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 我的申请 -->
        <TabPane key="mine" :tab="`我的申请(${mineTotal})`">
          <Table
            :columns="mineColumns"
            :custom-row="mineCustomRow"
            :data-source="mineList"
            :loading="mineLoading"
            :pagination="{
              current: mineQuery.page,
              pageSize: mineQuery.page_size,
              total: mineTotal,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (t: number) => `共 ${t} 条`,
              onChange: (p: number) => { mineQuery.page = p; loadMine(); },
              onShowSizeChange: (_c: number, s: number) => { mineQuery.page = 1; mineQuery.page_size = s; loadMine(); },
            }"
            :row-class-name="mineRowClassName"
            :scroll="{ x: 'max-content' }"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'summary'">
                <a @click="openDetail(record, false)">{{ record.summary }}</a>
              </template>
              <template v-else-if="column.dataIndex === 'status'">
                <Tag :color="STATUS_COLOR[record.status]">{{ record.status_display }}</Tag>
              </template>
              <template v-else-if="column.dataIndex === 'finished_at'">
                {{ record.finished_at ?? '—' }}
              </template>
            </template>
          </Table>
        </TabPane>
      </Tabs>
    </Card>

    <!-- 审批动作弹窗(由详情抽屉触发) -->
    <Modal
      v-model:open="actVisible"
      :confirm-loading="actLoading"
      :ok-button-props="{ danger: actAction === 20 }"
      :ok-text="actAction === 10 ? '确认同意' : '确认驳回'"
      :title="`${actAction === 10 ? '同意' : '驳回'}审批单 #${detail?.id ?? ''}`"
      @ok="submitAct"
    >
      <div class="mb-2 text-sm text-gray-500">{{ detail?.summary }}</div>
      <Textarea
        v-model:value="actOpinion"
        :placeholder="actAction === 20 ? '驳回意见(必填)' : '审批意见(可空)'"
        :rows="3"
      />
    </Modal>

    <!-- 实例详情抽屉：审批动作收纳在 #extra -->
    <Drawer
      v-model:open="detailVisible"
      :title="`审批单 #${detail?.id ?? ''} · ${detail?.flow_name ?? ''}`"
      width="66%"
    >
      <div v-if="detail" class="space-y-4">
        <Card size="small" title="基本信息">
          <template #extra>
            <div class="flex gap-2">
              <!-- 待我审批来源且有当前任务：同意 / 驳回 -->
              <template v-if="currentTaskId">
                <Button size="small" type="primary" @click="openAct(10)">同意</Button>
                <Button danger size="small" @click="openAct(20)">驳回</Button>
              </template>
              <!-- 本人提交且 pending：撤回 -->
              <Popconfirm
                v-if="detail.status === 10 && !currentTaskId"
                title="确认撤回该申请？"
                @confirm="onWithdraw"
              >
                <Button danger size="small">撤回</Button>
              </Popconfirm>
            </div>
          </template>
          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="流程">{{ detail.flow_name }}</DescriptionsItem>
            <DescriptionsItem label="状态">
              <Tag :color="STATUS_COLOR[detail.status]">{{ detail.status_display }}</Tag>
            </DescriptionsItem>
            <DescriptionsItem label="提交人">{{ detail.submitted_by_name }}</DescriptionsItem>
            <DescriptionsItem label="提交时间">{{ detail.submitted_at }}</DescriptionsItem>
            <DescriptionsItem label="完成时间">{{ detail.finished_at ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="当前节点">第 {{ detail.current_step }} 步</DescriptionsItem>
            <DescriptionsItem label="摘要" :span="detailColumns">{{ detail.summary }}</DescriptionsItem>
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
