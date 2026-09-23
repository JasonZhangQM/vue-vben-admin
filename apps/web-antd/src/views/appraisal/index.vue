<script lang="ts" setup>
import type { AppraisalDetail, AppraisalListItem } from '#/api/basic/appraisal';
import type { ArticleCommentItem } from '#/api/basic/article';
import type { TableColumnType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Form,
  FormItem,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { useRowHighlight } from '#/composables/useRowHighlight';
import ArticleDetailDrawer from '#/views/article/detail-drawer.vue';
import { drawerWidth } from '#/utils/drawer';
import { dash } from '#/utils/format';

import {
  arrangeAppraisalArticles,
  batchUpsertComments,
  createAppraisal,
  deleteAppraisal,
  finishAppraisal,
  getAppraisal,
  getAppraisalArticles,
  getAppraisalList,
  getExpertList,
  removeAppraisalArticle,
  type AppraisalArticleItem,
} from '#/api/basic/appraisal';
import { getArticleComments, getArticleDictList } from '#/api/basic/article';
import { getAppraisalDict } from '#/api/basic/dict';

// ============ 字典 ============
const meetingStateOpts = ref<{ label: string; value: number }[]>([]);
const reviewModelOpts = ref<{ label: string; value: number }[]>([]);
const compereOptions = ref<{ label: string; value: number }[]>([]);
const articleOptions = ref<{ label: string; value: number }[]>([]);

onMounted(async () => {
  const dict = await getAppraisalDict();
  meetingStateOpts.value = dict.meeting_state;
  reviewModelOpts.value = dict.review_model;
  // 主持人下拉：启用状态的评审委员（按 sort 排序）
  const expertsPage = await getExpertList({ page: 1, page_size: 500, status: true });
  compereOptions.value = (expertsPage.items ?? []).map((e) => ({ label: e.name, value: e.id }));
  // 项目下拉：走无 data_scope 的字典接口
  const artsPage = await getArticleDictList({ page: 1, page_size: 500 });
  articleOptions.value = (artsPage.items ?? []).map((a: { id: number; article_num: string; customer_name?: string | null }) => ({
    label: `${a.article_num} | ${a.customer_name || ''}`,
    value: a.id,
  }));
});

// ============ 详情基本信息响应式列数 ============
const { columns: detailColumns } = useDetailColumns();

// ============ 列表 ============
const { rowClassName, customRow, highlight: highlightRow } = useRowHighlight();

// 评审安排 Modal 内子表独立高亮
const { customRow: arrangeCustomRow, rowClassName: arrangeRowClassName } = useRowHighlight();
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
  { title: '会议编号', dataIndex: 'num', width: 180 },
  { title: '评审形式', dataIndex: 'review_model', width: 100 },
  { title: '评审日期', dataIndex: 'review_date', width: 120 },
  { title: '主持人', dataIndex: 'compere_name', width: 120 },
  { title: '参评项目数', dataIndex: 'articles_count', width: 100, align: 'right' },
  { title: '创建人', dataIndex: 'created_by_name', width: 100 },
  { title: '状态', dataIndex: 'meeting_state', width: 100, fixed: 'right' },
]);

// ============ 详情 Drawer ============
const detailOpen = ref(false);
const detailId = ref<number | null>(null);
const detail = ref<AppraisalDetail | null>(null);
const detailLoading = ref(false);

// 嵌套的项目详情抽屉（从参评项目 Tab 点击项目编号打开）
const articleDrawerOpen = ref(false);
const articleDrawerId = ref<number | null>(null);
// 项目详情抽屉通过 @deep-open 上报的后代层数（其客户/权证详情算 1 层，权证再嵌客户算 2 层）
const articleDeep = ref(0);

async function openDetail(row: AppraisalListItem) {
  highlightRow(row);
  detailId.value = row.id;
  detailOpen.value = true;
}

async function loadDetail() {
  if (!detailId.value) return;
  detailLoading.value = true;
  try {
    detail.value = await getAppraisal(detailId.value);
  } finally {
    detailLoading.value = false;
  }
}

watch(detailOpen, (v) => {
  if (v) loadDetail();
  else {
    detail.value = null;
    // 父 Drawer 关闭时同步重置嵌套的项目详情抽屉
    articleDrawerOpen.value = false;
    articleDrawerId.value = null;
    articleDeep.value = 0;
  }
});

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

async function onRemoveArticleFromDetail(articleId: number) {
  if (!detailId.value) return;
  await removeAppraisalArticle(detailId.value, articleId);
  message.success('已移除');
  loadDetail(); // 刷新详情抽屉
  loadList(); // 刷新列表 articles_count
}

function openArticleDrawer(articleId: number) {
  articleDrawerId.value = articleId;
  articleDrawerOpen.value = true;
}

// ============ 添加评委 Modal（参评项目行操作） ============
const expertsOpen = ref(false);
const expertsLoading = ref(false);
const expertsSaving = ref(false);
const expertsArticle = ref<AppraisalArticleItem | null>(null);
// 已有评委（该项目的 AppraisalComment 列表）
const expertComments = ref<ArticleCommentItem[]>([]);
// 启用状态评委库选项
const expertOptions = ref<{ label: string; value: number }[]>([]);
// 待添加的评委 ID（多选）
const pendingExpertIds = ref<number[]>([]);

// 已担任评委的 expert_id 集合，用于 Select 过滤（防止重复添加覆盖已有意见）
const expertCommentIds = computed(() => new Set(expertComments.value.map((c) => c.expert_id)));

async function openExpertsModal(record: AppraisalArticleItem) {
  expertsArticle.value = record;
  expertsOpen.value = true;
  pendingExpertIds.value = [];
  expertsLoading.value = true;
  try {
    const [cmts, page] = await Promise.all([
      getArticleComments(record.article_id),
      getExpertList({ page: 1, page_size: 500, status: true }),
    ]);
    expertComments.value = cmts;
    expertOptions.value = (page.items ?? []).map((e) => ({ label: e.name, value: e.id }));
  } finally {
    expertsLoading.value = false;
  }
}

async function confirmAddExperts() {
  if (!expertsArticle.value || pendingExpertIds.value.length === 0) {
    message.warning('请选择要添加的评委');
    return;
  }
  expertsSaving.value = true;
  try {
    // 走批量录入评委意见接口：comment=0 未发表（后续在项目详情评审记录中录入实际意见）
    await batchUpsertComments(
      expertsArticle.value.article_id,
      pendingExpertIds.value.map((id) => ({ expert_id: id, comment: 0 })),
    );
    message.success('评委已添加');
    pendingExpertIds.value = [];
    // 刷新已有评委列表 + 详情（comments_count 计数），Modal 保持打开便于继续操作
    expertComments.value = await getArticleComments(expertsArticle.value.article_id);
    if (detailId.value) loadDetail();
  } finally {
    expertsSaving.value = false;
  }
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
      <Form layout="inline" :model="query" class="flex flex-wrap items-center gap-3">
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
        <div class="flex-1" />
        <AccessControl :codes="['appraisal:create']" type="code">
          <Button type="primary" @click="openCreate">新建</Button>
        </AccessControl>
      </Form>
    </Card>

    <!-- 表格 -->
    <Card size="small">
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
          onChange: (p: number) => { query.page = p; loadList(); },
          onShowSizeChange: (_c: number, s: number) => { query.page = 1; query.page_size = s; loadList(); },
        }"
        :custom-row="customRow"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
      >
        <template #bodyCell="{ column, record }">
          <!-- 会议编号链接 -->
          <template v-if="column.dataIndex === 'num'">
            <a @click="openDetail(record as AppraisalListItem)">{{ (record as AppraisalListItem).num }}</a>
          </template>
          <!-- 状态标签 -->
          <template v-if="column.dataIndex === 'meeting_state'">
            <Tag :color="(record as AppraisalListItem).meeting_state === 10 ? 'orange' : 'green'">
              {{ (record as AppraisalListItem).meeting_state_display || '-' }}
            </Tag>
          </template>
          <!-- 评审形式 -->
          <template v-else-if="column.dataIndex === 'review_model'">
            {{ dash((record as AppraisalListItem).review_model_display) }}
          </template>
          <!-- 需要 dash 兜底的文本列 -->
          <template v-else-if="['review_date','compere_name'].includes(column.dataIndex as string)">
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
          :custom-row="arrangeCustomRow"
          :row-class-name="arrangeRowClassName"
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
            <div class="py-4 text-muted-foreground">尚未安排项目，请在下方选择添加</div>
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
        <div class="mt-1 text-xs text-muted-foreground">已出现在上表的项目会自动过滤，不可重复添加</div>
      </div>
    </Modal>

    <!-- 添加评委 Modal（参评项目行操作，批量写入评委意见，comment=0 未发表） -->
    <Modal
      v-model:open="expertsOpen"
      :title="expertsArticle ? `添加评委 · ${expertsArticle.article_num}` : '添加评委'"
      :confirm-loading="expertsSaving"
      ok-text="添加"
      cancel-text="关闭"
      width="560px"
      destroy-on-close
      @ok="confirmAddExperts"
    >
      <Spin :spinning="expertsLoading">
        <!-- 已有评委 -->
        <div class="mb-3">
          <div class="mb-2 font-medium">已有评委（{{ expertComments.length }}）</div>
          <div v-if="expertComments.length" class="flex flex-wrap gap-2">
            <Tag v-for="c in expertComments" :key="c.id">
              {{ c.expert_name }}{{ c.comment ? ` · ${c.comment_display}` : '' }}
            </Tag>
          </div>
          <div v-else class="text-xs text-muted-foreground">暂无评委，请在下方选择添加</div>
        </div>
        <!-- 添加区域 -->
        <div class="border-t pt-3">
          <div class="mb-2 font-medium">添加评委</div>
          <Select
            v-model:value="pendingExpertIds"
            mode="multiple"
            :options="expertOptions.filter((o) => !expertCommentIds.has(o.value))"
            placeholder="搜索评委姓名"
            :max-tag-count="8"
            show-search
            allow-clear
            style="width: 100%"
          />
          <div class="mt-1 text-xs text-muted-foreground">
            已担任评委的专家自动过滤；添加后意见默认"未发表"，可在项目详情评审记录中录入
          </div>
        </div>
      </Spin>
    </Modal>
    <!-- 详情 Drawer（宽度按嵌套抽屉约定：66% + 4% × 已打开后代层数，AGENTS.md §6.4） -->
    <Drawer
      v-model:open="detailOpen"
      :title="detail?.num ?? '评审会详情'"
      :width="drawerWidth(articleDrawerOpen ? 1 + articleDeep : 0)"
      :destroy-on-close="true"
      :mask-closable="false"
    >
      <Spin :spinning="detailLoading">
        <template v-if="detail">
          <!-- 基本信息 -->
          <Card size="small" title="基本信息" class="mb-3">
            <template #extra>
              <div class="flex gap-2">
                <AccessControl :codes="['appraisal:update']" type="code">
                  <Button size="small" @click="detailOpen = false; openArrange(detail as unknown as AppraisalListItem)">安排项目</Button>
                </AccessControl>
                <AccessControl :codes="['appraisal:finish']" type="code">
                  <Button
                    size="small"
                    type="primary"
                    :disabled="detail.meeting_state !== 10"
                    @click="onFinish(detail as unknown as AppraisalListItem)"
                  >完成会议</Button>
                </AccessControl>
                <AccessControl :codes="['appraisal:delete']" type="code">
                  <Popconfirm title="确认删除？" ok-text="删除" cancel-text="取消" @confirm="async () => { await onDelete(detail as unknown as AppraisalListItem); detailOpen = false; }">
                    <Button size="small" danger>删除</Button>
                  </Popconfirm>
                </AccessControl>
              </div>
            </template>
            <Descriptions size="small" :column="detailColumns">
              <DescriptionsItem label="会议编号">{{ dash(detail.num) }}</DescriptionsItem>
              <DescriptionsItem label="年份">{{ detail.year }}</DescriptionsItem>
              <DescriptionsItem label="序号">{{ detail.seq }}</DescriptionsItem>
              <DescriptionsItem label="评审形式">{{ dash(detail.review_model_display) }}</DescriptionsItem>
              <DescriptionsItem label="状态">
                <Tag :color="detail.meeting_state === 10 ? 'orange' : 'green'">
                  {{ dash(detail.meeting_state_display) }}
                </Tag>
              </DescriptionsItem>
              <DescriptionsItem label="评审日期">{{ dash(detail.review_date) }}</DescriptionsItem>
              <DescriptionsItem label="主持人">{{ dash(detail.compere_name) }}</DescriptionsItem>
              <DescriptionsItem label="创建人">{{ dash(detail.created_by_name) }}</DescriptionsItem>
              <DescriptionsItem label="创建时间">{{ dash(detail.created_at) }}</DescriptionsItem>
            </Descriptions>
          </Card>

          <!-- 参评项目 Tab -->
          <Card size="small" title="参评项目" class="mb-3">
            <Table
              size="small"
              :data-source="detail.articles"
              :pagination="false"
              row-key="article_id"
            >
              <Table.Column title="项目编号" dataIndex="article_num" width="160">
                <template #default="{ record }">
                  <Button type="link" size="small" @click="openArticleDrawer(record.article_id)">{{ record.article_num }}</Button>
                </template>
              </Table.Column>
              <Table.Column title="客户" dataIndex="customer_name" width="180">
                <template #default="{ record }">{{ dash(record.customer_name) }}</template>
              </Table.Column>
              <Table.Column title="产品" dataIndex="product_name" width="120">
                <template #default="{ record }">{{ dash(record.product_name) }}</template>
              </Table.Column>
              <Table.Column title="金额(万)" width="120" align="right">
                <template #default="{ record }">
                  {{ (((record.renewal ?? 0) + (record.augment ?? 0)) / 10000).toLocaleString() }}
                </template>
              </Table.Column>
              <Table.Column title="操作" width="120" fixed="right">
                <template #default="{ record }">
                  <AccessControl :codes="['appraisal:comment']" type="code">
                    <Button size="small" type="link" @click="openExpertsModal(record)">评委</Button>
                  </AccessControl>
                  <Popconfirm
                    title="确认移除该项目？"
                    ok-text="确认移除"
                    ok-type="danger"
                    @confirm="onRemoveArticleFromDetail(record.article_id)"
                  >
                    <Button size="small" type="link" danger>移除</Button>
                  </Popconfirm>
                </template>
              </Table.Column>
            </Table>
          </Card>
        </template>
      </Spin>
      <!-- 嵌套：从参评项目 Tab 点击项目编号打开项目详情（@deep-open 上报其后代层数） -->
      <ArticleDetailDrawer
        v-model:open="articleDrawerOpen"
        :article-id="articleDrawerId"
        @deep-open="(n) => (articleDeep = n)"
        @saved="loadDetail"
        @deleted="() => { articleDrawerOpen = false; loadDetail(); loadList(); }"
      />
    </Drawer>
  </Page>
</template>
