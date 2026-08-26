<script lang="ts" setup>
/** 权证详情抽屉：基本信息 / 所有权人 / 房产 / 出入库（联动状态）/ 评估。 */

import type { WarrantDetail } from '#/api/basic/warrant';

import { reactive, ref, watch } from 'vue';

import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Input,
  InputNumber,
  message,
  Select,
  Table,
  Tabs,
  TabPane,
  Tag,
} from 'ant-design-vue';

import { addEvaluate, addStorage, getWarrantDetail } from '#/api/basic/warrant';

const props = defineProps<{ warrantId: null | number }>();
const emit = defineEmits<{ updated: [] }>();

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

async function load() {
  if (!props.warrantId) return;
  loading.value = true;
  try {
    detail.value = await getWarrantDetail(props.warrantId);
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
  await load();
  emit('updated');
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
  await load();
  emit('updated');
}
</script>

<template>
  <Drawer v-model:open="open" :title="detail ? `权证 ${detail.warrant_num}` : '权证详情'" width="720">
    <div v-if="detail" class="space-y-4">
      <Card size="small" title="基本信息">
        <Descriptions :column="2" size="small">
          <DescriptionsItem label="权证号">{{ detail.warrant_num }}</DescriptionsItem>
          <DescriptionsItem label="类型">{{ TYPE_LABELS[detail.warrant_type] ?? detail.warrant_type }}</DescriptionsItem>
          <DescriptionsItem label="状态">
            <Tag :color="STATE_COLOR[detail.warrant_state] ?? 'default'">
              {{ detail.warrant_state }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="评估值">
            {{ detail.evaluate_value?.toLocaleString() ?? '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="登记人">{{ detail.created_by_name }}</DescriptionsItem>
          <DescriptionsItem label="登记时间">{{ detail.created_at }}</DescriptionsItem>
        </Descriptions>
      </Card>

      <Tabs>
        <!-- 所有权人 -->
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
              <template v-if="column.dataIndex === 'share_ratio'">
                {{ record.share_ratio ?? '共有' }}
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 房产包 -->
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
            <Select
              v-model:value="storageForm.storage_type"
              :options="STORAGE_TYPE_OPTIONS"
              size="small"
              style="width: 120px"
            />
            <Input v-model:value="storageForm.storage_date" placeholder="日期 2026-01-01" size="small" style="width: 140px" />
            <Input v-model:value="storageForm.storage_explain" placeholder="说明（可空）" size="small" style="width: 180px" />
            <Button size="small" type="primary" @click="submitStorage">登记</Button>
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
            <Select
              v-model:value="evaluateForm.evaluate_method"
              :options="EVALUATE_METHOD_OPTIONS"
              size="small"
              style="width: 110px"
            />
            <InputNumber v-model:value="evaluateForm.evaluate_value" placeholder="评估值" size="small" style="width: 120px" />
            <Input v-model:value="evaluateForm.evaluate_date" placeholder="日期 2026-01-01" size="small" style="width: 140px" />
            <Input v-model:value="evaluateForm.evaluate_company" placeholder="评估公司（可空）" size="small" style="width: 160px" />
            <Button size="small" type="primary" @click="submitEvaluate">添加</Button>
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
  </Drawer>
</template>
