<script lang="ts" setup>
/** 项目详情抽屉：查看 + 内嵌编辑 + 评审记录 Tab + 审批流 Tab。 */
import type {
  ApprovalInstanceItem,
  ArticleCommentItem,
  ArticleDetail,
  ArticleSupplyItem,
  ArticleOrderItem,
} from '#/api/basic/article';

import { reactive, ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { useUserStore } from '@vben/stores';
import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Table,
  TabPane,
  Tabs,
  Tag,
  Timeline,
  TimelineItem,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { dash } from '#/utils/format';

import {
  addOrder,
  deleteArticle,
  deleteOrder,
  getArticleApprovalInstances,
  getArticleComments,
  getArticleDetail,
  getArticleSupplies,
  listOrders,
  submitChangeRequest,
  submitFeedback,
  submitSignRequest,
  updateArticle,
  updateOrder,
  upsertSure,
} from '#/api/basic/article';
import {
  getArticleDict,
  getArticleProductsDict,
  getCustomerDict,
  getEmployeeDict,
} from '#/api/basic/dict';
import { getWarrantDict } from '#/api/basic/warrant';

const props = defineProps<{ articleId: null | number }>();

const open = defineModel<boolean>('open', { default: false });

/** 事件契约：saved 是编辑保存（父刷新列表即可），deleted 是删除（父需刷新 + 决定下一条定位）*/
const emit = defineEmits<{
  saved: [id: number];
  deleted: [id: number];
}>();

// ========== 主数据 ==========
const detail = ref<null | ArticleDetail>(null);
const loading = ref(false);
const activeTab = ref('lending-orders');

// 详情基本信息响应式列数(视口越宽列越多)
const { columns: detailColumns } = useDetailColumns();

// ========== 编辑 Modal ==========
const editVisible = ref(false);
const editLoading = ref(false);

const editForm = reactive({
  article_state: 10,
  customer_id: undefined as number | undefined,
  product_id: undefined as number | undefined,
  renewal: undefined as number | undefined,
  augment: undefined as number | undefined,
  credit_term: 1 as number,
  credit_term_unit: 10 as number,
  director_id: undefined as number | undefined,
  assistant_id: undefined as number | undefined,
  control_id: undefined as number | undefined,
});

// ========== 字典 ==========
const userStore = useUserStore();
const currentUserId = computed(() => Number(userStore.userInfo?.userId));

const creditTermUnitOpts = ref<{ label: string; value: number }[]>([]);
/** 项目状态字典（放款次序状态列显示中文标签用） */
const articleStateOpts = ref<{ label: string; value: number }[]>([]);
const productOpts = ref<{ label: string; value: number }[]>([]);
const pmOptions = ref<{ label: string; value: number }[]>([]);
const controlOptions = ref<{ label: string; value: number }[]>([]);
const employeeOptions = ref<{ label: string; value: number }[]>([]);
const proposeOpts = ref<{ label: string; value: number }[]>([]);
/** 当前用户管护的客户列表（一次性加载，本地搜索） */
const customerOptions = ref<{ label: string; value: number }[]>([]);
/** 全部权证列表（担保措施弹窗下拉） */
const warrantOptions = ref<{ label: string; value: number }[]>([]);

let dictLoaded = false;

async function loadDicts() {
  if (dictLoaded) return;
  const userId = currentUserId.value;
  const [dict, products, pms, controllers, emps] = await Promise.all([
    getArticleDict(),
    getArticleProductsDict(),
    getEmployeeDict({ role: 'pm' }),
    getEmployeeDict({ role: 'controler' }),
    getEmployeeDict(),
  ]);
  creditTermUnitOpts.value = dict.credit_term_unit;
  articleStateOpts.value = dict.article_state;
  // ware_category / method_category 纯枚举，由 /dicts/article 聚合接口自动返回
  wareCategoryOpts.value = (dict.ware_category ?? []) as { label: string; value: number }[];
  methodCategoryOpts.value = (dict.method_category ?? []) as { label: string; value: number }[];
  productOpts.value = products.map((p) => ({ label: p.name, value: p.id }));
  pmOptions.value = pms.map((u) => ({ label: u.name, value: u.id }));
  controlOptions.value = controllers.map((u) => ({ label: u.name, value: u.id }));
  employeeOptions.value = emps.map((u) => ({ label: u.name, value: u.id }));
  proposeOpts.value = dict.propose ?? [];
  // 一次性加载当前用户管护的所有客户
  if (userId) {
    try {
      const { items } = await getCustomerDict({ managementor_id: userId, page: 1, page_size: 500 });
      customerOptions.value = items.map((c) => ({ label: c.name, value: c.id }));
    } catch {
      customerOptions.value = [];
    }
  }
  // 一次性加载全部权证（担保措施弹窗下拉，走无 data_scope 的字典接口）
  try {
    const { items } = await getWarrantDict({ page: 1, page_size: 500 });
    warrantOptions.value = items.map((w) => ({
      label: w.warrant_num || `权证#${w.id}`,
      value: w.id,
    }));
  } catch {
    warrantOptions.value = [];
  }
  dictLoaded = true;
}

// ========== Tab 数据 ==========
const comments = ref<ArticleCommentItem[]>([]);
const supplies = ref<ArticleSupplyItem[]>([]);
const approvals = ref<ApprovalInstanceItem[]>([]);
const lendingOrders = ref<ArticleOrderItem[]>([]);
const tabLoading = ref(false);

async function loadDetail() {
  if (!props.articleId) return;
  loading.value = true;
  try {
    detail.value = await getArticleDetail(props.articleId);
  } finally {
    loading.value = false;
  }
}

// 字典选项：ware_category / method_category 从 /dicts/article 聚合接口返回
const wareCategoryOpts = ref<{ label: string; value: number }[]>([]);
const methodCategoryOpts = ref<{ label: string; value: number }[]>([]);
/** 保证类（选客户）判定：ware_category == GUARANTOR(1) */
const WARE_GUARANTOR = 1;

/** sureForm：ware_category + method_category 两个独立字段，直接提交 */
const sureForm = reactive({
  ware_category: undefined as number | undefined,
  method_category: undefined as number | undefined,
  customer_ids: [] as number[],
  warrant_ids: [] as number[],
  remark: '' as string | null,
});

/** 是否保证类（选客户）：ware_category == GUARANTOR */
const isSureGuarantee = computed(() => sureForm.ware_category === WARE_GUARANTOR);
/** 是否抵质押类（选权证）：ware_category 不是 GUARANTOR */
const isSurePledge = computed(() =>
  sureForm.ware_category !== undefined && sureForm.ware_category !== WARE_GUARANTOR,
);

/** ware/method 变化时清空客户/权证选择（避免旧维度的关联数据残留） */
function onSureWareChange() {
  sureForm.customer_ids = [];
  sureForm.warrant_ids = [];
}
function onSureMethodChange() {
  sureForm.customer_ids = [];
  sureForm.warrant_ids = [];
}

async function loadTabs() {
  if (!props.articleId) return;
  tabLoading.value = true;
  try {
    const [c, s, a, lo] = await Promise.all([
      getArticleComments(props.articleId),
      getArticleSupplies(props.articleId),
      getArticleApprovalInstances(props.articleId),
      listOrders(props.articleId),
    ]);
    comments.value = c;
    supplies.value = s;
    approvals.value = a;
    lendingOrders.value = lo;
  } finally {
    tabLoading.value = false;
  }
}

// ========== 放款次序：内联添加 + Modal 编辑（参照权证产权人 Tab） ==========

const lendingOrderModalOpen = ref(false);
const lendingOrderLoading = ref(false);
const editingOrderId = ref<number | null>(null);

const lendingOrderForm = reactive({
  order_amount: 0 as number,
  remark: '' as string | null,
});

function resetLendingOrderForm() {
  Object.assign(lendingOrderForm, {
    order_amount: 0,
    remark: null,
  });
}

/** 放款次序状态 → 中文标签（次序状态跟随项目状态机，复用 article_state 字典） */
function orderStateLabel(state: number) {
  return articleStateOpts.value.find((o) => o.value === state)?.label ?? String(state);
}

/** 内联表单提交：新增放款次序 */
async function submitAddLendingOrder() {
  if (!props.articleId) return;
  if (!detail.value || ![10, 61].includes(detail.value.article_state)) {
    message.warning('仅『待反馈 / 待变更』状态可添加放款次序');
    return;
  }
  if (lendingOrderForm.order_amount <= 0) {
    message.warning('放款金额必须大于 0');
    return;
  }
  try {
    await addOrder(props.articleId, {
      order_amount: lendingOrderForm.order_amount,
      remark: lendingOrderForm.remark || null,
    });
    message.success('放款次序已添加');
    resetLendingOrderForm();
    await loadTabs();
  } catch {
    // requestClient 已 toast
  }
}

/** 打开编辑 Modal（序号由后端分配不允许改，编辑仅改金额/备注） */
function openEditLendingOrder(order: ArticleOrderItem) {
  Object.assign(lendingOrderForm, {
    order_amount: Number(order.order_amount),
    remark: order.remark ?? null,
  });
  editingOrderId.value = order.id;
  lendingOrderModalOpen.value = true;
}

async function saveLendingOrder() {
  if (!props.articleId) return;
  if (lendingOrderForm.order_amount <= 0) {
    message.warning('放款金额必须大于 0');
    return;
  }
  if (editingOrderId.value) {
    lendingOrderLoading.value = true;
    try {
      await updateOrder(props.articleId, editingOrderId.value, {
        order_amount: lendingOrderForm.order_amount,
        remark: lendingOrderForm.remark || null,
      });
      message.success('放款次序已更新');
      lendingOrderModalOpen.value = false;
      editingOrderId.value = null;
      await loadTabs();
    } catch {
      // requestClient 已 toast
    } finally {
      lendingOrderLoading.value = false;
    }
  }
}

function removeLendingOrder(order: ArticleOrderItem) {
  if (!props.articleId) return;
  Modal.confirm({
    title: `删除放款次序 #${order.seq}？`,
    content: `金额 ${Number(order.order_amount).toFixed(2)} 元 · 该次序下的 ${order.sures.length} 条担保措施也会一并删除`,
    async onOk() {
      try {
        await deleteOrder(props.articleId!, order.id);
        message.success('已删除');
        await loadTabs();
      } catch {
        // requestClient 已 toast
      }
    },
  });
}

// ========== 担保措施 Modal（嵌套在放款次序下，按 sure_type upsert）============

/** 可设置反担保措施的项目状态（待反馈/待变更，与放款次序添加门槛一致） */
const SURE_ELIGIBLE_STATES = new Set([10, 61]);

const sureModalOpen = ref(false);
const sureModalLoading = ref(false);
/** 正在编辑哪个放款次序的担保措施 */
const sureTargetOrderId = ref<number | null>(null);
const sureTargetOrderSeq = ref<number>(1);

async function openSureModal(order: ArticleOrderItem) {
  // 状态门槛：与后端 upsert_sure 校验保持一致，不满足时直接拦截
  if (!detail.value || !SURE_ELIGIBLE_STATES.has(detail.value.article_state)) {
    message.warning('仅『待反馈 / 待变更』状态可设置反担保措施');
    return;
  }
  sureTargetOrderId.value = order.id;
  sureTargetOrderSeq.value = order.seq;
  Object.assign(sureForm, {
    ware_category: undefined,
    method_category: undefined,
    remark: null,
    customer_ids: [],
    warrant_ids: [],
  });
  sureModalOpen.value = true;
}

async function saveSure() {
  if (!props.articleId || !sureTargetOrderId.value) return;
  if (sureForm.ware_category === undefined) {
    message.warning('请选择担保物');
    return;
  }
  if (sureForm.method_category === undefined) {
    message.warning('请选择担保方式');
    return;
  }
  if (isSureGuarantee.value && sureForm.customer_ids.length === 0) {
    message.warning('保证类担保需选择至少 1 个客户');
    return;
  }
  if (isSurePledge.value && sureForm.warrant_ids.length === 0) {
    message.warning('抵质押类担保需选择至少 1 个权证');
    return;
  }
  sureModalLoading.value = true;
  try {
    await upsertSure(props.articleId, {
      order_id: sureTargetOrderId.value,
      ware_category: sureForm.ware_category,
      method_category: sureForm.method_category,
      remark: sureForm.remark || null,
      customer_ids: sureForm.customer_ids,
      warrant_ids: sureForm.warrant_ids,
    });
    message.success('反担保措施已保存');
    sureModalOpen.value = false;
    await loadTabs();
  } catch {
    // requestClient 已 toast
  } finally {
    sureModalLoading.value = false;
  }
}

// ========== 打开抽屉生命周期 ==========
watch(
  () => open.value,
  (val) => {
    if (val) {
      activeTab.value = 'lending-orders';
      editVisible.value = false;
      loadDetail();
      loadTabs();
      loadDicts();
    } else {
      detail.value = null;
      comments.value = [];
      supplies.value = [];
      approvals.value = [];
      editVisible.value = false;
    }
  },
);

// ========== 编辑动作（Modal，与客户详情一致） ==========
function startEdit() {
  if (!detail.value) return;
  // 拷贝可编辑字段到表单
  Object.assign(editForm, {
    article_state: detail.value.article_state,
    customer_id: detail.value.customer_id,
    product_id: detail.value.product_id,
    renewal: detail.value.renewal,
    augment: detail.value.augment,
    credit_term: detail.value.credit_term,
    credit_term_unit: detail.value.credit_term_unit,
    director_id: detail.value.director_id,
    assistant_id: detail.value.assistant_id,
    control_id: detail.value.control_id,
  });
  editVisible.value = true;
}

async function saveEdit() {
  if (!props.articleId) return;
  editLoading.value = true;
  try {
    await updateArticle(props.articleId, editForm);
    message.success('保存成功');
    editVisible.value = false;
    await loadDetail();
    emit('saved', props.articleId);
  } catch {
    // requestClient 已 toast
  } finally {
    editLoading.value = false;
  }
}

function deleteItem() {
  if (!props.articleId || !detail.value) return;
  const deletedId = props.articleId;
  Modal.confirm({
    title: `确认删除项目 ${detail.value.article_num}？`,
    async onOk() {
      await deleteArticle(deletedId);
      message.success('已删除');
      open.value = false;
      emit('deleted', deletedId);
    },
  });
}

// ========== 发起签批 ==========
const SIGN_ELIGIBLE_STATES = new Set([40, 61]); // REVIEW_DONE / PENDING_CHANGE
const router = useRouter();

/** 是否允许发起签批：状态门禁 + 无进行中的审批 */
const canSubmitSign = computed(() => {
  if (!detail.value) return false;
  if (!SIGN_ELIGIBLE_STATES.has(detail.value.article_state)) return false;
  const hasPending = approvals.value.some((a) => a.status === 10);
  return !hasPending;
});

const signModalOpen = ref(false);
const signLoading = ref(false);

const signForm = reactive({
  sign_type: 1 as 1 | 2, // 1同意 2不同意
  renewal: 0 as number,
  augment: 0 as number,
  credit_amount: 0 as number,
  g_value: 0 as number,
  sign_date: new Date().toISOString().slice(0, 10),
  sign_detail: '',
});

function openSignModal() {
  if (!detail.value) return;
  // 自动从详情拷贝金额
  signForm.renewal = detail.value.renewal ?? 0;
  signForm.augment = detail.value.augment ?? 0;
  signForm.credit_amount = signForm.renewal + signForm.augment;
  signForm.sign_date = new Date().toISOString().slice(0, 10);
  signForm.sign_detail = `项目 ${detail.value.article_num} 签批申请`;
  signModalOpen.value = true;
}

async function submitSign() {
  if (!props.articleId || !detail.value) return;
  if (signForm.renewal + signForm.augment <= 0) {
    message.warning('授信金额必须大于 0');
    return;
  }
  signLoading.value = true;
  try {
    const res = await submitSignRequest(props.articleId, {
      sign_type: signForm.sign_type,
      renewal: signForm.renewal,
      augment: signForm.augment,
      credit_amount: signForm.credit_amount,
      g_value: signForm.g_value,
      sign_date: signForm.sign_date,
      sign_detail: signForm.sign_detail || null,
    });
    message.success(`签批申请已发起（实例 #${res.instance_id}）`);
    signModalOpen.value = false;
    // 刷新详情 + Tab 数据（审批 Timeline 会新增一条）
    await loadDetail();
    await loadTabs();
    activeTab.value = 'approvals';
    emit('saved', props.articleId);
  } catch {
    // requestClient 已 toast（如"金额三方校验不通过"等业务错误）
  } finally {
    signLoading.value = false;
  }
}

// ========== 发起变更申请 ==========
// 后端校验状态 ∈ (50=SIGNED, 51/52=放款中, 61=PENDING_CHANGE)
const CHANGE_ELIGIBLE_STATES = new Set([50, 51, 52, 61]);

const canSubmitChange = computed(() => {
  if (!detail.value) return false;
  if (!CHANGE_ELIGIBLE_STATES.has(detail.value.article_state)) return false;
  const hasPending = approvals.value.some((a) => a.status === 10);
  return !hasPending;
});

const changeModalOpen = ref(false);
const changeLoading = ref(false);

const changeForm = reactive({
  change_detail: '',
  change_date: '' as string,
});

function openChangeModal() {
  if (!detail.value) return;
  changeForm.change_detail = '';
  changeForm.change_date = new Date().toISOString().slice(0, 10);
  changeModalOpen.value = true;
}

async function submitChange() {
  if (!props.articleId || !detail.value) return;
  if (!changeForm.change_detail.trim()) {
    message.warning('变更说明不能为空');
    return;
  }
  changeLoading.value = true;
  try {
    const res = await submitChangeRequest(props.articleId, {
      change_detail: changeForm.change_detail.trim(),
      change_date: changeForm.change_date || null,
    });
    message.success('变更申请已发起（实例 #' + res.instance_id + '）');
    changeModalOpen.value = false;
    await loadDetail();
    await loadTabs();
    activeTab.value = 'approvals';
    emit('saved', props.articleId);
  } catch {
    // requestClient 已 toast
  } finally {
    changeLoading.value = false;
  }
}

// ========== 提交风控反馈 ==========
// 状态门禁：10 待反馈 或 20 已反馈 可以提交（upsert 语义，允许修改）
const FEEDBACK_ELIGIBLE_STATES = new Set([10, 20]);

const canSubmitFeedback = computed(() => {
  if (!detail.value) return false;
  return FEEDBACK_ELIGIBLE_STATES.has(detail.value.article_state);
});

/** 是否已有反馈（决定按钮是否显示反馈人/反馈时间） */
const hasFeedback = computed(() => {
  if (!detail.value) return false;
  return detail.value.feedback_propose != null
    || !!detail.value.feedback_analysis
    || !!detail.value.feedback_suggestion;
});

const feedbackModalOpen = ref(false);
const feedbackLoading = ref(false);

const feedbackForm = reactive({
  propose: undefined as number | undefined,
  analysis: '' as string,
  suggestion: '' as string,
});

function openFeedbackModal() {
  if (!detail.value) return;
  // 预填已有值（upsert 语义）
  feedbackForm.propose = detail.value.feedback_propose ?? undefined;
  feedbackForm.analysis = detail.value.feedback_analysis ?? '';
  feedbackForm.suggestion = detail.value.feedback_suggestion ?? '';
  feedbackModalOpen.value = true;
}

async function doSubmitFeedback() {
  if (!props.articleId || !detail.value) return;
  feedbackLoading.value = true;
  try {
    await submitFeedback(props.articleId, {
      propose: feedbackForm.propose ?? null,
      analysis: feedbackForm.analysis.trim() || null,
      suggestion: feedbackForm.suggestion.trim() || null,
    });
    message.success(hasFeedback.value ? '风控反馈已更新' : '风控反馈已提交');
    feedbackModalOpen.value = false;
    await loadDetail(); // 刷新详情（状态变 20、feedback 字段回填）
    emit('saved', props.articleId);
  } catch {
    // requestClient 已 toast
  } finally {
    feedbackLoading.value = false;
  }
}

// ========== 状态颜色 ==========
const stateColor: Record<number, string> = {
  10: 'default',
  20: 'processing',
  30: 'success',
  40: 'blue',
  50: 'gold',
  51: 'gold',
  52: 'warning',
  61: 'purple',
  70: 'success',
  80: 'error',
};

function getStateTag(state: number | undefined) {
  if (state === undefined) return { text: '', color: 'default' as const };
  const text = detail.value?.article_state_display ?? String(state);
  return { text, color: (stateColor[state] || 'default') as any };
}

// ========== 表格列 ==========
const commentColumns = [
  { title: '专家', dataIndex: 'expert_name', width: 120 },
  { title: '类型', dataIndex: 'comment_type_display', width: 100 },
  { title: '评分', dataIndex: 'score', width: 80 },
  { title: '意见', dataIndex: 'concrete', ellipsis: true },
  { title: '时间', dataIndex: 'created_at', width: 160 },
];

const supplyColumns = [
  { title: '补调问题', dataIndex: 'supply_detail', ellipsis: true },
  { title: '状态', dataIndex: 'is_resolved', width: 90 },
  { title: '回复', dataIndex: 'resolve_reply', ellipsis: true },
  { title: '补调人', dataIndex: 'supplyor_name', width: 100 },
  { title: '补调时间', dataIndex: 'created_at', width: 160 },
  { title: '解决时间', dataIndex: 'resolved_at', width: 160 },
];
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="detail ? `项目 ${detail.article_num}` : '项目详情'"
    width="66%"
    :destroyOnClose="true"
  >
    <Spin :spinning="loading">
      <template v-if="detail">
        <div class="space-y-4">
          <!-- ===== 基本信息 Card ===== -->
          <Card size="small" title="基本信息">
            <template #extra>
              <div class="flex gap-2">
                <!-- 发起签批：仅已上会/待变更 且无进行中审批 可操作 -->
                <AccessControl :codes="['article:sign']" type="code">
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    :disabled="!canSubmitSign"
                    :title="
                      !SIGN_ELIGIBLE_STATES.has(detail.article_state)
                        ? '仅『已上会 / 待变更』状态可发起签批'
                        : approvals.some((a) => a.status === 10)
                          ? '已有进行中的审批，请先处理'
                          : ''
                    "
                    @click="openSignModal"
                  >
                    发起签批
                  </Button>
                </AccessControl>
                <!-- 发起变更：仅已签批/放款中/待变更 且无进行中审批 可操作 -->
                <AccessControl :codes="['article:change']" type="code">
                  <Button
                    size="small"
                    type="primary"
                    danger
                    ghost
                    :disabled="!canSubmitChange"
                    :title="
                      !CHANGE_ELIGIBLE_STATES.has(detail.article_state)
                        ? '仅『已签批 / 放款中 / 待变更』状态可发起变更'
                        : approvals.some((a) => a.status === 10)
                          ? '已有进行中的审批，请先处理'
                          : ''
                    "
                    @click="openChangeModal"
                  >
                    发起变更
                  </Button>
                </AccessControl>
                <AccessControl :codes="['article:update']" type="code">
                  <Button size="small" type="primary" @click="startEdit">修改</Button>
                </AccessControl>
                <AccessControl :codes="['article:delete']" type="code">
                  <Button size="small" danger @click="deleteItem">删除</Button>
                </AccessControl>
              </div>
            </template>

            <Descriptions :column="detailColumns" size="small">
              <DescriptionsItem label="项目编号">{{ dash(detail.article_num) }}</DescriptionsItem>
              <DescriptionsItem label="项目状态">
                <Tag :color="getStateTag(detail.article_state).color">
                  {{ getStateTag(detail.article_state).text }}
                </Tag>
              </DescriptionsItem>
              <DescriptionsItem label="客户">
                {{ dash((detail as any).customer_name) }}
              </DescriptionsItem>
              <DescriptionsItem label="产品">
                {{ dash((detail as any).product_name) }}
              </DescriptionsItem>

              <DescriptionsItem label="续贷额(元)">
                {{ detail.renewal?.toLocaleString() ?? '—' }}
              </DescriptionsItem>
              <DescriptionsItem label="新增额(元)">
                {{ detail.augment?.toLocaleString() ?? '—' }}
              </DescriptionsItem>
              <DescriptionsItem label="在保余额(元)">
                {{ detail.balance?.toLocaleString() ?? '—' }}
              </DescriptionsItem>
              <DescriptionsItem label="期限">
                {{ detail.credit_term ?? '—' }} {{ dash(detail.credit_term_unit_display) }}
              </DescriptionsItem>

              <DescriptionsItem label="项目经理">
                {{ dash((detail as any).director_name) }}
              </DescriptionsItem>
              <DescriptionsItem label="项目助理">
                {{ dash((detail as any).assistant_name) }}
              </DescriptionsItem>
              <DescriptionsItem label="风控经理">
                {{ dash((detail as any).control_name) }}
              </DescriptionsItem>

              <DescriptionsItem label="登记人">{{ dash(detail.created_by_name) }}</DescriptionsItem>
              <DescriptionsItem label="登记时间">{{ dash(detail.created_at) }}</DescriptionsItem>
              <DescriptionsItem label="更新时间">{{ dash(detail.updated_at) }}</DescriptionsItem>
            </Descriptions>
          </Card>

          <!-- ===== Tabs ===== -->
          <Tabs v-model:activeKey="activeTab">
            <!-- 放款次序（样式与权证产权人 Tab 一致：内联添加 + Table + 编辑 Modal） -->
            <TabPane key="lending-orders" :tab="`放款次序(${lendingOrders.length})`">
              <Spin :spinning="tabLoading">
                <!-- 内联添加表单（序号由后端自动分配，无需输入） -->
                <div class="mb-2 flex flex-wrap items-center gap-2">
                    <InputNumber
                      v-model:value="lendingOrderForm.order_amount"
                      :min="0"
                      :precision="2"
                      placeholder="放款金额(元)"
                      style="width: 180px"
                    />
                    <Input
                      v-model:value="lendingOrderForm.remark"
                      placeholder="备注"
                      style="width: 200px"
                      :maxlength="256"
                    />
                  <AccessControl :codes="['article:order']" type="code">
                    <Button
                      size="small"
                      type="primary"
                      :disabled="
                        !detail || ![10, 61].includes(detail.article_state)
                      "
                      :title="
                        detail && ![10, 61].includes(detail.article_state)
                          ? '仅『待反馈 / 待变更』状态可添加'
                          : ''
                      "
                      @click="submitAddLendingOrder"
                    >
                      添加
                    </Button>
                  </AccessControl>
                </div>

                <Table
                  :columns="[
                    { title: '序号', dataIndex: 'seq', width: 110 },
                    { title: '放款金额(元)', dataIndex: 'order_amount', width: 150, align: 'right' },
                    { title: '状态', dataIndex: 'state', width: 90, align: 'center' },
                    { title: '备注', dataIndex: 'remark', ellipsis: true },
                    { title: '操作', key: 'op', width: 200, align: 'center' },
                  ]"
                  :data-source="lendingOrders"
                  :pagination="false"
                  row-key="id"
                  size="small"
                >
                  <template #bodyCell="{ column, record }">
                    <!-- 序号列：链接 → 担保措施 Modal（始终可见，否则用户找不到入口） -->
                    <template v-if="column.dataIndex === 'seq'">
                      <a @click="openSureModal(record as ArticleOrderItem)"
                        >放款次序 #{{ record.seq }}</a
                      >
                    </template>
                    <template v-else-if="column.dataIndex === 'order_amount'">
                      {{ Number(record.order_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}
                    </template>
                    <template v-else-if="column.dataIndex === 'state'">
                      <Tag
                        :color="record.state === 51 ? 'cyan' : record.state === 55 ? 'green' : 'default'"
                        size="small"
                      >
                        {{ orderStateLabel(record.state) }}
                      </Tag>
                    </template>
                    <template v-else-if="column.dataIndex === 'remark'">
                      {{ record.remark || '-' }}
                    </template>
                    <template v-else-if="column.key === 'op'">
                      <AccessControl :codes="['article:order']" type="code">
                        <Button
                          type="link"
                          size="small"
                          :disabled="!detail || !SURE_ELIGIBLE_STATES.has(detail.article_state)"
                          :title="
                            detail && !SURE_ELIGIBLE_STATES.has(detail.article_state)
                              ? '仅『待反馈 / 待变更』状态可设置'
                              : ''
                          "
                          @click="openSureModal(record as ArticleOrderItem)"
                        >
                          担保措施
                        </Button>
                        <Button
                            type="link"
                            size="small"
                            :disabled="![10, 20, 30, 40, 61].includes(record.state)"
                            @click="openEditLendingOrder(record as ArticleOrderItem)"
                          >
                            修改
                          </Button>
                        <Button
                          type="link"
                          size="small"
                          danger
                          :disabled="![10, 20, 30, 40, 61].includes(record.state)"
                          @click="removeLendingOrder(record as ArticleOrderItem)"
                        >
                          删除
                        </Button>
                      </AccessControl>
                    </template>
                  </template>
                </Table>
              </Spin>
            </TabPane>
            <!-- 签批（ArticleApproval 一对一）：Card 包裹 + 非 bordered Descriptions -->
            <TabPane
              v-if="detail && (detail.review_date || detail.sign_type || detail.summary_num)"
              key="approval"
              tab="签批"
            >
              <Card size="small">
                <Descriptions :column="detailColumns" size="small">
                  <DescriptionsItem label="评审日期">{{ dash(detail.review_date) }}</DescriptionsItem>
                  <DescriptionsItem label="签批类型">
                    {{ detail.sign_type === 1 ? '同意' : detail.sign_type === 2 ? '不同意' : dash(detail.sign_type) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="调查报告编号" :span="detailColumns">
                    {{ dash(detail.summary_num) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="调查报告" :span="detailColumns">
                    {{ dash(detail.summary) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="评审意见" :span="detailColumns">
                    {{ dash(detail.opinion) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="风控意见" :span="detailColumns">
                    {{ dash(detail.rcd_opinion) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="召集人意见" :span="detailColumns">
                    {{ dash(detail.convenor_opinion) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="签批详情" :span="detailColumns">
                    {{ dash(detail.sign_detail) }}
                  </DescriptionsItem>
                </Descriptions>
              </Card>
            </TabPane>

            <!-- 评审意见 + 补调记录 合并一个 Tab -->
            <TabPane key="reviews" :tab="`评审记录(${comments.length + supplies.length})`">
              <Spin :spinning="tabLoading">
                <!-- 评委意见 -->
                <div class="mb-4">
                  <div class="mb-2 font-semibold">评委意见 ({{ comments.length }})</div>
                  <Table
                    :columns="commentColumns"
                    :data-source="comments"
                    :pagination="false"
                    size="small"
                    row-key="id"
                    bordered
                  >
                    <template #bodyCell="{ column, record }">
                      <template v-if="column.dataIndex === 'score'">
                        {{ record.score != null ? record.score : '—' }}
                      </template>
                      <template v-else-if="column.dataIndex === 'comment_type_display'">
                        <Tag>{{ record.comment_type_display || `#${record.comment_type}` }}</Tag>
                      </template>
                    </template>
                  </Table>
                  <Empty v-if="!tabLoading && comments.length === 0" description="暂无评委意见" />
                </div>

                <!-- 补调记录 -->
                <div>
                  <div class="mb-2 font-semibold">补调记录 ({{ supplies.length }})</div>
                  <Table
                    :columns="supplyColumns"
                    :data-source="supplies"
                    :pagination="false"
                    size="small"
                    row-key="id"
                    bordered
                  >
                    <template #bodyCell="{ column, record }">
                      <template v-if="column.dataIndex === 'is_resolved'">
                        <Tag :color="record.is_resolved ? 'success' : 'warning'">
                          {{ record.is_resolved ? '已解决' : '待解决' }}
                        </Tag>
                      </template>
                    </template>
                  </Table>
                  <Empty v-if="!tabLoading && supplies.length === 0" description="暂无补调记录" />
                </div>
              </Spin>
            </TabPane>

            <!-- 风控反馈 Tab：一对一关联（ArticleFeedback 每项目一份），顶端编辑按钮 + 只读 Descriptions -->
            <TabPane key="feedback" :tab="hasFeedback ? '风控反馈 ✅' : '风控反馈（未提交）'">
              <div class="flex justify-end mb-3">
                <AccessControl :codes="['article:feedback']" type="code">
                  <Button
                    size="small"
                    :type="hasFeedback ? 'default' : 'primary'"
                    :disabled="!canSubmitFeedback"
                    :title="
                      !canSubmitFeedback
                        ? '仅『待反馈 / 已反馈』状态可提交风控反馈'
                        : ''
                    "
                    @click="openFeedbackModal"
                  >
                    反馈
                  </Button>
                </AccessControl>
              </div>
              <template v-if="hasFeedback">
                <Descriptions :column="detailColumns" size="small">
                  <DescriptionsItem label="上会建议">
                    <Tag
                      :color="
                        detail!.feedback_propose === 10
                          ? 'green'
                          : detail!.feedback_propose === 20
                            ? 'orange'
                            : 'red'
                      "
                    >
                      {{
                        proposeOpts.find((o) => o.value === detail!.feedback_propose)?.label
                        ?? `#${detail!.feedback_propose}`
                      }}
                    </Tag>
                  </DescriptionsItem>
                  <DescriptionsItem label="反馈人">
                    {{ dash(detail!.feedback_created_by_name) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="反馈时间">
                    {{ dash(detail!.feedback_created_at) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="可修改">
                    <Tag :color="canSubmitFeedback ? 'blue' : 'default'">
                      {{ canSubmitFeedback ? '是（状态待反馈/已反馈）' : '否（已过前置关卡）' }}
                    </Tag>
                  </DescriptionsItem>
                  <DescriptionsItem label="风险分析" :span="4">
                    {{ dash(detail!.feedback_analysis) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="风控意见" :span="4">
                    {{ dash(detail!.feedback_suggestion) }}
                  </DescriptionsItem>
                </Descriptions>
              </template>
              <template v-else>
                <Empty description="尚未提交风控反馈">
                  <div class="text-gray-400 text-xs mt-2">
                    点击上方「反馈」按钮填写风控意见，提交后项目状态将变为『已反馈』。
                  </div>
                </Empty>
              </template>
            </TabPane>

            <!-- 审批流 Timeline -->
            <TabPane key="approvals" :tab="`审批流(${approvals.length})`">
              <Spin :spinning="tabLoading">
                <div class="flex justify-end mb-2">
                  <Button type="link" size="small" @click="router.push('/approval').catch(() => {})">
                    打开审批中心 →
                  </Button>
                </div>
                <template v-if="approvals.length > 0">
                  <div v-for="inst in approvals" :key="inst.id" class="mb-6">
                    <div class="mb-2 flex items-center gap-2">
                      <span class="font-semibold">{{ inst.flow_name }}</span>
                      <Tag
                        :color="
                          inst.status === 20
                            ? 'success'
                            : inst.status === 30
                              ? 'error'
                              : inst.status === 10
                                ? 'processing'
                                : 'default'
                        "
                      >
                        {{ inst.status_display }}
                      </Tag>
                      <span class="text-gray-400">{{ inst.submitter_name }} · {{ inst.submitted_at }}</span>
                    </div>
                    <div v-if="inst.summary" class="mb-2 text-gray-500 text-sm">摘要：{{ inst.summary }}</div>
                    <Timeline>
                      <TimelineItem
                        v-for="(task, idx) in inst.tasks"
                        :key="idx"
                        :color="task.status === 20 ? 'green' : task.status === 30 ? 'red' : task.status === 10 ? 'blue' : 'gray'"
                      >
                        <div class="flex items-center gap-2">
                          <span class="font-medium">{{ task.node_name }}</span>
                          <Tag v-if="task.status === 10" color="processing">待审批</Tag>
                          <Tag v-else-if="task.status === 20" color="success">通过</Tag>
                          <Tag v-else-if="task.status === 30" color="error">驳回</Tag>
                          <Tag v-else-if="task.status === 40">跳过</Tag>
                        </div>
                        <div class="text-gray-500 text-sm">
                          {{ task.approver_name }}
                          <span v-if="task.acted_at"> · {{ task.acted_at }}</span>
                        </div>
                        <div v-if="task.opinion" class="text-gray-600 mt-1">{{ task.opinion }}</div>
                        <div v-if="task.action" class="text-blue-500 text-xs mt-1">操作：{{ task.action }}</div>
                      </TimelineItem>
                    </Timeline>
                  </div>
                </template>
                <Empty v-else description="暂无审批记录" />
              </Spin>
            </TabPane>

          </Tabs>
        </div>
      </template>
    </Spin>
  </Drawer>

  <!-- ===== 修改项目 Modal（与客户详情"修改客户"风格一致） ===== -->
  <Modal
    v-model:open="editVisible"
    :confirm-loading="editLoading"
    destroy-on-close
    title="修改项目"
    @ok="saveEdit"
  >
    <Form :model="editForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
      <FormItem label="客户" required>
        <SearchSelect
          v-model:value="editForm.customer_id"
          :options="customerOptions"
          placeholder="选择客户"
          style="width: 100%"
          disabled
        />
      </FormItem>
      <FormItem label="产品" required>
        <SearchSelect
          v-model:value="editForm.product_id"
          :options="productOpts"
          placeholder="选择产品"
          style="width: 100%"
        />
      </FormItem>
      <FormItem label="续贷额(元)" required>
        <InputNumber v-model:value="editForm.renewal" :min="0" :precision="2" style="width: 100%" />
      </FormItem>
      <FormItem label="新增额(元)">
        <InputNumber v-model:value="editForm.augment" :min="0" :precision="2" style="width: 100%" />
      </FormItem>
      <FormItem label="授信期限">
        <div class="flex gap-2 w-full">
          <InputNumber v-model:value="editForm.credit_term" :min="1" style="flex:1" />
          <SearchSelect
            v-model:value="editForm.credit_term_unit"
            :options="creditTermUnitOpts"
            style="width: 100px"
          />
        </div>
      </FormItem>
      <FormItem label="项目经理">
        <SearchSelect
          v-model:value="editForm.director_id"
          placeholder="输入名字搜索"
          style="width: 100%"
          allow-clear
          :options="pmOptions"
        />
      </FormItem>
      <FormItem label="项目助理">
        <SearchSelect
          v-model:value="editForm.assistant_id"
          placeholder="输入名字搜索"
          style="width: 100%"
          allow-clear
          :options="pmOptions"
        />
      </FormItem>
    </Form>
  </Modal>

  <!-- ===== 发起签批 Modal ===== -->
  <Modal
    v-model:open="signModalOpen"
    title="发起签批审批"
    :confirm-loading="signLoading"
    @ok="submitSign"
  >
    <Form :model="signForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 17 }" size="small">
      <FormItem label="签批类型" required>
        <SearchSelect
          v-model:value="signForm.sign_type"
          :options="[
            { label: '同意', value: 1 },
            { label: '不同意', value: 2 },
          ]"
          style="width: 100%"
        />
      </FormItem>
      <FormItem label="续贷额(元)" required>
        <InputNumber v-model:value="signForm.renewal" :min="0" :precision="2" style="width: 100%" />
      </FormItem>
      <FormItem label="新增额(元)">
        <InputNumber v-model:value="signForm.augment" :min="0" :precision="2" style="width: 100%" />
      </FormItem>
      <FormItem label="合计">
        <Tag color="blue">{{ signForm.renewal + signForm.augment }} 元（= 续贷 + 新增）</Tag>
        <div class="text-gray-400 text-xs mt-1">
          后端会校验：Σ额度 = Σ放款次序 = 签批总额（允许 ±0.01 误差）
        </div>
      </FormItem>
      <FormItem label="签批日期" required>
        <input
          v-model="signForm.sign_date"
          type="date"
          class="w-full border border-gray-300 rounded px-2 py-1"
        />
      </FormItem>
      <FormItem label="签批详情">
        <textarea
          v-model="signForm.sign_detail"
          rows="3"
          class="w-full border border-gray-300 rounded px-2 py-1"
          placeholder="可选，补充签批上下文"
        />
      </FormItem>
    </Form>
  </Modal>

  <!-- ===== 发起变更申请 Modal ===== -->
  <Modal
    v-model:open="changeModalOpen"
    title="发起变更申请"
    :confirm-loading="changeLoading"
    @ok="submitChange"
  >
    <Form :model="changeForm" :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }" size="small">
      <FormItem label="变更说明" required>
        <textarea
          v-model="changeForm.change_detail"
          rows="4"
          class="w-full border border-gray-300 rounded px-2 py-1"
          placeholder="请说明变更的具体内容和原因（必填）"
        />
      </FormItem>
      <FormItem label="变更日期">
        <input
          v-model="changeForm.change_date"
          type="date"
          class="w-full border border-gray-300 rounded px-2 py-1"
        />
      </FormItem>
      <div class="text-gray-400 text-xs">
        流程：风控审批 → 总经理审批（2 步）；通过后项目进入『待变更』状态
      </div>
    </Form>
  </Modal>

  <!-- ===== 提交风控反馈 Modal ===== -->
  <Modal
    v-model:open="feedbackModalOpen"
    title="风控反馈"
    :confirm-loading="feedbackLoading"
    @ok="doSubmitFeedback"
  >
    <Form :model="feedbackForm" :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }" size="small">
      <FormItem label="上会建议" required>
        <SearchSelect
          v-model:value="feedbackForm.propose"
          :options="proposeOpts"
          placeholder="请选择上会建议"
          style="width: 100%"
          allow-clear
        />
      </FormItem>
      <FormItem label="风险分析">
        <textarea
          v-model="feedbackForm.analysis"
          rows="4"
          class="w-full border border-gray-300 rounded px-2 py-1"
          placeholder="可选：填写对客户/项目的风险分析"
        />
      </FormItem>
      <FormItem label="风控意见">
        <textarea
          v-model="feedbackForm.suggestion"
          rows="4"
          class="w-full border border-gray-300 rounded px-2 py-1"
          placeholder="可选：具体风控建议（如授信额度建议、担保措施要求等）"
        />
      </FormItem>
      <div class="text-gray-400 text-xs">
        提交后项目状态将变为『已反馈』；已反馈状态下可再次修改（upsert）。
      </div>
    </Form>
  </Modal>

  <!-- ===== 放款次序编辑 Modal（仅编辑；新增走内联表单） ===== -->
  <Modal
    v-model:open="lendingOrderModalOpen"
    :confirm-loading="lendingOrderLoading"
    title="修改放款次序"
    :width="480"
    @ok="saveLendingOrder"
  >
    <Form :model="lendingOrderForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
      <FormItem label="放款金额(元)" required>
        <InputNumber
          v-model:value="lendingOrderForm.order_amount"
          :min="0"
          :precision="2"
          class="!w-full"
        />
      </FormItem>
      <FormItem label="备注">
        <Input
          v-model:value="lendingOrderForm.remark"
          placeholder="可空"
          :maxlength="256"
        />
      </FormItem>
    </Form>
  </Modal>

  <!-- ===== 担保措施 Modal ===== -->
  <Modal
    v-model:open="sureModalOpen"
    :confirm-loading="sureModalLoading"
    :title="`放款次序 #${sureTargetOrderSeq} 的反担保措施`"
    :width="520"
    @ok="saveSure"
  >
    <Form :model="sureForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
      <!-- 两个独立维度：担保物 × 担保方式，共同确定一条反担保措施 -->
      <FormItem label="担保物" required>
        <Select
          v-model:value="sureForm.ware_category"
          :options="wareCategoryOpts"
          placeholder="请选择"
          class="!w-full"
          show-search
          option-filter-prop="label"
          @change="onSureWareChange"
        />
      </FormItem>
      <FormItem label="担保方式" required>
        <Select
          v-model:value="sureForm.method_category"
          :options="methodCategoryOpts"
          placeholder="请选择"
          class="!w-full"
          show-search
          option-filter-prop="label"
          @change="onSureMethodChange"
        />
      </FormItem>

      <!-- 保证类：选客户 -->
      <FormItem
        v-if="isSureGuarantee"
        label="保证人"
        required
      >
        <Select
          v-model:value="sureForm.customer_ids"
          mode="multiple"
          :options="customerOptions"
          :placeholder="customerOptions.length ? '选择保证客户' : '无客户可选（请先在客户列表添加）'"
          class="!w-full"
          show-search
          option-filter-prop="label"
          :disabled="customerOptions.length === 0"
        />
      </FormItem>

      <!-- 抵质押类：选权证 -->
      <FormItem
        v-if="isSurePledge"
        label="抵质押物"
        required
      >
        <Select
          v-model:value="sureForm.warrant_ids"
          mode="multiple"
          :options="warrantOptions"
          :placeholder="warrantOptions.length ? '选择抵质押权证' : '无权证可选（请先在权证列表添加）'"
          class="!w-full"
          show-search
          option-filter-prop="label"
          :disabled="warrantOptions.length === 0"
        />
      </FormItem>

      <FormItem label="备注">
        <Input
          v-model:value="sureForm.remark"
          type="textarea"
          :rows="2"
          :maxlength="256"
          placeholder="可选：补充说明"
        />
      </FormItem>
      <div class="text-gray-400 text-xs">
        同一放款次序 + 同一担保类型 = 一条 upsert 记录，保存时会替换旧数据。
      </div>
    </Form>
  </Modal>
</template>
