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
  Divider,
  Drawer,
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  TabPane,
  Tabs,
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
import { deleteArticleComment, getArticleComments, getArticleDictList } from '#/api/basic/article';
import { getAppraisalDict } from '#/api/basic/dict';
import { useDictStore } from '#/store/dict';

// ============ 字典 ============
const dictStore = useDictStore();
const meetingStateOpts = ref<{ label: string; value: number }[]>([]);
const reviewModelOpts = ref<{ label: string; value: number }[]>([]);
const compereOptions = ref<{ label: string; value: number }[]>([]);
const articleOptions = ref<{ label: string; value: number }[]>([]);

/** 评委意见 Tag 颜色：同意=green 复议=orange 不同意=red 未发表=default */
function commentColor(c: number): string {
  if (c === 10) return 'green';
  if (c === 20) return 'orange';
  if (c === 30) return 'red';
  return 'default';
}

/** 上会建议 Tag 颜色：符合上会=green 暂不符合=orange 建议终止=red 未反馈=default */
function proposeColor(p: number): string {
  if (p === 10) return 'green';
  if (p === 20) return 'orange';
  if (p === 30) return 'red';
  return 'default';
}

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
// 评委 Tab 数据表独立高亮（与全项目表格一致的点击高亮交互）
const {
  customRow: commentCustomRow,
  rowClassName: commentRowClassName,
  clearHighlight: clearCommentHighlight,
} = useRowHighlight();
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
    // 默认选中第一个参评项目；当前选中项目被移出时重置（参照放款次序 Tab 的默认选中）
    const ids = detail.value.articles.map((a) => a.article_id);
    if (activeArticleId.value == null || !ids.includes(activeArticleId.value)) {
      activeArticleId.value = ids.length > 0 ? ids[0]! : null;
      if (activeArticleId.value != null) void loadArticleComments(activeArticleId.value);
      else articleComments.value = [];
    }
    // 评委库选项（内联添加用，加载一次）
    if (expertOptions.value.length === 0) void loadExpertOptions();
  } finally {
    detailLoading.value = false;
  }
}

watch(detailOpen, (v) => {
  if (v) loadDetail();
  else {
    detail.value = null;
    // 父 Drawer 关闭时同步重置嵌套的项目详情抽屉与评委区域
    articleDrawerOpen.value = false;
    articleDrawerId.value = null;
    articleDeep.value = 0;
    activeArticleId.value = null;
    articleComments.value = [];
    pendingExpertId.value = undefined;
    clearCommentHighlight();
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

// ============ 评委区域（参评项目行点击选中，下方展示该项目的评委；参照项目详情放款次序→反担保） ============
// 当前选中的参评项目（article_id）
const activeArticleId = ref<number | null>(null);
const activeArticle = computed(() =>
  detail.value?.articles.find((a) => a.article_id === activeArticleId.value),
);
// 选中项目的评委意见列表
const articleComments = ref<ArticleCommentItem[]>([]);
const commentsLoading = ref(false);
// 评委区域 DOM 引用，用于滚动定位
const expertsSectionRef = ref<HTMLElement | null>(null);
// 启用状态评委库选项（内联添加用，抽屉打开时加载一次）
const expertOptions = ref<{ label: string; value: number }[]>([]);
// 内联添加选中的评委 ID
const pendingExpertId = ref<number | undefined>();

// 已担任评委的 expert_id 集合，用于 Select 过滤（防止重复添加覆盖已有意见）
const expertCommentIds = computed(() => new Set(articleComments.value.map((c) => c.expert_id)));

async function loadArticleComments(articleId: number) {
  commentsLoading.value = true;
  try {
    articleComments.value = await getArticleComments(articleId);
  } finally {
    commentsLoading.value = false;
  }
}

/** 参评项目行点击：选中 + 高亮 + 滚动到评委区域（参照 jumpToSureSection） */
function selectArticle(record: AppraisalArticleItem) {
  if (activeArticleId.value === record.article_id) return; // 点击当前激活行不做任何状态变更
  activeArticleId.value = record.article_id;
  pendingExpertId.value = undefined;
  clearCommentHighlight(); // 切换项目后评委表数据刷新，旧行高亮失效
  void loadArticleComments(record.article_id);
  setTimeout(() => {
    expertsSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

async function loadExpertOptions() {
  const page = await getExpertList({ page: 1, page_size: 500, status: true });
  expertOptions.value = (page.items ?? []).map((e) => ({ label: e.name, value: e.id }));
}

async function submitAddExpert() {
  if (!activeArticleId.value || !pendingExpertId.value) {
    message.warning('请选择要添加的评委');
    return;
  }
  // 走批量录入评委意见接口：comment=0 未发表（后续在下方表格"修改"录入实际意见）
  await batchUpsertComments(activeArticleId.value, [
    { expert_id: pendingExpertId.value, comment: 0 },
  ]);
  message.success('评委已添加');
  pendingExpertId.value = undefined;
  await loadArticleComments(activeArticleId.value);
  if (detailId.value) loadDetail();
}

// ===== 修改评委意见 Modal =====
const commentEditOpen = ref(false);
const commentEditSaving = ref(false);
const commentEditForm = reactive({
  expert_id: 0,
  expert_name: '',
  comment: 0,
  detail: '' as string | null,
});

function openCommentEdit(record: ArticleCommentItem) {
  Object.assign(commentEditForm, {
    expert_id: record.expert_id,
    expert_name: record.expert_name,
    comment: record.comment,
    detail: record.detail ?? '',
  });
  commentEditOpen.value = true;
}

async function saveCommentEdit() {
  if (!activeArticleId.value) return;
  commentEditSaving.value = true;
  try {
    await batchUpsertComments(activeArticleId.value, [
      { expert_id: commentEditForm.expert_id, comment: commentEditForm.comment, detail: commentEditForm.detail },
    ]);
    message.success('评委意见已保存');
    commentEditOpen.value = false;
    await loadArticleComments(activeArticleId.value);
    if (detailId.value) loadDetail();
  } finally {
    commentEditSaving.value = false;
  }
}

/** 删除评委（意见记录）：后端有状态门槛，不符时 requestClient 已 toast */
async function onDeleteComment(record: ArticleCommentItem) {
  if (!activeArticleId.value) return;
  await deleteArticleComment(activeArticleId.value, record.expert_id);
  message.success('评委已删除');
  await loadArticleComments(activeArticleId.value);
  if (detailId.value) loadDetail(); // 刷新参评项目 Tab 标题里的评委数
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
    <!-- 修改评委意见 Modal（评委表格行操作，upsert 单条） -->
    <Modal
      v-model:open="commentEditOpen"
      :title="`修改评委意见 · ${commentEditForm.expert_name}`"
      :confirm-loading="commentEditSaving"
      ok-text="保存"
      cancel-text="取消"
      destroy-on-close
      @ok="saveCommentEdit"
    >
      <Form :model="commentEditForm" :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }" size="small">
        <FormItem label="评委">
          <Input :value="commentEditForm.expert_name" disabled />
        </FormItem>
        <FormItem label="意见" required>
          <Select
            v-model:value="commentEditForm.comment"
            :options="dictStore.get('appraisal.comment_type')"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="意见详情">
          <textarea
            v-model="commentEditForm.detail"
            rows="3"
            class="w-full border border-border rounded px-2 py-1"
            placeholder="可选，评委意见补充说明"
          />
        </FormItem>
      </Form>
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

          <!-- 参评项目（上半 master 表格：行点击选中高亮；下半联动展示该项目评委，参照项目详情放款次序→反担保） -->
          <Card size="small" title="参评项目" class="mb-3">
            <Table
              size="small"
              :data-source="detail.articles"
              :pagination="false"
              row-key="article_id"
              :scroll="{ x: 'max-content' }"
              :custom-row="(record: AppraisalArticleItem) => ({
                onClick: () => selectArticle(record),
              })"
              :row-class-name="(record: AppraisalArticleItem) =>
                record.article_id === activeArticleId ? 'row-active' : ''
              "
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
              <Table.Column title="项目经理" dataIndex="director_name" width="90">
                <template #default="{ record }">{{ dash(record.director_name) }}</template>
              </Table.Column>
              <Table.Column title="项目助理" dataIndex="assistant_name" width="90">
                <template #default="{ record }">{{ dash(record.assistant_name) }}</template>
              </Table.Column>
              <Table.Column title="风控专员" dataIndex="control_name" width="90">
                <template #default="{ record }">{{ dash(record.control_name) }}</template>
              </Table.Column>
              <Table.Column title="上会建议" dataIndex="propose" width="100" align="center">
                <template #default="{ record }">
                  <Tag v-if="record.propose != null" :color="proposeColor(record.propose)">
                    {{ record.propose_display || `#${record.propose}` }}
                  </Tag>
                  <span v-else>-</span>
                </template>
              </Table.Column>
              <Table.Column title="操作" width="100" fixed="right">
                <template #default="{ record }">
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

            <!-- ===== 评委区域：无 Card 包装，Divider + Tabs（参照反担保区域） ===== -->
            <Divider class="!my-4" />
            <div ref="expertsSectionRef">
              <Spin :spinning="commentsLoading">
                <!-- 未选中参评项目 → 提示 -->
                <template v-if="!activeArticle">
                  <Empty description="请在上方参评项目列表点击一行选择项目" />
                </template>
                <template v-else>
                  <Tabs size="small">
                    <TabPane :tab="`评委 · ${activeArticle.article_num}(${articleComments.length})`">
                      <!-- 内联添加行（已担任评委的自动过滤） -->
                      <div class="mb-2 flex flex-wrap items-center gap-2">
                        <Select
                          v-model:value="pendingExpertId"
                          :options="expertOptions.filter((o) => !expertCommentIds.has(o.value))"
                          placeholder="搜索评委姓名"
                          show-search
                          allow-clear
                          style="width: 220px"
                        />
                        <AccessControl :codes="['appraisal:comment']" type="code">
                          <Button type="primary" :disabled="!pendingExpertId" @click="submitAddExpert">添加</Button>
                        </AccessControl>
                      </div>
                      <Table
                        :columns="[
                          { title: '评委', dataIndex: 'expert_name', width: 70, ellipsis: true },
                          { title: '单位', dataIndex: 'org_name', width: 140, ellipsis: true },
                          { title: '职务', dataIndex: 'title', width: 100, ellipsis: true },
                          { title: '电话', dataIndex: 'contact_numb', width: 120 },
                          { title: '邮箱', dataIndex: 'email', width: 160, ellipsis: true },
                          { title: '意见', dataIndex: 'comment_display', width: 70, align: 'center' },
                          { title: '意见详情', dataIndex: 'detail' },
                          { title: '操作', key: 'op', width: 110, align: 'center' },
                        ]"
                        :data-source="articleComments"
                        :pagination="false"
                        row-key="id"
                        size="small"
                        :scroll="{ x: 950 }"
                        :custom-row="commentCustomRow"
                        :row-class-name="commentRowClassName"
                      >
                        <template #bodyCell="{ column, record }">
                          <template v-if="column.dataIndex === 'comment_display'">
                            <Tag :color="commentColor(record.comment)">{{ record.comment_display || `#${record.comment}` }}</Tag>
                          </template>
                          <template v-else-if="['org_name', 'title', 'contact_numb', 'email'].includes(column.dataIndex as string)">
                            {{ dash(record[column.dataIndex as string]) }}
                          </template>
                          <template v-else-if="column.dataIndex === 'detail'">
                            {{ record.detail || '-' }}
                          </template>
                          <template v-else-if="column.key === 'op'">
                            <AccessControl :codes="['appraisal:comment']" type="code">
                              <Space :size="4">
                                <Button size="small" type="link" @click="openCommentEdit(record as ArticleCommentItem)">意见</Button>
                                <Popconfirm
                                  :title="`确认删除评委 ${record.expert_name}？`"
                                  ok-text="删除"
                                  cancel-text="取消"
                                  @confirm="onDeleteComment(record as ArticleCommentItem)"
                                >
                                  <Button size="small" type="link" danger>删除</Button>
                                </Popconfirm>
                              </Space>
                            </AccessControl>
                          </template>
                        </template>
                        <template #emptyText>
                          <div class="py-4 text-muted-foreground">暂无评委，请在上方选择添加</div>
                        </template>
                      </Table>
                    </TabPane>
                  </Tabs>
                </template>
              </Spin>
            </div>
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
