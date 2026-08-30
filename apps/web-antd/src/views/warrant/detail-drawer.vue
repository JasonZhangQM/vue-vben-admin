<script lang="ts" setup>
/** 权证详情抽屉：基本信息 / 所有权人 / 房产 / 出入库（联动状态）/ 评估。 */

import type { WarrantDetail } from '#/api/basic/warrant';

import { computed, reactive, ref, watch } from 'vue';

import { AccessControl, useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Table,
  Tabs,
  TabPane,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { dash, opt } from '#/utils/format';

import {
  addEvaluate,
  addStorage,
  deleteWarrant,
  getWarrantDetail,
  updateWarrant,
  updateWarrantOwner,
} from '#/api/basic/warrant';

const props = defineProps<{ warrantId: null | number }>();
const emit = defineEmits<{ updated: [] }>();

// 详情基本信息响应式列数（视口越宽列越多）
const { columns: detailColumns } = useDetailColumns();

const open = defineModel<boolean>('open', { default: false });
const detail = ref<null | WarrantDetail>(null);
const loading = ref(false);

// 枚举（与后端 warrant/enums.py 对齐）
const TYPE_LABELS: Record<number, string> = {
  1: '房产', 5: '土地', 6: '在建工程', 11: '应收账款', 21: '股权',
  31: '票据', 41: '车辆', 51: '动产', 55: '其他', 99: '他权',
};
const STATE_COLOR: Record<number, string> = {
  10: 'default', 20: 'green', 30: 'blue', 60: 'default',
  110: 'orange', 210: 'orange', 310: 'red', 410: 'purple', 990: 'red',
};
const STATE_LABELS: Record<number, string> = {
  10: '未入库', 20: '已入库', 30: '已加保', 60: '无需入库',
  110: '已借出', 210: '已借出', 310: '解保出库', 410: '已移交', 990: '已注销',
};
const STORAGE_TYPE_OPTIONS = [
  { label: '入库', value: 10 },
  { label: '续抵出库', value: 20 },
  { label: '已加保', value: 30 },
  { label: '无需入库', value: 60 },
  { label: '借出', value: 110 },
  { label: '归还', value: 120 },
  { label: '解保出库', value: 310 },
  { label: '移交', value: 410 },
];
const EVALUATE_METHOD_OPTIONS = [
  { label: '成本法', value: 10 },
  { label: '市场法', value: 20 },
  { label: '收益法', value: 30 },
  { label: '假设开发法', value: 40 },
  { label: '其他', value: 90 },
];
const USAGE_LABELS: Record<number, string> = { 10: '自用', 20: '出租', 30: '空置' };

/** 抽屉内操作完成后刷新抽屉 + 通知列表 */
async function refresh() {
  await load();
  emit('updated');
}

async function load() {
  if (!props.warrantId) return;
  loading.value = true;
  try {
    detail.value = await getWarrantDetail(props.warrantId);
  } catch {
    // 详情拉取失败：自动关闭抽屉 + 错误提示，避免页面挂死
    open.value = false;
    detail.value = null;
    message.error('权证详情加载失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [open.value, props.warrantId],
  ([visible]) => {
    if (visible) load();
  },
);

// ===== 编辑（WarrantUpdate 自由字段子集：评估字段） =====
const { hasAccessByCodes } = useAccess();
const canUpdate = computed(() => hasAccessByCodes(['warrant:update']));

const editVisible = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  evaluate_method: undefined as number | undefined,
  evaluate_value: undefined as number | undefined,
  evaluate_date: '',
  evaluate_company: '',
});

function openEdit() {
  if (!detail.value) return;
  Object.assign(editForm, {
    evaluate_method: (detail.value as any).evaluate_method ?? undefined,
    evaluate_value: detail.value.evaluate_value ?? undefined,
    evaluate_date: '',
    evaluate_company: '',
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!detail.value) return;
  editLoading.value = true;
  try {
    await updateWarrant(detail.value.id, {
      evaluate_method: editForm.evaluate_method,
      evaluate_value: editForm.evaluate_value,
      evaluate_date: editForm.evaluate_date || undefined,
      evaluate_company: opt(editForm.evaluate_company),
    });
    message.success('权证信息已更新');
    editVisible.value = false;
    await refresh();
  } finally {
    editLoading.value = false;
  }
}

// ===== 删除（收纳在抽屉内） =====
async function onDelete() {
  if (!detail.value) return;
  await deleteWarrant(detail.value.id);
  message.success('权证已删除');
  open.value = false;
  emit('updated');
}

// ===== 所有权人编辑（OwnershipUpdate 自由字段） =====
const ownerEditVisible = ref(false);
const ownerEditLoading = ref(false);
const ownerEditForm = reactive({
  id: 0,
  owner_name: '',
  ownership_num: '',
  share_ratio: undefined as number | undefined,
});

function openOwnerEdit(record: any) {
  Object.assign(ownerEditForm, {
    id: record.id,
    owner_name: record.owner_name ?? '',
    ownership_num: record.ownership_num ?? '',
    share_ratio: record.share_ratio ?? undefined,
  });
  ownerEditVisible.value = true;
}

async function submitOwnerEdit() {
  if (!detail.value) return;
  ownerEditLoading.value = true;
  try {
    await updateWarrantOwner(detail.value.id, ownerEditForm.id, {
      ownership_num: opt(ownerEditForm.ownership_num),
      share_ratio: ownerEditForm.share_ratio,
    });
    message.success('所有权人已更新');
    ownerEditVisible.value = false;
    await refresh();
  } finally {
    ownerEditLoading.value = false;
  }
}

// ===== 出入库（联动主表状态） =====
const storageForm = reactive({
  storage_type: 10,
  storage_date: '',
  storage_explain: '',
});

async function submitStorage() {
  if (!detail.value || !storageForm.storage_date) {
    message.warning('请填写出入库日期');
    return;
  }
  await addStorage(detail.value.id, {
    storage_type: storageForm.storage_type,
    storage_date: storageForm.storage_date,
    storage_explain: storageForm.storage_explain || undefined,
  });
  Object.assign(storageForm, { storage_type: 10, storage_date: '', storage_explain: '' });
  message.success('出入库登记成功（权证状态已联动）');
  await refresh();
}

// ===== 评估 =====
const evaluateForm = reactive({
  evaluate_method: 20,
  evaluate_value: 0,
  evaluate_date: '',
  evaluate_company: '',
});

async function submitEvaluate() {
  if (!detail.value || !evaluateForm.evaluate_value || !evaluateForm.evaluate_date) {
    message.warning('请填写评估金额与日期');
    return;
  }
  await addEvaluate(detail.value.id, {
    evaluate_method: evaluateForm.evaluate_method,
    evaluate_value: evaluateForm.evaluate_value,
    evaluate_date: evaluateForm.evaluate_date,
    evaluate_company: evaluateForm.evaluate_company || undefined,
  });
  Object.assign(evaluateForm, {
    evaluate_method: 20, evaluate_value: 0, evaluate_date: '', evaluate_company: '',
  });
  message.success('评估记录已添加');
  await refresh();
}
</script>

<template>
  <Drawer v-model:open="open" :title="detail ? `权证 ${detail.warrant_num}` : '权证详情'" width="66%">
    <div v-if="detail" class="space-y-4">
      <Card size="small" title="基本信息">
        <template #extra>
          <div class="flex gap-2">
            <!-- 编辑按钮：必备，置于首位 -->
            <AccessControl :codes="['warrant:update']" type="code">
              <Button size="small" type="primary" @click="openEdit">编辑</Button>
            </AccessControl>
            <AccessControl :codes="['warrant:delete']" type="code">
              <Popconfirm title="确认删除该权证？（已入库/已流转权证将被拦截）" @confirm="onDelete">
                <Button danger size="small">删除</Button>
              </Popconfirm>
            </AccessControl>
          </div>
        </template>
        <Descriptions :column="detailColumns" size="small">
          <!-- 基础标识 -->
          <DescriptionsItem label="权证号">{{ dash(detail.warrant_num) }}</DescriptionsItem>
          <DescriptionsItem label="类型">{{ dash((detail as any).warrant_type_display) }}</DescriptionsItem>
          <DescriptionsItem label="所有权人" :span="detailColumns">
            {{ (detail.owner_names as string[])?.join('、') || '—' }}
          </DescriptionsItem>

          <!-- 状态/分类 -->
          <DescriptionsItem label="权证状态">
            <Tag :color="STATE_COLOR[(detail as any).warrant_state] ?? 'default'">
              {{ dash((detail as any).warrant_state_display) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="拍卖状态">
            <Tag :color="STATE_COLOR[(detail as any).auction_state] ?? 'default'">
              {{ dash((detail as any).auction_state_display) }}
            </Tag>
          </DescriptionsItem>

          <!-- 评估信息 -->
          <DescriptionsItem label="评估方式">{{ dash((detail as any).evaluate_method_display) }}</DescriptionsItem>
          <DescriptionsItem label="评估值">{{ (detail.evaluate_value as number)?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="评估日期">{{ dash((detail as any).evaluate_date) }}</DescriptionsItem>
          <DescriptionsItem label="评估机构">{{ dash((detail as any).evaluate_company) }}</DescriptionsItem>
          <DescriptionsItem label="评估说明" :span="detailColumns">{{ dash((detail as any).evaluate_explain) }}</DescriptionsItem>

          <!-- 流转时间 -->
          <DescriptionsItem label="入库会议">{{ dash((detail as any).meeting_date) }}</DescriptionsItem>
          <DescriptionsItem label="询价日期">{{ dash((detail as any).inquiry_date) }}</DescriptionsItem>
          <DescriptionsItem label="拍卖日期">{{ dash((detail as any).auction_date) }}</DescriptionsItem>
          <DescriptionsItem label="交易日期">{{ dash((detail as any).transaction_date) }}</DescriptionsItem>

          <!-- 拍卖金额 -->
          <DescriptionsItem label="起拍价">{{ (detail as any).listing_price?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="成交价">{{ (detail as any).auction_amount?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="拍卖说明" :span="detailColumns">{{ dash((detail as any).auction_remark) }}</DescriptionsItem>
          <DescriptionsItem label="入库说明" :span="detailColumns">{{ dash((detail as any).storage_explain) }}</DescriptionsItem>
          <DescriptionsItem label="询价详情" :span="detailColumns">{{ dash((detail as any).inquiry_detail) }}</DescriptionsItem>

          <!-- 审计信息 -->
          <DescriptionsItem label="登记人">{{ dash(detail.created_by_name) }}</DescriptionsItem>
          <DescriptionsItem label="登记时间">{{ dash(detail.created_at) }}</DescriptionsItem>
        </Descriptions>
      </Card>

      <Tabs>
        <!-- 所有权人：首列链接打开编辑 Modal -->
        <TabPane key="owners" :tab="`所有权人（${detail.owners.length}）`">
          <Table
            :columns="[
              { title: '姓名', dataIndex: 'owner_name' },
              { title: '权证编号', dataIndex: 'ownership_num' },
              { title: '份额(%)', dataIndex: 'share_ratio' },
            ]"
            :data-source="detail.owners"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'owner_name'">
                <a @click="openOwnerEdit(record)">{{ record.owner_name }}</a>
              </template>
              <template v-else-if="column.dataIndex === 'ownership_num'">
                {{ dash(record.ownership_num) }}
              </template>
              <template v-else-if="column.dataIndex === 'share_ratio'">
                {{ record.share_ratio ?? '共有' }}
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 房产包（无独立 PATCH 端点，只读展示） -->
        <TabPane v-if="detail.houses.length" key="houses" :tab="`房产（${detail.houses.length}）`">
          <Table
            :columns="[
              { title: '坐落', dataIndex: 'house_locate', ellipsis: true },
              { title: '面积(㎡)', dataIndex: 'house_area', width: 90 },
              { title: '用途', dataIndex: 'house_usage', width: 70 },
              { title: '建成年份', dataIndex: 'house_build_year', width: 90 },
            ]"
            :data-source="detail.houses"
            :pagination="false"
            row-key="house_locate"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'house_usage'">
                {{ USAGE_LABELS[record.house_usage] ?? record.house_usage }}
              </template>
              <template v-else-if="column.dataIndex === 'house_build_year'">
                {{ record.house_build_year ?? '—' }}
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 出入库记录 -->
        <TabPane key="storages" :tab="`出入库（${detail.storages.length}）`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <SearchSelect
              v-model:value="storageForm.storage_type"
              :options="STORAGE_TYPE_OPTIONS"
              size="small"
              style="width: 120px"
            />
            <DatePicker v-model:value="storageForm.storage_date" value-format="YYYY-MM-DD" size="small" style="width: 150px" />
            <Input v-model:value="storageForm.storage_explain" placeholder="说明（可空）" size="small" style="width: 180px" />
            <AccessControl :codes="['warrant:update']" type="code">
              <Button size="small" type="primary" @click="submitStorage">登记</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '类型', dataIndex: 'storage_type', width: 110 },
              { title: '日期', dataIndex: 'storage_date', width: 120 },
              { title: '说明', dataIndex: 'storage_explain' },
            ]"
            :data-source="[...detail.storages].reverse()"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'storage_type'">
                {{ STORAGE_TYPE_OPTIONS.find((o) => o.value === record.storage_type)?.label ?? record.storage_type }}
              </template>
              <template v-else-if="column.dataIndex === 'storage_explain'">
                {{ record.storage_explain ?? '—' }}
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 评估记录 -->
        <TabPane key="evaluates" :tab="`评估（${detail.evaluates.length}）`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <SearchSelect
              v-model:value="evaluateForm.evaluate_method"
              :options="EVALUATE_METHOD_OPTIONS"
              size="small"
              style="width: 110px"
            />
            <InputNumber v-model:value="evaluateForm.evaluate_value" placeholder="评估值" size="small" style="width: 120px" />
            <DatePicker v-model:value="evaluateForm.evaluate_date" value-format="YYYY-MM-DD" size="small" style="width: 150px" />
            <Input v-model:value="evaluateForm.evaluate_company" placeholder="评估公司（可空）" size="small" style="width: 160px" />
            <AccessControl :codes="['warrant:update']" type="code">
              <Button size="small" type="primary" @click="submitEvaluate">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '评估值', dataIndex: 'evaluate_value', width: 110 },
              { title: '方式', dataIndex: 'evaluate_method', width: 100 },
              { title: '日期', dataIndex: 'evaluate_date', width: 110 },
              { title: '评估公司', dataIndex: 'evaluate_company' },
            ]"
            :data-source="[...detail.evaluates].reverse()"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'evaluate_method'">
                {{ EVALUATE_METHOD_OPTIONS.find((o) => o.value === record.evaluate_method)?.label ?? record.evaluate_method }}
              </template>
              <template v-else-if="column.dataIndex === 'evaluate_company'">
                {{ record.evaluate_company ?? '—' }}
              </template>
            </template>
          </Table>
        </TabPane>
      </Tabs>
    </div>

    <!-- 权证编辑 Modal（字段对齐后端 WarrantUpdate 评估字段子集） -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="编辑权证（评估信息）"
      @ok="submitEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Alert banner class="mb-3" message="评估日期 / 评估公司留空表示保持不变" type="info" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="评估方式">
          <SearchSelect
            v-model:value="editForm.evaluate_method"
            :disabled="!canUpdate"
            :options="EVALUATE_METHOD_OPTIONS"
            allow-clear
            placeholder="留空保持不变"
          />
        </FormItem>
        <FormItem label="评估值">
          <InputNumber
            v-model:value="editForm.evaluate_value"
            :disabled="!canUpdate"
            :min="0"
            class="w-full"
          />
        </FormItem>
        <FormItem label="评估日期">
          <DatePicker
            v-model:value="editForm.evaluate_date"
            :disabled="!canUpdate"
            class="w-full"
            value-format="YYYY-MM-DD"
          />
        </FormItem>
        <FormItem label="评估公司">
          <Input v-model:value="editForm.evaluate_company" :disabled="!canUpdate" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 所有权人编辑 Modal（字段对齐后端 OwnershipUpdate） -->
    <Modal
      v-model:open="ownerEditVisible"
      :confirm-loading="ownerEditLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="编辑所有权人"
      @ok="submitOwnerEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="所有权人">
          <Input :value="ownerEditForm.owner_name" disabled />
        </FormItem>
        <FormItem label="权证编号">
          <Input v-model:value="ownerEditForm.ownership_num" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="份额(%)">
          <InputNumber
            v-model:value="ownerEditForm.share_ratio"
            :disabled="!canUpdate"
            :max="100"
            :min="0"
            class="w-full"
            placeholder="留空表示共有"
          />
        </FormItem>
      </Form>
    </Modal>
  </Drawer>
</template>

