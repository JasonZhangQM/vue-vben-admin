<script lang="ts" setup>
/** 项目详情抽屉：查看 + 内嵌编辑 + 评审记录 Tab + 审批流 Tab。 */
import type {
  ApprovalInstanceItem,
  ArticleCommentItem,
  ArticleDetail,
  ArticleSupplyItem,
} from '#/api/basic/article';

import { reactive, ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import {
  Button,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Empty,
  Form,
  FormItem,
  InputNumber,
  message,
  Modal,
  Space,
  Spin,
  Table,
  TabPane,
  Tabs,
  Tag,
  Timeline,
  TimelineItem,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { dash } from '#/utils/format';

import {
  deleteArticle,
  getArticleApprovalInstances,
  getArticleComments,
  getArticleDetail,
  getArticleSupplies,
  submitChangeRequest,
  submitSignRequest,
  updateArticle,
} from '#/api/basic/article';
import {
  getArticleDict,
  getArticleProductsDict,
  getEmployeeDict,
} from '#/api/basic/dict';

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
const activeTab = ref('info');

// ========== 编辑模式 ==========
const editing = ref(false);
const editLoading = ref(false);

const editForm = reactive({
  article_state: 10,
  customer_id: undefined as number | undefined,
  product_id: undefined as number | undefined,
  renewal: undefined as number | undefined,
  augment: undefined as number | undefined,
  credit_term: undefined as number | undefined,
  director_id: undefined as number | undefined,
  assistant_id: undefined as number | undefined,
  control_id: undefined as number | undefined,
  repay_method: undefined as number | undefined,
});

// ========== 字典 ==========
const repayMethodOpts = ref<{ label: string; value: number }[]>([]);
const productOpts = ref<{ label: string; value: number }[]>([]);
const pmOptions = ref<{ label: string; value: number }[]>([]);
const controlOptions = ref<{ label: string; value: number }[]>([]);
const employeeOptions = ref<{ label: string; value: number }[]>([]);

let dictLoaded = false;

async function loadDicts() {
  if (dictLoaded) return;
  const [dict, products, pms, controllers, emps] = await Promise.all([
    getArticleDict(),
    getArticleProductsDict(),
    getEmployeeDict({ role: 'pm' }),
    getEmployeeDict({ role: 'controler' }),
    getEmployeeDict(),
  ]);
  repayMethodOpts.value = dict.repay_method;
  productOpts.value = products.map((p) => ({ label: p.name, value: p.id }));
  pmOptions.value = pms.map((u) => ({ label: u.name, value: u.id }));
  controlOptions.value = controllers.map((u) => ({ label: u.name, value: u.id }));
  employeeOptions.value = emps.map((u) => ({ label: u.name, value: u.id }));
  dictLoaded = true;
}

// ========== Tab 数据 ==========
const comments = ref<ArticleCommentItem[]>([]);
const supplies = ref<ArticleSupplyItem[]>([]);
const approvals = ref<ApprovalInstanceItem[]>([]);
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

async function loadTabs() {
  if (!props.articleId) return;
  tabLoading.value = true;
  try {
    const [c, s, a] = await Promise.all([
      getArticleComments(props.articleId),
      getArticleSupplies(props.articleId),
      getArticleApprovalInstances(props.articleId),
    ]);
    comments.value = c;
    supplies.value = s;
    approvals.value = a;
  } finally {
    tabLoading.value = false;
  }
}

// ========== 打开抽屉生命周期 ==========
watch(
  () => open.value,
  (val) => {
    if (val) {
      activeTab.value = 'info';
      editing.value = false;
      loadDetail();
      loadTabs();
      loadDicts();
    } else {
      detail.value = null;
      comments.value = [];
      supplies.value = [];
      approvals.value = [];
      editing.value = false;
    }
  },
);

// ========== 编辑动作 ==========
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
    director_id: detail.value.director_id,
    assistant_id: detail.value.assistant_id,
    control_id: detail.value.control_id,
    repay_method: detail.value.repay_method,
  });
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
}

async function saveEdit() {
  if (!props.articleId) return;
  editLoading.value = true;
  try {
    await updateArticle(props.articleId, editForm);
    message.success('保存成功');
    editing.value = false;
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
    :title="detail ? `项目 ${detail.article_num}${editing ? '（编辑中）' : ''}` : '项目详情'"
    width="66%"
    :destroyOnClose="true"
  >
    <!-- Drawer 标题栏右侧操作区 -->
    <template #extra>
      <Space v-if="detail">
        <template v-if="!editing">
          <!-- 发起签批：仅已上会/待变更 且无进行中审批 可操作 -->
          <AccessControl :codes="['article:sign']" type="code">
            <Button
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
          <!-- 发起变更申请：仅已签批/放款中/待变更 且无进行中审批 可操作 -->
          <AccessControl :codes="['article:change']" type="code">
            <Button
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
            <Button type="primary" @click="startEdit">编辑</Button>
          </AccessControl>
          <AccessControl :codes="['article:delete']" type="code">
            <Button danger @click="deleteItem">删除</Button>
          </AccessControl>
        </template>
        <template v-else>
          <Button @click="cancelEdit">取消</Button>
          <Button type="primary" :loading="editLoading" @click="saveEdit">保存</Button>
        </template>
      </Space>
    </template>

    <Spin :spinning="loading">
      <template v-if="detail">
        <!-- ===== 编辑模式：Form ===== -->
        <Form
          v-if="editing"
          :label-col="{ span: 8 }"
          :wrapper-col="{ span: 16 }"
          :model="editForm"
          class="grid grid-cols-2 gap-x-6"
        >
          <FormItem label="客户">
            <SearchSelect
              v-model:value="editForm.customer_id"
              placeholder="输入客户名搜索"
              style="width: 100%"
              :options="employeeOptions"
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
          <FormItem label="授信额(万)" required>
            <InputNumber v-model:value="editForm.renewal" :min="0" :precision="2" style="width: 100%" />
          </FormItem>
          <FormItem label="追加额(万)">
            <InputNumber v-model:value="editForm.augment" :min="0" :precision="2" style="width: 100%" />
          </FormItem>
          <FormItem label="期限(月)">
            <InputNumber v-model:value="editForm.credit_term" :min="1" style="width: 100%" />
          </FormItem>
          <FormItem label="还款方式">
            <SearchSelect
              v-model:value="editForm.repay_method"
              :options="repayMethodOpts"
              placeholder="选择"
              style="width: 100%"
              allow-clear
            />
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
          <FormItem label="风控经理">
            <SearchSelect
              v-model:value="editForm.control_id"
              placeholder="输入名字搜索"
              style="width: 100%"
              allow-clear
              :options="controlOptions"
            />
          </FormItem>
          <FormItem label="助理">
            <SearchSelect
              v-model:value="editForm.assistant_id"
              placeholder="输入名字搜索"
              style="width: 100%"
              allow-clear
              :options="employeeOptions"
            />
          </FormItem>
        </Form>

        <!-- ===== 查看模式：Descriptions + Tabs ===== -->
        <template v-else>
          <Descriptions :column="4" size="small" bordered>
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

            <DescriptionsItem label="授信金额(万)">
              {{ detail.balance?.toLocaleString() ?? '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="期限(月)">{{ detail.credit_term ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="担保方式">{{ dash(detail.repay_method_display) }}</DescriptionsItem>
            <DescriptionsItem label="评审日期">{{ dash(detail.review_date) }}</DescriptionsItem>

            <DescriptionsItem label="项目经理">
              {{ dash((detail as any).director_name) }}
            </DescriptionsItem>
            <DescriptionsItem label="项目经理助理">
              {{ dash((detail as any).assistant_name) }}
            </DescriptionsItem>
            <DescriptionsItem label="风控经理">
              {{ dash((detail as any).control_name) }}
            </DescriptionsItem>
            <DescriptionsItem label="签批类型">{{ dash(detail.sign_type) }}</DescriptionsItem>

            <DescriptionsItem label="调查报告编号">{{ dash(detail.summary_num) }}</DescriptionsItem>
            <DescriptionsItem label="登记人">{{ dash(detail.created_by_name) }}</DescriptionsItem>
            <DescriptionsItem label="登记时间" :span="2">{{ dash(detail.created_at) }}</DescriptionsItem>

            <DescriptionsItem label="调查报告" :span="4">
              {{ dash(detail.summary) }}
            </DescriptionsItem>
            <DescriptionsItem label="评审意见" :span="4">
              {{ dash(detail.opinion) }}
            </DescriptionsItem>
            <DescriptionsItem label="风控意见" :span="4">
              {{ dash(detail.rcd_opinion) }}
            </DescriptionsItem>
            <DescriptionsItem label="召集人意见" :span="4">
              {{ dash(detail.convenor_opinion) }}
            </DescriptionsItem>
            <DescriptionsItem label="签批详情" :span="4">
              {{ dash(detail.sign_detail) }}
            </DescriptionsItem>
          </Descriptions>

          <!-- ===== Tabs ===== -->
          <Tabs v-model:activeKey="activeTab" class="mt-4">
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
        </template>
      </template>
    </Spin>
  </Drawer>

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
      <FormItem label="授信额(万)" required>
        <InputNumber v-model:value="signForm.renewal" :min="0" :precision="2" style="width: 100%" />
      </FormItem>
      <FormItem label="追加额(万)">
        <InputNumber v-model:value="signForm.augment" :min="0" :precision="2" style="width: 100%" />
      </FormItem>
      <FormItem label="签批总额">
        <Tag color="blue">{{ signForm.renewal + signForm.augment }} 万（= 授信 + 追加）</Tag>
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
</template>
