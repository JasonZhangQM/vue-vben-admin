<script lang="ts" setup>
/** 新增权证抽屉：分区 Card(基本信息 / 类型扩展 / 所有权人)+ 真实校验 + 类型切换保护。
 *
 * 从 index.vue 抽出(复用优先)：payload 组装逻辑沿用已验证版本，后端零改动。
 */

import type { FormInstance } from 'ant-design-vue';
import type { TableColumnType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  Button,
  Card,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Table,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDictStore } from '#/store/dict';

import type { WarrantCreateParams } from '#/api/basic/warrant';

import { getCustomerDict, getHouseApps } from '#/api/basic/dict';
import { createWarrant } from '#/api/basic/warrant';

const emit = defineEmits<{ created: [] }>();
const open = defineModel<boolean>('open', { default: false });

const dictStore = useDictStore();

// 枚举值常量(代码判断用，镜像后端 warrant/enums.py)
const WARRANT_TYPE_HOUSE = 1;
const WARRANT_TYPE_GROUND = 5;
const WARRANT_TYPE_CONSTRUCTION = 6;
const WARRANT_TYPE_RECEIVABLE = 11;
const WARRANT_TYPE_STOCK = 21;
const WARRANT_TYPE_DRAFT = 31;
const WARRANT_TYPE_VEHICLE = 41;
const WARRANT_TYPE_CHATTEL = 51;
const WARRANT_TYPE_OTHER = 55;

// 类型扩展区标题(分区 Card 标题随类型动态变化)
const EXT_TITLES: Record<number, string> = {
  1: '房产信息(支持多套)',
  5: '土地信息',
  6: '在建工程信息',
  11: '应收账款信息',
  21: '股权信息',
  31: '票据信息',
  41: '车辆信息',
  51: '动产信息',
  55: '其他权证信息',
};

// ================= 主表单 =================

const formRef = ref<FormInstance>();
const submitting = ref(false);
// 首次提交校验失败后置 true：动态行必填空单元格标红
const attempted = ref(false);

const createForm = reactive({
  warrant_num: '',
  warrant_type: 1 as number,
  // 土地
  ground_locate: '',
  ground_app: '',
  ground_area: undefined as number | undefined,
  // 在建工程
  construct_locate: '',
  construct_app: '',
  construct_area: undefined as number | undefined,
  // 股权
  stock_type: 10,
  stock_target: '',
  stock_ratio: undefined as number | undefined,
  stock_registered_capital: 0,
  stock_paid_capital: 0,
  stock_remark: '',
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

const rules = {
  warrant_num: [{ required: true, message: '请填写权证号' }],
  warrant_type: [{ required: true, message: '请选择权证类型' }],
};

// ================= 动态行(可编辑表格) =================

interface OwnerRow {
  owner_id: number | undefined;
  ownership_num: string;
  share_ratio: number | undefined;
  _key: number;
}
interface HouseRow {
  house_locate: string;
  house_app: number | undefined;
  house_area: number | undefined;
  house_name: string;
  house_build_year: number | undefined;
  house_usage: number;
  _key: number;
}

let rowKeySeq = 0;
const nextKey = () => ++rowKeySeq;

const emptyHouseRow = (): HouseRow => ({
  house_locate: '', house_app: undefined, house_area: undefined,
  house_name: '', house_build_year: undefined, house_usage: 10,
  _key: nextKey(),
});
const emptyOwnerRow = (): OwnerRow => ({
  owner_id: undefined, ownership_num: '', share_ratio: undefined,
  _key: nextKey(),
});

const houseRows = ref<HouseRow[]>([emptyHouseRow()]);
const ownerRows = ref<OwnerRow[]>([emptyOwnerRow()]);

// 可编辑表格列：必填列标题带 *，行内输入组件经 bodyCell 插槽渲染
const houseColumns: TableColumnType[] = [
  { title: '坐落地址 *', dataIndex: 'house_locate' },
  { title: '用途分类 *', dataIndex: 'house_app', width: 150 },
  { title: '面积㎡ *', dataIndex: 'house_area', width: 130 },
  { title: '性质', dataIndex: 'house_usage', width: 110 },
  { title: '建成年份', dataIndex: 'house_build_year', width: 110 },
  { title: '操作', dataIndex: '_op', width: 60 },
];
const ownerColumns: TableColumnType[] = [
  { title: '客户 *', dataIndex: 'owner_id' },
  { title: '权证编号 *', dataIndex: 'ownership_num' },
  { title: '份额%(可空=共有)', dataIndex: 'share_ratio', width: 160 },
  { title: '操作', dataIndex: '_op', width: 60 },
];

function addHouseRow() {
  houseRows.value.push(emptyHouseRow());
}
function removeHouseRow(index: number) {
  houseRows.value.splice(index, 1);
}
function addOwnerRow() {
  ownerRows.value.push(emptyOwnerRow());
}
function removeOwnerRow(index: number) {
  ownerRows.value.splice(index, 1);
}

// ================= 下拉数据 =================

const customerOptions = ref<{ label: string; value: number }[]>([]);
const houseAppOptions = ref<{ label: string; value: number }[]>([]);

async function loadOptions() {
  const [customers, houseApps] = await Promise.all([getCustomerDict(), getHouseApps()]);
  customerOptions.value = customers.map((c) => ({
    label: `${c.name}(${c.genre === 1 ? '企业' : '个人'})`,
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

// ================= 类型切换保护 =================

/** 已填扩展数据时切换类型：确认后清空，取消则回退 */
let lastType = 1;
function onTypeChange(value: number) {
  if (value === lastType) return;
  if (isExtDirty()) {
    Modal.confirm({
      title: '切换权证类型',
      content: '切换类型将清空已填写的类型扩展信息，确认切换？',
      okText: '切换',
      cancelText: '取消',
      onOk: () => {
        lastType = value;
        resetExtFields();
      },
      onCancel: () => {
        createForm.warrant_type = lastType;
      },
    });
  } else {
    lastType = value;
  }
}

/** 当前类型的扩展区是否已有填写内容 */
function isExtDirty(): boolean {
  if (createForm.warrant_type === WARRANT_TYPE_HOUSE) {
    return houseRows.value.some(
      (h) => h.house_locate || h.house_app || h.house_area || h.house_name || h.house_build_year,
    );
  }
  const fieldsByType: Record<number, (string | number | undefined)[]> = {
    5: [createForm.ground_locate, createForm.ground_app, createForm.ground_area],
    6: [createForm.construct_locate, createForm.construct_app, createForm.construct_area],
    21: [createForm.stock_target, createForm.stock_ratio, createForm.stock_remark],
    31: [createForm.denomination, createForm.draft_detail],
    41: [createForm.frame_num, createForm.plate_num, createForm.vehicle_brand],
    11: [createForm.receivable_detail],
    51: [createForm.chattel_detail],
    55: [createForm.other_detail],
  };
  return (fieldsByType[createForm.warrant_type] ?? []).some(
    (v) => v !== '' && v !== undefined && v !== 0,
  );
}

/** 清空全部类型扩展字段(切换确认后调用) */
function resetExtFields() {
  Object.assign(createForm, {
    ground_locate: '', ground_app: '', ground_area: undefined,
    construct_locate: '', construct_app: '', construct_area: undefined,
    stock_type: 10, stock_target: '', stock_ratio: undefined,
    stock_registered_capital: 0, stock_paid_capital: 0, stock_remark: '',
    draft_type: 20, denomination: undefined, draft_detail: '',
    frame_num: '', plate_num: '', vehicle_brand: '',
    chattel_type: 10, chattel_detail: '',
    other_type: 99, other_detail: '', receivable_detail: '',
  });
  houseRows.value = [emptyHouseRow()];
}

// ================= 提交 =================

const extTitle = computed(() => EXT_TITLES[createForm.warrant_type] ?? '类型信息');

/** 校验动态行(可编辑表格无绑定 rules，手动校验 + attempted 标红) */
function validateExt(): { ext?: object; houses?: object[] } | null {
  switch (createForm.warrant_type) {
    case WARRANT_TYPE_HOUSE: {
      const hasAny = houseRows.value.some(
        (h) => h.house_locate || h.house_app || h.house_area,
      );
      const valid = houseRows.value.filter((h) => h.house_locate && h.house_app && h.house_area);
      if (valid.length === 0) {
        message.warning(hasAny ? '房产行信息不完整(坐落 / 用途 / 面积均为必填)' : '房产权证需至少填写一行完整房产');
        return null;
      }
      if (hasAny && valid.length < houseRows.value.filter((h) => h.house_locate || h.house_app || h.house_area).length) {
        message.warning('存在信息不完整的房产行(坐落 / 用途 / 面积均为必填)，请补全或删除');
        return null;
      }
      return {
        houses: valid.map((h) => ({
          house_locate: h.house_locate,
          house_app: h.house_app,
          house_area: h.house_area,
          house_name: h.house_name || undefined,
          house_build_year: h.house_build_year ?? undefined,
          house_usage: h.house_usage,
        })),
      };
    }
    case WARRANT_TYPE_GROUND: {
      if (!createForm.ground_locate || !createForm.ground_area) {
        message.warning('请填写土地坐落与面积');
        return null;
      }
      return { ext: { ground_locate: createForm.ground_locate, ground_app: createForm.ground_app, ground_area: createForm.ground_area } };
    }
    case WARRANT_TYPE_CONSTRUCTION: {
      if (!createForm.construct_locate || !createForm.construct_area) {
        message.warning('请填写在建工程坐落与面积');
        return null;
      }
      return { ext: { construct_locate: createForm.construct_locate, construct_app: createForm.construct_app, construct_area: createForm.construct_area } };
    }
    case WARRANT_TYPE_STOCK: {
      if (!createForm.stock_target || !createForm.stock_ratio) {
        message.warning('请填写标的公司与持股比例');
        return null;
      }
      return {
        ext: {
          stock_type: createForm.stock_type,
          target: createForm.stock_target,
          ratio: createForm.stock_ratio,
          registered_capital: createForm.stock_registered_capital,
          paid_capital: createForm.stock_paid_capital,
          remark: createForm.stock_remark || undefined,
        },
      };
    }
    case WARRANT_TYPE_DRAFT: {
      if (!createForm.denomination || !createForm.draft_detail) {
        message.warning('请填写票据面额与票面信息');
        return null;
      }
      return { ext: { draft_type: createForm.draft_type, denomination: createForm.denomination, draft_detail: createForm.draft_detail } };
    }
    case WARRANT_TYPE_VEHICLE: {
      if (!createForm.frame_num || !createForm.plate_num || !createForm.vehicle_brand) {
        message.warning('请填写车架号、车牌与品牌型号');
        return null;
      }
      return { ext: { frame_num: createForm.frame_num, plate_num: createForm.plate_num, vehicle_brand: createForm.vehicle_brand } };
    }
    case WARRANT_TYPE_RECEIVABLE: {
      if (!createForm.receivable_detail) {
        message.warning('请填写应收账款说明');
        return null;
      }
      return { ext: { receivable_detail: createForm.receivable_detail } };
    }
    case WARRANT_TYPE_CHATTEL: {
      if (!createForm.chattel_detail) {
        message.warning('请填写动产说明');
        return null;
      }
      return { ext: { chattel_type: createForm.chattel_type, chattel_detail: createForm.chattel_detail } };
    }
    case WARRANT_TYPE_OTHER: {
      if (!createForm.other_detail) {
        message.warning('请填写其他权证说明');
        return null;
      }
      return { ext: { other_type: createForm.other_type, cost: 0, other_detail: createForm.other_detail } };
    }
    default:
      return {};
  }
}

/** 校验所有权人行：全空行忽略；部分填写(客户或权证编号缺失)报错定位行号 */
function validateOwners() {
  const rows = ownerRows.value;
  for (let i = 0; i < rows.length; i++) {
    const { owner_id, ownership_num, share_ratio } = rows[i]!;
    const hasAny = owner_id || ownership_num || share_ratio !== undefined;
    if (hasAny && (!owner_id || !ownership_num)) {
      message.warning(`第 ${i + 1} 行所有权人信息不完整(客户与权证编号均为必填)`);
      return null;
    }
  }
  const owners = rows.filter((o) => o.owner_id && o.ownership_num);
  if (owners.length === 0) {
    message.warning('请至少填写一行完整所有权人(客户 + 权证编号)');
    return null;
  }
  return owners;
}

async function onSubmit() {
  // 1) 主表单 rules 校验(错误就地标红)
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  // 2) 类型扩展 + 所有权人动态行校验
  const extResult = validateExt();
  if (extResult === null) {
    attempted.value = true;
    return;
  }
  const owners = validateOwners();
  if (owners === null) {
    attempted.value = true;
    return;
  }

  // 3) 按类型组装 payload(沿用已验证结构，仅提交对应类型字段)
  const payload: WarrantCreateParams = {
    warrant_num: createForm.warrant_num,
    warrant_type: createForm.warrant_type,
    owners: owners.map((o) => ({
      owner_id: o.owner_id!,
      ownership_num: o.ownership_num,
      share_ratio: o.share_ratio ?? undefined,
    })),
    houses: extResult.houses,
  } as WarrantCreateParams;
  const extKeyByType: Record<number, string> = {
    5: 'ground', 6: 'construction', 21: 'stock', 31: 'draft',
    41: 'vehicle', 11: 'receivable', 51: 'chattel', 55: 'other',
  };
  const extKey = extKeyByType[createForm.warrant_type];
  if (extKey && extResult.ext) {
    (payload as any)[extKey] = extResult.ext;
  }

  submitting.value = true;
  try {
    await createWarrant(payload);
    message.success('权证已创建');
    open.value = false;
    emit('created');
  } finally {
    submitting.value = false;
  }
}

/** 打开时重置为初始空白状态 */
function resetAll() {
  Object.assign(createForm, {
    warrant_num: '', warrant_type: 1,
    ground_locate: '', ground_app: '', ground_area: undefined,
    construct_locate: '', construct_app: '', construct_area: undefined,
    stock_type: 10, stock_target: '', stock_ratio: undefined,
    stock_registered_capital: 0, stock_paid_capital: 0, stock_remark: '',
    draft_type: 20, denomination: undefined, draft_detail: '',
    frame_num: '', plate_num: '', vehicle_brand: '',
    chattel_type: 10, chattel_detail: '',
    other_type: 99, other_detail: '', receivable_detail: '',
  });
  houseRows.value = [emptyHouseRow()];
  ownerRows.value = [emptyOwnerRow()];
  lastType = 1;
  attempted.value = false;
  formRef.value?.clearValidate();
}

watch(open, (val) => {
  if (val) resetAll();
});

onMounted(() => {
  dictStore.loadAll();
  loadOptions();
});
</script>

<template>
  <Drawer v-model:open="open" title="新增权证" width="66%">
    <div class="space-y-4">
      <!-- 分区一：基本信息 -->
      <Card size="small" title="基本信息">
        <Form ref="formRef" :label-col="{ span: 8 }" :model="createForm" :rules="rules" :wrapper-col="{ span: 16 }">
          <div class="grid grid-cols-2 gap-x-6">
            <FormItem label="权证号" name="warrant_num">
              <Input v-model:value="createForm.warrant_num" placeholder="不动产权证号 / 票据号等" />
            </FormItem>
            <FormItem label="权证类型" name="warrant_type">
              <SearchSelect
                v-model:value="createForm.warrant_type"
                :options="dictStore.get('warrant.warrant_type')"
                @change="onTypeChange"
              />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- 分区二：类型扩展(标题随类型变化；房产为可编辑表格，其余为两列表单) -->
      <Card size="small" :title="extTitle">
        <!-- 房产：1:N 房产包，可编辑表格 -->
        <template v-if="createForm.warrant_type === WARRANT_TYPE_HOUSE">
          <Table
            :columns="houseColumns"
            :data-source="houseRows"
            :pagination="false"
            :row-key="(r: any) => r._key"
            size="small"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.dataIndex === 'house_locate'">
                <Input
                  v-model:value="record.house_locate"
                  placeholder="坐落地址"
                  :status="attempted && !record.house_locate ? 'error' : undefined"
                />
              </template>
              <template v-else-if="column.dataIndex === 'house_app'">
                <SearchSelect
                  v-model:value="record.house_app"
                  :options="houseAppOptions"
                  :status="attempted && !record.house_app ? 'error' : undefined"
                  placeholder="用途"
                />
              </template>
              <template v-else-if="column.dataIndex === 'house_area'">
                <InputNumber
                  v-model:value="record.house_area"
                  :min="0.01"
                  :status="attempted && !record.house_area ? 'error' : undefined"
                  placeholder="面积"
                  style="width: 100%"
                />
              </template>
              <template v-else-if="column.dataIndex === 'house_usage'">
                <SearchSelect v-model:value="record.house_usage" :options="dictStore.get('warrant.house_usage')" />
              </template>
              <template v-else-if="column.dataIndex === 'house_build_year'">
                <InputNumber v-model:value="record.house_build_year" placeholder="年份" style="width: 100%" />
              </template>
              <template v-else-if="column.dataIndex === '_op'">
                <Button v-if="houseRows.length > 1" danger size="small" type="link" @click="removeHouseRow(index)">删除</Button>
              </template>
            </template>
          </Table>
          <Button block class="mt-2" size="small" @click="addHouseRow">+ 添加房产</Button>
        </template>

        <!-- 其余类型：两列表单 -->
        <Form v-else :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }">
          <div class="grid grid-cols-2 gap-x-6">
            <!-- 土地 -->
            <template v-if="createForm.warrant_type === WARRANT_TYPE_GROUND">
              <FormItem label="坐落" required>
                <Input v-model:value="createForm.ground_locate" />
              </FormItem>
              <FormItem label="面积(㎡)" required>
                <InputNumber v-model:value="createForm.ground_area" :min="0.01" class="w-full" />
              </FormItem>
              <FormItem class="col-span-2" label="用途">
                <Input v-model:value="createForm.ground_app" placeholder="如：工业用地" />
              </FormItem>
            </template>

            <!-- 在建工程 -->
            <template v-else-if="createForm.warrant_type === WARRANT_TYPE_CONSTRUCTION">
              <FormItem label="坐落" required>
                <Input v-model:value="createForm.construct_locate" />
              </FormItem>
              <FormItem label="面积(㎡)" required>
                <InputNumber v-model:value="createForm.construct_area" :min="0.01" class="w-full" />
              </FormItem>
              <FormItem class="col-span-2" label="用途">
                <Input v-model:value="createForm.construct_app" placeholder="如：写字楼 / 住宅楼" />
              </FormItem>
            </template>

            <!-- 股权 -->
            <template v-else-if="createForm.warrant_type === WARRANT_TYPE_STOCK">
              <FormItem label="标的公司" required>
                <Input v-model:value="createForm.stock_target" placeholder="公司全称" />
              </FormItem>
              <FormItem label="持股(%)" required>
                <InputNumber v-model:value="createForm.stock_ratio" :max="100" :min="0" class="w-full" />
              </FormItem>
              <FormItem label="股权类型">
                <SearchSelect v-model:value="createForm.stock_type" :options="dictStore.get('warrant.stock_type')" />
              </FormItem>
              <FormItem label="注册资本">
                <InputNumber v-model:value="createForm.stock_registered_capital" :min="0" class="w-full" />
              </FormItem>
              <FormItem label="实缴资本">
                <InputNumber v-model:value="createForm.stock_paid_capital" :min="0" class="w-full" />
              </FormItem>
              <FormItem label="备注">
                <Input v-model:value="createForm.stock_remark" placeholder="可空" />
              </FormItem>
            </template>

            <!-- 票据 -->
            <template v-else-if="createForm.warrant_type === WARRANT_TYPE_DRAFT">
              <FormItem label="票据主类型" required>
                <SearchSelect v-model:value="createForm.draft_type" :options="dictStore.get('warrant.draft_main_type')" />
              </FormItem>
              <FormItem label="面额(元)" required>
                <InputNumber v-model:value="createForm.denomination" :min="0.01" class="w-full" />
              </FormItem>
              <FormItem label="票面信息" required>
                <Input v-model:value="createForm.draft_detail" placeholder="出票人 / 到期日等" />
              </FormItem>
            </template>

            <!-- 车辆 -->
            <template v-else-if="createForm.warrant_type === WARRANT_TYPE_VEHICLE">
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
            <template v-else-if="createForm.warrant_type === WARRANT_TYPE_RECEIVABLE">
              <FormItem label="说明" required>
                <Input v-model:value="createForm.receivable_detail" placeholder="应收账款详情" />
              </FormItem>
            </template>

            <!-- 动产 -->
            <template v-else-if="createForm.warrant_type === WARRANT_TYPE_CHATTEL">
              <FormItem label="动产类型">
                <SearchSelect v-model:value="createForm.chattel_type" :options="dictStore.get('warrant.chattel_type')" />
              </FormItem>
              <FormItem label="说明" required>
                <Input v-model:value="createForm.chattel_detail" />
              </FormItem>
            </template>

            <!-- 其他 -->
            <template v-else-if="createForm.warrant_type === WARRANT_TYPE_OTHER">
              <FormItem label="类型">
                <SearchSelect v-model:value="createForm.other_type" :options="dictStore.get('warrant.other_type')" />
              </FormItem>
              <FormItem label="说明" required>
                <Input v-model:value="createForm.other_detail" />
              </FormItem>
            </template>
          </div>
        </Form>
      </Card>

      <!-- 分区三：所有权人(可编辑表格) -->
      <Card size="small" title="所有权人(统一中间表，支持共有)">
        <Table
          :columns="ownerColumns"
          :data-source="ownerRows"
          :pagination="false"
          :row-key="(r: any) => r._key"
          size="small"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.dataIndex === 'owner_id'">
              <SearchSelect
                v-model:value="record.owner_id"
                :options="customerOptions"
                :status="attempted && !record.owner_id ? 'error' : undefined"
                placeholder="选择客户"
              />
            </template>
            <template v-else-if="column.dataIndex === 'ownership_num'">
              <Input
                v-model:value="record.ownership_num"
                :status="attempted && !record.ownership_num ? 'error' : undefined"
                placeholder="权证编号"
              />
            </template>
            <template v-else-if="column.dataIndex === 'share_ratio'">
              <InputNumber v-model:value="record.share_ratio" :max="100" :min="0" placeholder="可空=共有" style="width: 100%" />
            </template>
            <template v-else-if="column.dataIndex === '_op'">
              <Button v-if="ownerRows.length > 1" danger size="small" type="link" @click="removeOwnerRow(index)">删除</Button>
            </template>
          </template>
        </Table>
        <Button block class="mt-2" size="small" @click="addOwnerRow">+ 添加所有权人</Button>
      </Card>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button @click="open = false">取消</Button>
        <Button :loading="submitting" type="primary" @click="onSubmit">保存</Button>
      </div>
    </template>
  </Drawer>
</template>
