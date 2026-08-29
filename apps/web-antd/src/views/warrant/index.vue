<script lang="ts" setup>
/** 权证管理：列表 / 创建（主表 + 类型扩展 + 所有权人）/ 详情抽屉。 */

import type { CustomerDictItem } from '#/api/basic/dict';
import type { WarrantListItem } from '#/api/basic/warrant';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Divider,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Table,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';

import { useRowHighlight } from '#/composables/useRowHighlight';
import { dash } from '#/utils/format';

import { getCustomerDict, getHouseApps } from '#/api/basic/dict';
import { createWarrant, getWarrantList } from '#/api/basic/warrant';

import DetailDrawer from './detail-drawer.vue';

// 枚举（与后端 warrant/enums.py 对齐）
const TYPE_OPTIONS = [
  { label: '房产', value: 1 },
  { label: '土地', value: 5 },
  { label: '在建工程', value: 6 },
  { label: '应收账款', value: 11 },
  { label: '股权', value: 21 },
  { label: '票据', value: 31 },
  { label: '车辆', value: 41 },
  { label: '动产', value: 51 },
  { label: '其他', value: 55 },
];
const STATE_OPTIONS = [
  { label: '未入库', value: 10 },
  { label: '已入库', value: 20 },
  { label: '已加保', value: 30 },
  { label: '无需入库', value: 60 },
  { label: '已借出', value: 210 },
  { label: '解保出库', value: 310 },
  { label: '已移交', value: 410 },
  { label: '已注销', value: 990 },
];
const DRAFT_MAIN_TYPE_OPTIONS = [
  { label: '商业承兑', value: 10 },
  { label: '银行承兑', value: 20 },
  { label: '支票', value: 30 },
];
const HOUSE_USAGE_OPTIONS = [
  { label: '自用', value: 10 },
  { label: '出租', value: 20 },
  { label: '空置', value: 30 },
];

const typeLabel = (v: number) => TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
const stateLabel = (v: number) => STATE_OPTIONS.find((o) => o.value === v)?.label ?? v;
const stateColor = (s: number) =>
  ({ 10: 'default', 20: 'green', 30: 'blue', 60: 'default', 210: 'orange', 310: 'red', 410: 'purple', 990: 'red' })[s] ?? 'default';

// ================= 列表 =================
const loading = ref(false);
const list = ref<WarrantListItem[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  page_size: 20,
  q: '',
  warrant_type: undefined as number | undefined,
  warrant_state: undefined as number | undefined,
});

async function loadList() {
  loading.value = true;
  try {
    const data = await getWarrantList(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

/** 重置：清空全部筛选条件并回到第 1 页重新查询 */
function resetQuery() {
  query.q = '';
  query.warrant_type = undefined;
  query.warrant_state = undefined;
  query.page = 1;
  loadList();
}

// ================= 详情 =================
const detailOpen = ref(false);
const detailWarrantId = ref<null | number>(null);

// 表格行点击高亮（useRowHighlight composable 全局共享）
const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

function openDetail(row: any) {
  highlightRow(row); // 打开详情即高亮该行
  detailWarrantId.value = row.id;
  detailOpen.value = true;
}

// ================= 新建 =================
const createVisible = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  warrant_num: '',
  warrant_type: 1 as number,
  // 土地
  ground_locate: '',
  ground_app: '',
  ground_area: undefined as number | undefined,
  // 票据
  draft_type: 20,
  denomination: undefined as number | undefined,
  draft_detail: '',
  // 车辆
  frame_num: '',
  plate_num: '',
  vehicle_brand: '',
  // 动产 / 其他 / 应收
  chattel_type: 10,
  chattel_detail: '',
  other_type: 99,
  other_detail: '',
  receivable_detail: '',
});

// 所有权人动态行（统一走 ownerships 中间表）
interface OwnerRow {
  owner_id: number | undefined;
  ownership_num: string;
  share_ratio: number | undefined;
}
const ownerRows = ref<OwnerRow[]>([{ owner_id: undefined, ownership_num: '', share_ratio: undefined }]);

// 房产动态行（房产 1:N 房产包模式）
interface HouseRow {
  house_locate: string;
  house_app: number | undefined;
  house_area: number | undefined;
  house_name: string;
  house_build_year: number | undefined;
  house_usage: number;
}
const houseRows = ref<HouseRow[]>([{
  house_locate: '', house_app: undefined, house_area: undefined,
  house_name: '', house_build_year: undefined, house_usage: 10,
}]);

// 下拉数据
const customerOptions = ref<{ label: string; value: number }[]>([]);
const houseAppOptions = ref<{ label: string; value: number }[]>([]);

async function loadOptions() {
  const [customers, houseApps] = await Promise.all([getCustomerDict(), getHouseApps()]);
  customerOptions.value = customers.map((c: CustomerDictItem) => ({
    label: `${c.name}（${c.genre === 1 ? '企业' : '个人'}）`,
    value: c.id,
  }));
  // 房产用途树展平为选项
  const flatten = (nodes: any[]) => {
    for (const n of nodes ?? []) {
      houseAppOptions.value.push({ label: n.name, value: n.id });
      flatten(n.children);
    }
  };
  flatten(houseApps);
}

function openCreate() {
  Object.assign(createForm, {
    warrant_num: '', warrant_type: 1,
    ground_locate: '', ground_app: '', ground_area: undefined,
    draft_type: 20, denomination: undefined, draft_detail: '',
    frame_num: '', plate_num: '', vehicle_brand: '',
    chattel_type: 10, chattel_detail: '',
    other_type: 99, other_detail: '', receivable_detail: '',
  });
  ownerRows.value = [{ owner_id: undefined, ownership_num: '', share_ratio: undefined }];
  houseRows.value = [{
    house_locate: '', house_app: undefined, house_area: undefined,
    house_name: '', house_build_year: undefined, house_usage: 10,
  }];
  createVisible.value = true;
}

function addOwnerRow() {
  ownerRows.value.push({ owner_id: undefined, ownership_num: '', share_ratio: undefined });
}
function removeOwnerRow(index: number) {
  ownerRows.value.splice(index, 1);
}
function addHouseRow() {
  houseRows.value.push({
    house_locate: '', house_app: undefined, house_area: undefined,
    house_name: '', house_build_year: undefined, house_usage: 10,
  });
}
function removeHouseRow(index: number) {
  houseRows.value.splice(index, 1);
}

async function submitCreate() {
  if (!createForm.warrant_num) {
    message.warning('请填写权证号');
    return;
  }
  const owners = ownerRows.value.filter((o) => o.owner_id && o.ownership_num);
  if (owners.length === 0) {
    message.warning('请至少填写一行完整所有权人（客户 + 权证编号）');
    return;
  }
  // 按类型组装扩展（仅提交对应类型，避免无关字段）
  let houses: object[] | undefined;
  let ground: object | undefined;
  let draft: object | undefined;
  let vehicle: object | undefined;
  let chattel: object | undefined;
  let other: object | undefined;
  let receivable: object | undefined;

  switch (createForm.warrant_type) {
    case 1: {
      const valid = houseRows.value.filter((h) => h.house_locate && h.house_app && h.house_area);
      if (valid.length === 0) {
        message.warning('房产权证需至少一行完整房产（坐落/用途/面积）');
        return;
      }
      houses = valid.map((h) => ({
        house_locate: h.house_locate,
        house_app: h.house_app,
        house_area: h.house_area,
        house_name: h.house_name || undefined,
        house_build_year: h.house_build_year ?? undefined,
        house_usage: h.house_usage,
      }));
      break;
    }
    case 5: {
      if (!createForm.ground_locate || !createForm.ground_area) {
        message.warning('请填写土地坐落与面积');
        return;
      }
      ground = {
        ground_locate: createForm.ground_locate,
        ground_app: createForm.ground_app,
        ground_area: createForm.ground_area,
      };
      break;
    }
    case 31: {
      if (!createForm.denomination || !createForm.draft_detail) {
        message.warning('请填写票据面额与票面信息');
        return;
      }
      draft = {
        draft_type: createForm.draft_type,
        denomination: createForm.denomination,
        draft_detail: createForm.draft_detail,
      };
      break;
    }
    case 41: {
      if (!createForm.frame_num || !createForm.plate_num || !createForm.vehicle_brand) {
        message.warning('请填写车架号、车牌与品牌');
        return;
      }
      vehicle = {
        frame_num: createForm.frame_num,
        plate_num: createForm.plate_num,
        vehicle_brand: createForm.vehicle_brand,
      };
      break;
    }
    case 11: {
      if (!createForm.receivable_detail) {
        message.warning('请填写应收账款说明');
        return;
      }
      receivable = { receivable_detail: createForm.receivable_detail };
      break;
    }
    case 51: {
      if (!createForm.chattel_detail) {
        message.warning('请填写动产说明');
        return;
      }
      chattel = { chattel_type: createForm.chattel_type, chattel_detail: createForm.chattel_detail };
      break;
    }
    case 55: {
      if (!createForm.other_detail) {
        message.warning('请填写其他权证说明');
        return;
      }
      other = { other_type: createForm.other_type, cost: 0, other_detail: createForm.other_detail };
      break;
    }
    default:
      break;
  }

  createLoading.value = true;
  try {
    await createWarrant({
      warrant_num: createForm.warrant_num,
      warrant_type: createForm.warrant_type,
      owners: owners.map((o) => ({
        owner_id: o.owner_id!,
        ownership_num: o.ownership_num,
        share_ratio: o.share_ratio ?? undefined,
      })),
      houses,
      ground,
      draft,
      vehicle,
      chattel,
      other,
      receivable,
    } as any);
    message.success('权证已创建');
    createVisible.value = false;
    await loadList();
  } finally {
    createLoading.value = false;
  }
}

const columns: TableColumnType[] = [
  { title: '权证号', dataIndex: 'warrant_num' }, // 详情入口链接列：不加 ellipsis
  { title: '类型', dataIndex: 'warrant_type', ellipsis: true },
  { title: '状态', dataIndex: 'warrant_state', ellipsis: true },
  { title: '评估值', dataIndex: 'evaluate_value', ellipsis: true },
  { title: '登记时间', dataIndex: 'created_at', ellipsis: true },
  { title: '登记人', dataIndex: 'created_by_name', ellipsis: true },
];

onMounted(() => {
  loadList();
  loadOptions();
});
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <!-- 筛选区：独立 Card -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.q"
          allow-clear
          placeholder="权证号"
          style="width: 200px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <SearchSelect
          v-model:value="query.warrant_type"
          :options="TYPE_OPTIONS"
          allow-clear
          placeholder="类型"
          style="width: 120px"
        />
        <SearchSelect
          v-model:value="query.warrant_state"
          :options="STATE_OPTIONS"
          allow-clear
          placeholder="状态"
          style="width: 120px"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <div class="flex-1" />
        <AccessControl :codes="['warrant:create']" type="code">
          <Button type="primary" @click="openCreate">新增权证</Button>
        </AccessControl>
      </div>
    </Card>

    <!-- 数据区：Card 与 Table 均 size="small" 紧凑布局 -->
    <Card size="small">
      <Table
        :columns="columns"
        :custom-row="customRow"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number) => { query.page = p; loadList(); },
          onShowSizeChange: (_c: number, s: number) => { query.page = 1; query.page_size = s; loadList(); },
        }"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'warrant_num'">
            <!-- 权证号列即详情入口（不加 ellipsis） -->
            <a @click="openDetail(record)">{{ record.warrant_num }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'warrant_type'">
            {{ typeLabel(record.warrant_type) }}
          </template>
          <template v-else-if="column.dataIndex === 'warrant_state'">
            <Tag :color="stateColor(record.warrant_state)">
              {{ stateLabel(record.warrant_state) }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'evaluate_value'">
            {{ record.evaluate_value?.toLocaleString() ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'created_by_name'">
            {{ dash(record.created_by_name) }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建权证 -->
    <Modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      :width="760"
      title="新增权证"
      @ok="submitCreate"
    >
      <Form
        :label-col="{ span: 7 }"
        :wrapper-col="{ span: 15 }"
        class="max-h-[60vh] overflow-y-auto pr-2"
      >
        <FormItem label="权证号" required>
          <Input v-model:value="createForm.warrant_num" placeholder="不动产权证号 / 票据号等" />
        </FormItem>
        <FormItem label="权证类型" required>
          <SearchSelect v-model:value="createForm.warrant_type" :options="TYPE_OPTIONS" />
        </FormItem>

        <!-- 房产扩展（1:N 房产包） -->
        <template v-if="createForm.warrant_type === 1">
          <Divider class="my-3 text-xs">房产包（可多套）</Divider>
          <div v-for="(h, i) in houseRows" :key="i" class="mb-3 border-l-2 border-blue-100 pl-3">
            <div class="flex flex-wrap items-center gap-2">
              <Input v-model:value="h.house_locate" placeholder="坐落地址" style="width: 200px" />
              <SearchSelect
                v-model:value="h.house_app"
                :options="houseAppOptions"
                placeholder="用途分类"
                style="width: 130px"
              />
              <InputNumber v-model:value="h.house_area" placeholder="面积㎡" style="width: 100px" />
              <SearchSelect v-model:value="h.house_usage" :options="HOUSE_USAGE_OPTIONS" style="width: 90px" />
              <InputNumber v-model:value="h.house_build_year" placeholder="建成年份" style="width: 100px" />
              <Button v-if="houseRows.length > 1" danger size="small" @click="removeHouseRow(i)">删行</Button>
            </div>
          </div>
          <FormItem :wrapper-col="{ offset: 7 }">
            <Button size="small" @click="addHouseRow">+ 添加房产</Button>
          </FormItem>
        </template>

        <!-- 土地扩展 -->
        <template v-else-if="createForm.warrant_type === 5">
          <Divider class="my-3 text-xs">土地信息</Divider>
          <FormItem label="坐落" required>
            <Input v-model:value="createForm.ground_locate" />
          </FormItem>
          <FormItem label="用途">
            <Input v-model:value="createForm.ground_app" placeholder="如：工业用地" />
          </FormItem>
          <FormItem label="面积(㎡)" required>
            <InputNumber v-model:value="createForm.ground_area" :min="0.01" />
          </FormItem>
        </template>

        <!-- 票据扩展 -->
        <template v-else-if="createForm.warrant_type === 31">
          <Divider class="my-3 text-xs">票据信息</Divider>
          <FormItem label="票据主类型" required>
            <SearchSelect v-model:value="createForm.draft_type" :options="DRAFT_MAIN_TYPE_OPTIONS" />
          </FormItem>
          <FormItem label="面额" required>
            <InputNumber v-model:value="createForm.denomination" :min="0.01" placeholder="元" />
          </FormItem>
          <FormItem label="票面信息" required>
            <Input v-model:value="createForm.draft_detail" placeholder="出票人 / 到期日等" />
          </FormItem>
        </template>

        <!-- 车辆扩展 -->
        <template v-else-if="createForm.warrant_type === 41">
          <Divider class="my-3 text-xs">车辆信息</Divider>
          <FormItem label="车架号" required>
            <Input v-model:value="createForm.frame_num" />
          </FormItem>
          <FormItem label="车牌号" required>
            <Input v-model:value="createForm.plate_num" />
          </FormItem>
          <FormItem label="品牌型号" required>
            <Input v-model:value="createForm.vehicle_brand" />
          </FormItem>
        </template>

        <!-- 应收账款 -->
        <template v-else-if="createForm.warrant_type === 11">
          <Divider class="my-3 text-xs">应收账款</Divider>
          <FormItem label="说明" required>
            <Input v-model:value="createForm.receivable_detail" placeholder="应收账款详情" />
          </FormItem>
        </template>

        <!-- 动产 -->
        <template v-else-if="createForm.warrant_type === 51">
          <Divider class="my-3 text-xs">动产信息</Divider>
          <FormItem label="动产类型">
            <SearchSelect
              v-model:value="createForm.chattel_type"
              :options="[
                { label: '存货', value: 10 },
                { label: '机器设备', value: 20 },
                { label: '医疗设备', value: 30 },
                { label: '动产', value: 99 },
              ]"
            />
          </FormItem>
          <FormItem label="说明" required>
            <Input v-model:value="createForm.chattel_detail" />
          </FormItem>
        </template>

        <!-- 其他 -->
        <template v-else-if="createForm.warrant_type === 55">
          <Divider class="my-3 text-xs">其他权证</Divider>
          <FormItem label="类型">
            <SearchSelect
              v-model:value="createForm.other_type"
              :options="[
                { label: '购房合同', value: 10 },
                { label: '车辆合格证', value: 20 },
                { label: '专利', value: 30 },
                { label: '商标', value: 40 },
                { label: '软件著作权', value: 501 },
                { label: '账户', value: 70 },
                { label: '其他', value: 99 },
              ]"
            />
          </FormItem>
          <FormItem label="说明" required>
            <Input v-model:value="createForm.other_detail" />
          </FormItem>
        </template>

        <!-- 所有权人（所有类型通用） -->
        <Divider class="my-3 text-xs">所有权人（统一中间表，支持共有）</Divider>
        <div v-for="(o, i) in ownerRows" :key="i" class="mb-3 border-l-2 border-green-100 pl-3">
          <div class="flex flex-wrap items-center gap-2">
            <SearchSelect
              v-model:value="o.owner_id"
              :options="customerOptions"
              placeholder="选择客户"
              style="width: 220px"
            />
            <Input v-model:value="o.ownership_num" placeholder="权证编号" style="width: 180px" />
            <InputNumber v-model:value="o.share_ratio" placeholder="份额% (可空=共有)" style="width: 150px" />
            <Button v-if="ownerRows.length > 1" danger size="small" @click="removeOwnerRow(i)">删行</Button>
          </div>
        </div>
        <FormItem :wrapper-col="{ offset: 7 }">
          <Button size="small" @click="addOwnerRow">+ 添加所有权人</Button>
        </FormItem>
      </Form>
    </Modal>

    <!-- 权证详情抽屉 -->
    <DetailDrawer v-model:open="detailOpen" :warrant-id="detailWarrantId" @updated="loadList" />
  </Page>
</template>

