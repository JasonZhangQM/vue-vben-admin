<script lang="ts" setup>
/** 权证详情抽屉：基本信息 / 所有权人 / 房产 / 出入库(联动状态)/ 评估。 */

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
  Select,
  Table,
  Tabs,
  TabPane,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import RegionTreeSelect from '#/components/RegionTreeSelect/index.vue';
import { getCustomerDict, getHouseApps } from '#/api/basic/dict';
import { useDictStore } from '#/store/dict';
import { dash, opt } from '#/utils/format';

import {
  addEvaluate,
  addStorage,
  addWarrantConstruction,
  addWarrantGround,
  addWarrantHouse,
  addWarrantOwner,
  deleteWarrant,
  deleteWarrantConstruction,
  deleteWarrantGround,
  deleteWarrantHouse,
  deleteWarrantOwner,
  getWarrantDetail,
  updateWarrant,
  updateWarrantOwner,
} from '#/api/basic/warrant';

import { auctionStateColor, warrantStateColor } from './constants';

const props = defineProps<{ warrantId: null | number }>();
const emit = defineEmits<{ updated: [] }>();

const dictStore = useDictStore();

const open = defineModel<boolean>('open', { default: false });
const detail = ref<null | WarrantDetail>(null);
const loading = ref(false);

// 状态 → Tag 颜色映射已抽到 ./constants.ts(避免两处维护 + 拍卖/权证状态语义串用)

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

// ===== 编辑(WarrantUpdate 自由字段子集：评估字段) =====
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

// ===== 删除(收纳在抽屉内) =====
async function onDelete() {
  if (!detail.value) return;
  await deleteWarrant(detail.value.id);
  message.success('权证已删除');
  open.value = false;
  emit('updated');
}

// ===== 所有权人编辑(OwnershipUpdate 自由字段) =====
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

// ===== 出入库(联动主表状态) =====
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
  message.success('出入库登记成功(权证状态已联动)');
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

// ===== 客户远程搜索（detail-drawer 和 create-drawer 两处复用）=====
const remoteCustomerOptions = ref<{ label: string; value: number }[]>([]);
async function onSearchCustomer(keyword: string) {
  if (!keyword?.trim()) {
    remoteCustomerOptions.value = [];
    return;
  }
  try {
    const { items } = await getCustomerDict({ q: keyword.trim(), page: 1, page_size: 20 });
    remoteCustomerOptions.value = items.map((c: any) => ({
      label: `${c.name}(${c.genre === 1 ? '企业' : '个人'})`,
      value: c.id,
    }));
  } catch {
    remoteCustomerOptions.value = [];
  }
}

/** 房产用途选项(树形字典拍平) */
const houseAppOptions = ref<{ label: string; value: number }[]>([]);
async function loadHouseAppOptions() {
  if (houseAppOptions.value.length > 0) return;
  const flatten = (nodes: any[]) => {
    for (const n of nodes ?? []) {
      houseAppOptions.value.push({ label: n.name, value: n.id });
      flatten(n.children);
    }
  };
  flatten(await getHouseApps());
}

// ===== 所有权人添加 =====
const addOwnerForm = reactive({
  owner_id: undefined as number | undefined,
  ownership_num: '',
  share_ratio: undefined as number | undefined,
});

async function submitAddOwner() {
  if (!detail.value || !addOwnerForm.owner_id || !addOwnerForm.ownership_num?.trim()) {
    message.warning('请选择客户并填写产权证编号');
    return;
  }
  await addWarrantOwner(detail.value.id, {
    owner_id: addOwnerForm.owner_id,
    ownership_num: addOwnerForm.ownership_num.trim(),
    share_ratio: addOwnerForm.share_ratio,
  });
  Object.assign(addOwnerForm, { owner_id: undefined, ownership_num: '', share_ratio: undefined });
  remoteCustomerOptions.value = [];
  message.success('所有权人已添加');
  await refresh();
}

async function onDeleteOwner(record: any) {
  if (!detail.value) return;
  await deleteWarrantOwner(detail.value.id, record.id);
  message.success('所有权人已删除');
  await refresh();
}

// ===== 房产/土地/在建 添加 =====
const addHouseForm = reactive({
  region_id: undefined as number | undefined,
  house_locate: '',
  house_app: undefined as number | undefined,
  house_area: undefined as number | undefined,
  house_name: '',
  house_build_year: undefined as number | undefined,
  house_usage: 10 as number,
});
async function submitAddHouse() {
  if (!detail.value) return;
  const { region_id, house_locate, house_app, house_area } = addHouseForm;
  if (!region_id || !house_locate.trim() || !house_app || !house_area) {
    message.warning('请填写行政区域、详细地址、用途和面积');
    return;
  }
  await addWarrantHouse(detail.value.id, {
    region_id, house_locate: house_locate.trim(),
    house_app, house_area,
    house_name: addHouseForm.house_name || undefined,
    house_build_year: addHouseForm.house_build_year,
    house_usage: addHouseForm.house_usage,
  });
  Object.assign(addHouseForm, { region_id: undefined, house_locate: '', house_app: undefined, house_area: undefined, house_name: '', house_build_year: undefined, house_usage: 10 });
  message.success('房产已添加');
  await refresh();
}
async function onDeleteHouse(record: any) {
  if (!detail.value) return;
  await deleteWarrantHouse(detail.value.id, record.id);
  message.success('房产已删除');
  await refresh();
}

const addGroundForm = reactive({
  region_id: undefined as number | undefined,
  ground_locate: '',
  ground_app: '',
  ground_area: undefined as number | undefined,
});
async function submitAddGround() {
  if (!detail.value) return;
  const { region_id, ground_locate, ground_area } = addGroundForm;
  if (!region_id || !ground_locate.trim() || !ground_area) {
    message.warning('请填写行政区域、详细地址和面积');
    return;
  }
  await addWarrantGround(detail.value.id, {
    region_id, ground_locate: ground_locate.trim(),
    ground_app: addGroundForm.ground_app || undefined, ground_area,
  });
  Object.assign(addGroundForm, { region_id: undefined, ground_locate: '', ground_app: '', ground_area: undefined });
  message.success('土地已添加');
  await refresh();
}
async function onDeleteGround(record: any) {
  if (!detail.value) return;
  await deleteWarrantGround(detail.value.id, record.id);
  message.success('土地已删除');
  await refresh();
}

const addConstructionForm = reactive({
  region_id: undefined as number | undefined,
  construct_locate: '',
  construct_app: '',
  construct_area: undefined as number | undefined,
});
async function submitAddConstruction() {
  if (!detail.value) return;
  const { region_id, construct_locate, construct_app, construct_area } = addConstructionForm;
  if (!region_id || !construct_locate.trim() || !construct_app.trim() || !construct_area) {
    message.warning('请填写行政区域、详细地址、用途和面积');
    return;
  }
  await addWarrantConstruction(detail.value.id, {
    region_id, construct_locate: construct_locate.trim(),
    construct_app: construct_app.trim(), construct_area,
  });
  Object.assign(addConstructionForm, { region_id: undefined, construct_locate: '', construct_app: '', construct_area: undefined });
  message.success('在建工程已添加');
  await refresh();
}
async function onDeleteConstruction(record: any) {
  if (!detail.value) return;
  await deleteWarrantConstruction(detail.value.id, record.id);
  message.success('在建工程已删除');
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
              <Popconfirm title="确认删除该权证？(已入库/已流转权证将被拦截)" @confirm="onDelete">
                <Button danger size="small">删除</Button>
              </Popconfirm>
            </AccessControl>
          </div>
        </template>
        <Descriptions :column="4" size="small">
          <!-- 基础标识 -->
          <DescriptionsItem label="权证号">{{ dash(detail.warrant_num) }}</DescriptionsItem>
          <DescriptionsItem label="类型">{{ dash((detail as any).warrant_type_display) }}</DescriptionsItem>
          <DescriptionsItem label="所有权人" :span="4">
            {{ (detail.owner_names as string[])?.join('、') || '—' }}
          </DescriptionsItem>

          <!-- 状态/分类 -->
          <DescriptionsItem label="权证状态">
            <Tag :color="warrantStateColor((detail as any).warrant_state)">
              {{ dash((detail as any).warrant_state_display) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="拍卖状态">
            <Tag :color="auctionStateColor((detail as any).auction_state)">
              {{ dash((detail as any).auction_state_display) }}
            </Tag>
          </DescriptionsItem>

          <!-- 评估信息 -->
          <DescriptionsItem label="评估方式">{{ dash((detail as any).evaluate_method_display) }}</DescriptionsItem>
          <DescriptionsItem label="评估值">{{ (detail.evaluate_value as number)?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="评估日期">{{ dash((detail as any).evaluate_date) }}</DescriptionsItem>
          <DescriptionsItem label="评估机构">{{ dash((detail as any).evaluate_company) }}</DescriptionsItem>
          <DescriptionsItem label="评估说明" :span="4">{{ dash((detail as any).evaluate_explain) }}</DescriptionsItem>

          <!-- 流转时间 -->
          <DescriptionsItem label="入库会议">{{ dash((detail as any).meeting_date) }}</DescriptionsItem>
          <DescriptionsItem label="询价日期">{{ dash((detail as any).inquiry_date) }}</DescriptionsItem>
          <DescriptionsItem label="拍卖日期">{{ dash((detail as any).auction_date) }}</DescriptionsItem>
          <DescriptionsItem label="交易日期">{{ dash((detail as any).transaction_date) }}</DescriptionsItem>

          <!-- 拍卖金额 -->
          <DescriptionsItem label="起拍价">{{ (detail as any).listing_price?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="成交价">{{ (detail as any).auction_amount?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="拍卖说明" :span="4">{{ dash((detail as any).auction_remark) }}</DescriptionsItem>
          <DescriptionsItem label="入库说明" :span="4">{{ dash((detail as any).storage_explain) }}</DescriptionsItem>
          <DescriptionsItem label="询价详情" :span="4">{{ dash((detail as any).inquiry_detail) }}</DescriptionsItem>

          <!-- 审计信息 -->
          <DescriptionsItem label="登记人">{{ dash(detail.created_by_name) }}</DescriptionsItem>
          <DescriptionsItem label="登记时间" :span="3">{{ dash(detail.created_at) }}</DescriptionsItem>
        </Descriptions>
      </Card>

      <Tabs>
        <!-- 所有权人：内联添加表单 + 表格(首列链接打开编辑 Modal + 删除) -->
        <TabPane key="owners" :tab="`所有权人(${detail.owners?.length ?? 0})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <SearchSelect
              v-model:value="addOwnerForm.owner_id"
              remote
              :options="remoteCustomerOptions"
              placeholder="搜索客户 *"
              allow-clear
              style="width: 280px"
              @search="onSearchCustomer"
            />
            <Input v-model:value="addOwnerForm.ownership_num" placeholder="产权证编号 *" style="width: 220px" />
            <InputNumber
              v-model:value="addOwnerForm.share_ratio"
              :min="0"
              :max="100"
              :precision="2"
              placeholder="份额%(可空=共有)"
              style="width: 170px"
            />
            <AccessControl :codes="['warrant:update']" type="code">
              <Button size="small" type="primary" @click="submitAddOwner">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '姓名', dataIndex: 'owner_name' },
              { title: '权证编号', dataIndex: 'ownership_num' },
              { title: '份额(%)', dataIndex: 'share_ratio', width: 100 },
              { title: '操作', key: 'op', width: 80, align: 'center' },
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
              <template v-else-if="column.dataIndex === 'share_ratio'">
                {{ record.share_ratio ?? '—' }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['warrant:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteOwner(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 房产包(可独立添加/删除) -->
        <TabPane v-if="detail.warrant_type === 1" key="houses" :tab="`房产(${detail.houses?.length ?? 0})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <RegionTreeSelect v-model:value="addHouseForm.region_id" placeholder="行政区域 *" allow-clear style="width: 260px" />
            <Input v-model:value="addHouseForm.house_locate" placeholder="详细地址 *" style="width: 280px" />
            <Select
              v-model:value="addHouseForm.house_app"
              :options="houseAppOptions"
              placeholder="用途 *"
              style="width: 130px"
              show-search
              option-filter-prop="label"
              @focus="loadHouseAppOptions"
            />
            <InputNumber v-model:value="addHouseForm.house_area" :min="0.01" :precision="2" placeholder="面积㎡ *" style="width: 110px" />
            <Input v-model:value="addHouseForm.house_name" placeholder="建筑名称(可空)" style="width: 110px" />
            <InputNumber v-model:value="addHouseForm.house_build_year" :min="1900" :max="2100" :precision="0" placeholder="建成年份" style="width: 90px" />
            <Select
              v-model:value="addHouseForm.house_usage"
              :options="dictStore.get('warrant.house_usage')"
              placeholder="使用状态"
              style="width: 100px"
            />
            <AccessControl :codes="['warrant:update']" type="code">
              <Button size="small" type="primary" @click="submitAddHouse">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '行政区域', dataIndex: 'region_name', width: 180 },
              { title: '详细地址', dataIndex: 'house_locate', ellipsis: true },
              { title: '面积(㎡)', dataIndex: 'house_area', width: 90 },
              { title: '用途', dataIndex: 'house_usage', width: 70 },
              { title: '建成年份', dataIndex: 'house_build_year', width: 90 },
              { title: '操作', key: 'op', width: 80, align: 'center' },
            ]"
            :data-source="detail.houses"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'region_name'">
                {{ record.region_name || '—' }}
              </template>
              <template v-else-if="column.dataIndex === 'house_usage'">
                {{ dictStore.labelOf('warrant.house_usage', record.house_usage) }}
              </template>
              <template v-else-if="column.dataIndex === 'house_build_year'">
                {{ record.house_build_year ?? '—' }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['warrant:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteHouse(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 土地包(type=5) -->
        <TabPane v-if="detail.warrant_type === 5" key="grounds" :tab="`土地(${detail.grounds?.length ?? 0})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <RegionTreeSelect v-model:value="addGroundForm.region_id" placeholder="行政区域 *" allow-clear style="width: 260px" />
            <Input v-model:value="addGroundForm.ground_locate" placeholder="详细地址 *" style="width: 280px" />
            <Input v-model:value="addGroundForm.ground_app" placeholder="用途(可空)" style="width: 160px" />
            <InputNumber v-model:value="addGroundForm.ground_area" :min="0.01" :precision="2" placeholder="面积㎡ *" style="width: 140px" />
            <AccessControl :codes="['warrant:update']" type="code">
              <Button size="small" type="primary" @click="submitAddGround">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '行政区域', dataIndex: 'region_name', width: 180 },
              { title: '详细地址', dataIndex: 'ground_locate', ellipsis: true },
              { title: '面积(㎡)', dataIndex: 'ground_area', width: 90 },
              { title: '用途', dataIndex: 'ground_app' },
              { title: '操作', key: 'op', width: 80, align: 'center' },
            ]"
            :data-source="detail.grounds"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'region_name'">
                {{ record.region_name || '—' }}
              </template>
              <template v-else-if="column.dataIndex === 'ground_app'">
                {{ record.ground_app || '—' }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['warrant:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteGround(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 在建工程包(type=6) -->
        <TabPane v-if="detail.warrant_type === 6" key="constructions" :tab="`在建工程(${detail.constructions?.length ?? 0})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <RegionTreeSelect v-model:value="addConstructionForm.region_id" placeholder="行政区域 *" allow-clear style="width: 260px" />
            <Input v-model:value="addConstructionForm.construct_locate" placeholder="详细地址 *" style="width: 280px" />
            <Input v-model:value="addConstructionForm.construct_app" placeholder="用途 *" style="width: 160px" />
            <InputNumber v-model:value="addConstructionForm.construct_area" :min="0.01" :precision="2" placeholder="面积㎡ *" style="width: 140px" />
            <AccessControl :codes="['warrant:update']" type="code">
              <Button size="small" type="primary" @click="submitAddConstruction">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '行政区域', dataIndex: 'region_name', width: 180 },
              { title: '详细地址', dataIndex: 'construct_locate', ellipsis: true },
              { title: '面积(㎡)', dataIndex: 'construct_area', width: 90 },
              { title: '用途', dataIndex: 'construct_app' },
              { title: '操作', key: 'op', width: 80, align: 'center' },
            ]"
            :data-source="detail.constructions"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'region_name'">
                {{ record.region_name || '—' }}
              </template>
              <template v-else-if="column.dataIndex === 'construct_app'">
                {{ record.construct_app || '—' }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['warrant:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteConstruction(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 应收(type=11) -->
        <TabPane v-if="detail.receivable" key="receivable" tab="应收账款">
          <Descriptions :column="2" size="small" bordered>
            <DescriptionsItem label="说明" :span="2">{{ dash(detail.receivable.receivable_detail) }}</DescriptionsItem>
            <DescriptionsItem label="应收单位" :span="2">
              {{ (detail.receivable.receive_units ?? []).join('、') || '—' }}
            </DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 股权(type=21) -->
        <TabPane v-if="detail.stock" key="stock" tab="股权信息">
          <Descriptions :column="2" size="small" bordered>
            <DescriptionsItem label="标的公司">{{ dash(detail.stock.target) }}</DescriptionsItem>
            <DescriptionsItem label="股权类型">{{ dash(detail.stock.stock_type_display) }}</DescriptionsItem>
            <DescriptionsItem label="持股(%)">{{ detail.stock.ratio ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="注册资本">{{ detail.stock.registered_capital?.toLocaleString() ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="实缴资本">{{ detail.stock.paid_capital?.toLocaleString() ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="备注">{{ dash(detail.stock.remark) }}</DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 票据主表(type=31) -->
        <TabPane v-if="detail.draft" key="draft" tab="票据信息">
          <Descriptions :column="2" size="small" bordered>
            <DescriptionsItem label="票据类型">{{ dash(detail.draft.draft_type_display) }}</DescriptionsItem>
            <DescriptionsItem label="票面总额">{{ detail.draft.denomination?.toLocaleString() ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="票面信息" :span="2">{{ dash(detail.draft.draft_detail) }}</DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 票据明细(type=31 的子表) -->
        <TabPane
          v-if="detail.draft_extends && detail.draft_extends.length"
          :key="`draft-extends-${detail.id}`"
          :tab="`票据明细(${detail.draft_extends.length})`"
        >
          <Table
            :columns="[
              { title: '票据号', dataIndex: 'draft_num', ellipsis: true },
              { title: '类型', dataIndex: 'draft_type' },
              { title: '承兑人', dataIndex: 'acceptor_name' },
              { title: '核心企业', dataIndex: 'core_name' },
              { title: '金额', dataIndex: 'draft_amount' },
              { title: '出票日', dataIndex: 'issue_date' },
              { title: '到期日', dataIndex: 'due_date' },
              { title: '状态', dataIndex: 'draft_state' },
            ]"
            :data-source="detail.draft_extends"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'draft_amount'">
                {{ record.draft_amount?.toLocaleString() ?? '—' }}
              </template>
              <template v-else-if="column.dataIndex === 'acceptor_name' || column.dataIndex === 'core_name'">
                {{ dash(record[column.dataIndex]) }}
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 车辆(type=41) -->
        <TabPane v-if="detail.vehicle" key="vehicle" tab="车辆信息">
          <Descriptions :column="2" size="small" bordered>
            <DescriptionsItem label="车架号">{{ dash(detail.vehicle.frame_num) }}</DescriptionsItem>
            <DescriptionsItem label="车牌号">{{ dash(detail.vehicle.plate_num) }}</DescriptionsItem>
            <DescriptionsItem label="品牌型号" :span="2">{{ dash(detail.vehicle.vehicle_brand) }}</DescriptionsItem>
            <DescriptionsItem label="备注" :span="2">{{ dash(detail.vehicle.remark) }}</DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 动产(type=51) -->
        <TabPane v-if="detail.chattel" key="chattel" tab="动产信息">
          <Descriptions :column="2" size="small" bordered>
            <DescriptionsItem label="动产类型">{{ dash(detail.chattel.chattel_type_display) }}</DescriptionsItem>
            <DescriptionsItem label="说明" :span="2">{{ dash(detail.chattel.chattel_detail) }}</DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 其他(type=55) -->
        <TabPane v-if="detail.other" key="other" tab="其他权证">
          <Descriptions :column="2" size="small" bordered>
            <DescriptionsItem label="其他类型">{{ dash(detail.other.other_type_display) }}</DescriptionsItem>
            <DescriptionsItem label="成本">{{ detail.other.cost?.toLocaleString() ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="说明" :span="2">{{ dash(detail.other.other_detail) }}</DescriptionsItem>
            <!-- 商标子表(other_type=40) -->
            <template v-if="detail.other.patent">
              <DescriptionsItem label="商标名称">{{ dash(detail.other.patent.patent_name) }}</DescriptionsItem>
              <DescriptionsItem label="注册号">{{ dash(detail.other.patent.reg_num) }}</DescriptionsItem>
            </template>
            <!-- 软著子表(other_type=501) -->
            <template v-if="detail.other.software">
              <DescriptionsItem label="软件名称">{{ dash(detail.other.software.software_name) }}</DescriptionsItem>
              <DescriptionsItem label="软著号">{{ dash(detail.other.software.reg_num) }}</DescriptionsItem>
            </template>
          </Descriptions>
        </TabPane>

        <!-- 出入库记录 -->
        <TabPane key="storages" :tab="`出入库(${detail.storages?.length ?? 0})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <SearchSelect
              v-model:value="storageForm.storage_type"
              :options="dictStore.get('warrant.storage_type')"
              size="small"
              style="width: 120px"
            />
            <DatePicker v-model:value="storageForm.storage_date" value-format="YYYY-MM-DD" size="small" style="width: 150px" />
            <Input v-model:value="storageForm.storage_explain" placeholder="说明(可空)" size="small" style="width: 180px" />
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
                {{ dictStore.labelOf('warrant.storage_type', record.storage_type) }}
              </template>
              <template v-else-if="column.dataIndex === 'storage_explain'">
                {{ record.storage_explain ?? '—' }}
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 评估记录 -->
        <TabPane key="evaluates" :tab="`评估(${detail.evaluates?.length ?? 0})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <SearchSelect
              v-model:value="evaluateForm.evaluate_method"
              :options="dictStore.get('warrant.evaluate_method')"
              size="small"
              style="width: 110px"
            />
            <InputNumber v-model:value="evaluateForm.evaluate_value" placeholder="评估值" size="small" style="width: 120px" />
            <DatePicker v-model:value="evaluateForm.evaluate_date" value-format="YYYY-MM-DD" size="small" style="width: 150px" />
            <Input v-model:value="evaluateForm.evaluate_company" placeholder="评估公司(可空)" size="small" style="width: 160px" />
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
                {{ dictStore.labelOf('warrant.evaluate_method', record.evaluate_method) }}
              </template>
              <template v-else-if="column.dataIndex === 'evaluate_company'">
                {{ record.evaluate_company ?? '—' }}
              </template>
            </template>
          </Table>
        </TabPane>
      </Tabs>
    </div>

    <!-- 权证编辑 Modal(字段对齐后端 WarrantUpdate 评估字段子集) -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="编辑权证(评估信息)"
      @ok="submitEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Alert banner class="mb-3" message="评估日期 / 评估公司留空表示保持不变" type="info" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="评估方式">
          <SearchSelect
              v-model:value="editForm.evaluate_method"
              :disabled="!canUpdate"
              :options="dictStore.get('warrant.evaluate_method')"
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

    <!-- 所有权人编辑 Modal(字段对齐后端 OwnershipUpdate) -->
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
