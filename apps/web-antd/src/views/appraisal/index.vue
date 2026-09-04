<script lang="ts" setup>
import type { AppraisalListItem } from '#/api/basic/appraisal';
import type { TableColumnType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  FormItem,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useRowHighlight } from '#/composables/useRowHighlight';
import { dash } from '#/utils/format';

import {
  arrangeAppraisalArticles,
  createAppraisal,
  deleteAppraisal,
  finishAppraisal,
  getAppraisalArticles,
  getAppraisalList,
  removeAppraisalArticle,
  type AppraisalArticleItem,
} from '#/api/basic/appraisal';
import { getArticleList } from '#/api/basic/article';
import { getAppraisalDict, getEmployeeDict } from '#/api/basic/dict';

// ============ 字典 ============
const meetingStateOpts = ref<{ label: string; value: number }[]>([]);
const reviewModelOpts = ref<{ label: string; value: number }[]>([]);
const compereOptions = ref<{ label: string; value: number }[]>([]);
const articleOptions = ref<{ label: string; value: number }[]>([]);

onMounted(async () => {
  const dict = await getAppraisalDict();
  meetingStateOpts.value = dict.meeting_state;
  reviewModelOpts.value = dict.review_model;
  const emps = await getEmployeeDict();
  compereOptions.value = emps.map((u) => ({ label: u.name, value: u.id }));
  // 项目下拉：取全部项目的 id/编号/客户
  const artsPage = await getArticleList({ page: 1, page_size: 500 });
  articleOptions.value = (artsPage.items ?? []).map((a: { id: number; article_num: string; customer_name?: string | null }) => ({
    label: `${a.article_num} | ${a.customer_name || ''}`,
    value: a.id,
  }));
});

// ============ 列表 ============
const { rowClassName, customRow } = useRowHighlight();
const list = ref<AppraisalListItem[]>([]);
const total = ref(0);
const loading = ref(false);

// warrant 模式：query 里 undefined 字段后端忽略
const query = reactive({
  page: 1,
  page_size: 20,
  year: undefined as number | undefined,
  review_model: undefined as number | undefined,
  meeting_state: undefined as number | undefined,
});

async function loadList() {
  loading.value = true;
  try {
    const data = await getAppraisalList(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function onQuery() { query.page = 1; loadList(); }
function onReset() {
  query.year = undefined;
  query.review_model = undefined;
  query.meeting_state = undefined;
  query.page = 1;
  loadList();
}

const columns = computed<TableColumnType[]>(() => [
  { title: '会议编号', dataIndex: 'num', width: 140 },
  { title: '状态', dataIndex: 'meeting_state', width: 100 },
  { title: '评审形式', dataIndex: 'review_model', width: 100 },
  { title: '评审日期', dataIndex: 'review_date', width: 120 },
  { title: '主持人', dataIndex: 'compere_name', width: 120 },
  { title: '参评项目数', dataIndex: 'articles_count', width: 100, align: 'right' },
  { title: '创建时间', dataIndex: 'created_at', width: 170 },
  { title: '创建人', dataIndex: 'created_by_name', width: 100, fixed: 'right' },
]);

// ============ 创建 ============
const createOpen = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  review_model: undefined as number | undefined,
  review_date: undefined as string | undefined,
  compere_id: undefined as number | undefined,
  article_ids: [] as number[],
});

function openCreate() {
  Object.assign(createForm, {
    review_model: undefined,
    review_date: undefined,
    compere_id: undefined,
    article_ids: [],
  });
  createOpen.value = true;
}

async function onCreate() {
  if (!createForm.review_model || !createForm.review_date || !createForm.compere_id) {
    message.warning('评审形式、日期、主持人为必填');
    return;
  }
  createLoading.value = true;
  try {
    await createAppraisal(createForm);
    message.success('创建成功');
    createOpen.value = false;
    loadList();
  } catch { /* requestClient 已 toast */ }
  finally { createLoading.value = false; }
}

// ============ 会议完成 ============
async function onFinish(row: AppraisalListItem) {
  Modal.confirm({
    title: `确认完成评审会 ${row.num}？`,
    content: '完成后参评项目将自动置为"已上会"状态，不可取消。',
    okText: '确认完成',
    okType: 'primary',
    async onOk() {
      await finishAppraisal(row.id);
      message.success('会议已完成');
      loadList();
    },
  });
}

async function onDelete(row: AppraisalListItem) {
  await deleteAppraisal(row.id);
  message.success('已删除');
  loadList();
}

// ============ 安排项目 Modal ============
const arrangeOpen = ref(false);
const arrangeLoading = ref(false);
const arrangeSaving = ref(false);
const currentAppraisal = ref<AppraisalListItem | null>(null);
const arrangeItems = ref<AppraisalArticleItem[]>([]);
// 待添加的项目 ID 列表（多选）
const pendingAddIds = ref<number[]>([]);

async function openArrange(row: AppraisalListItem) {
  currentAppraisal.value = row;
  arrangeOpen.value = true;
  pendingAddIds.value = [];
  await loadArrangeItems();
}

async function loadArrangeItems() {
  if (!currentAppraisal.value) return;
  arrangeLoading.value = true;
  try {
    arrangeItems.value = await getAppraisalArticles(currentAppraisal.value.id);
  } finally {
    arrangeLoading.value = false;
  }
}

// 已排入项目的 article_id 集合，用于 Select 过滤
const arrangedIds = computed(() => new Set(arrangeItems.value.map((i) => i.article_id)));

async function onAddArticles() {
  if (!currentAppraisal.value || pendingAddIds.value.length === 0) {
    message.warning('请选择要排入的项目');
    return;
  }
  arrangeSaving.value = true;
  try {
    await arrangeAppraisalArticles(currentAppraisal.value.id, pendingAddIds.value);
    message.success('已排入');
    pendingAddIds.value = [];
    await loadArrangeItems();
    loadList(); // 刷新参评项目数
  } finally {
    arrangeSaving.value = false;
  }
}

async function onRemoveArticle(articleId: number) {
  if (!currentAppraisal.value) return;
  await removeAppraisalArticle(currentAppraisal.value.id, articleId);
  message.success('已移除');
  await loadArrangeItems();
  loadList();
}

onMounted(loadList);
</script>

<template>
  <Page>
    <!-- 筛选卡 -->
    <Card size="small" class="mb-3">
      <Form layout="inline" :model="query" class="flex-wrap gap-y-2">
        <FormItem label="年份">
          <InputNumber
            v-model:value="query.year"
            placeholder="如 2026"
            :min="2000"
            :max="2100"
            style="width: 120px"
          />
        </FormItem>
        <FormItem label="评审形式">
          <SearchSelect
            v-model:value="query.review_model"
            :options="reviewModelOpts"
            placeholder="全部"
            allow-clear
            style="width: 160px"
          />
        </FormItem>
        <FormItem label="状态">
          <SearchSelect
            v-model:value="query.meeting_state"
            :options="meetingStateOpts"
            placeholder="全部"
            allow-clear
            style="width: 140px"
          />
        </FormItem>
        <FormItem>
          <Space>
            <Button type="primary" @click="onQuery">查询</Button>
            <Button @click="onReset">重置</Button>
          </Space>
        </FormItem>
      </Form>
    </Card>

    <!-- 表格 -->
    <Card size="small">
      <template #extra>
        <Space>
          <AccessControl :codes="['appraisal:create']" type="code">
            <Button type="primary" @click="openCreate">新建评审会</Button>
          </AccessControl>
        </Space>
      </template>

      <Table
        size="small"
        row-key="id"
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number, ps: number) => {
            query.page = p;
            query.page_size = ps;
            loadList();
          },
        }"
        :custom-row="customRow"
        :row-class-name="rowClassName"
        :scroll="{ x: 1100 }"
      >
        <template #bodyCell="{ column, record }">
          <!-- 状态标签 -->
          <template v-if="column.dataIndex === 'meeting_state'">
            <Tag :color="(record as AppraisalListItem).meeting_state === 10 ? 'orange' : 'green'">
              {{ (record as AppraisalListItem).meeting_state_display || '-' }}
            </Tag>
          </template>
          <!-- 评审形式 -->
          <template v-else-if="column.dataIndex === 'review_model'">
            {{ dash(reviewModelOpts.find((o) => o.value === (record as AppraisalListItem).review_model)?.label) }}
          </template>
          <!-- 需要 dash 兜底的文本列 -->
          <template v-else-if="['review_date','compere_name','created_at','created_by_name'].includes(column.dataIndex as string)">
            {{ dash((record as AppraisalListItem)[column.dataIndex as keyof AppraisalListItem] as string) }}
          </template>
          <!-- 操作列（固定在右） -->
          <template v-else-if="column.key === 'action'">
            <Space>
              <AccessControl :codes="['appraisal:update']" type="code">
                <Button size="small" @click="openArrange(record as AppraisalListItem)">安排项目</Button>
              </AccessControl>
              <AccessControl :codes="['appraisal:finish']" type="code">
                <Button
                  size="small"
                  type="primary"
                  :disabled="(record as AppraisalListItem).meeting_state !== 10"
                  @click="onFinish(record as AppraisalListItem)"
                >
                  完成会议
                </Button>
              </AccessControl>
              <AccessControl :codes="['appraisal:delete']" type="code">
                <Popconfirm title="确认删除？" ok-text="删除" cancel-text="取消" @confirm="onDelete(record as AppraisalListItem)">
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
        </template>

        <!-- 操作列定义 -->
        <Table.Column key="action" title="操作" width="220" fixed="right" />
      </Table>
    </Card>

    <!-- 创建 Drawer -->
    <Drawer v-model:open="createOpen" title="新建评审会" width="66%" :destroy-on-close="true">
      <Form
        :label-col="{ span: 8 }"
        :wrapper-col="{ span: 16 }"
        :model="createForm"
        class="grid grid-cols-2 gap-x-6"
      >
        <FormItem label="评审形式" required>
          <SearchSelect
            v-model:value="createForm.review_model"
            :options="reviewModelOpts"
            placeholder="选择"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="评审日期" required>
          <DatePicker
            v-model:value="createForm.review_date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="主持人" required>
          <SearchSelect
            v-model:value="createForm.compere_id"
            placeholder="输入名字搜索"
            style="width: 100%"
            :options="compereOptions"
          />
        </FormItem>
        <FormItem label="参评项目" class="col-span-2">
          <Select
            v-model:value="createForm.article_ids"
            mode="multiple"
            :options="articleOptions"
            placeholder="搜索并选择项目（可后续在安排页添加）"
            :max-tag-count="6"
            allow-clear
            show-search
            style="width: 100%"
          />
        </FormItem>
      </Form>

      <template #extra>
        <Space>
          <Button @click="createOpen = false">取消</Button>
          <Button type="primary" :loading="createLoading" @click="onCreate">确定</Button>
        </Space>
      </template>
    </Drawer>

    <!-- 安排项目 Modal -->
    <Modal
      v-model:open="arrangeOpen"
      :title="currentAppraisal ? `安排项目 · ${currentAppraisal.num}` : '安排项目'"
      :footer="null"
      width="760px"
      :destroy-on-close="true"
    >
      <!-- 已排入项目列表 -->
      <div class="mb-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="font-medium">已安排 {{ arrangeItems.length }} 个项目</span>
          <Tag color="blue">评审中</Tag>
        </div>
        <Table
          size="small"
          :data-source="arrangeItems"
          :loading="arrangeLoading"
          :pagination="false"
          :scroll="{ y: 260 }"
          row-key="article_id"
        >
          <Table.Column title="项目编号" dataIndex="article_num" width="160" />
          <Table.Column title="客户" dataIndex="customer_name" width="160">
            <template #default="{ record }">{{ dash(record.customer_name) }}</template>
          </Table.Column>
          <Table.Column title="产品" dataIndex="product_name" width="120">
            <template #default="{ record }">{{ dash(record.product_name) }}</template>
          </Table.Column>
          <Table.Column title="授信额" dataIndex="balance" width="110" align="right">
            <template #default="{ record }">{{ record.balance != null ? `${record.balance} 万` : '-' }}</template>
          </Table.Column>
          <Table.Column title="操作" width="80" fixed="right">
            <template #default="{ record }">
              <Popconfirm title="确认移出？" ok-text="移出" cancel-text="取消" @confirm="onRemoveArticle(record.article_id)">
                <Button size="small" type="link" danger>移出</Button>
              </Popconfirm>
            </template>
          </Table.Column>
          <template #emptyText>
            <div class="py-4 text-gray-400">尚未安排项目，请在下方选择添加</div>
          </template>
        </Table>
      </div>

      <!-- 新增区域 -->
      <div class="border-t pt-3">
        <div class="mb-2 font-medium">添加项目</div>
        <div class="flex gap-2">
          <Select
            v-model:value="pendingAddIds"
            mode="multiple"
            :options="articleOptions.filter((o) => !arrangedIds.has(o.value))"
            placeholder="搜索项目编号或客户"
            :max-tag-count="8"
            show-search
            allow-clear
            style="flex: 1"
          />
          <Button type="primary" :loading="arrangeSaving" @click="onAddArticles">排入</Button>
        </div>
        <div class="mt-1 text-xs text-gray-400">已出现在上表的项目会自动过滤，不可重复添加</div>
      </div>
    </Modal>
  </Page>
</template>
