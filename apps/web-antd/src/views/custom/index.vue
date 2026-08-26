<script lang="ts" setup>
/** 客户管理：列表（data_scope 过滤）/ 新建（发起审批）/ 详情抽屉。 */

import type { CustomerListItem } from '#/api/basic/customer';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  RadioButton,
  RadioGroup,
  Select,
  Space,
  Table,
  Tag,
  TreeSelect,
} from 'ant-design-vue';

import {
  createCustomer,
  deleteCustomer,
  getCustomerList,
  getGroupTree,
} from '#/api/basic/customer';
import {
  getCreditRegionTree,
  getIndustryTree,
  getRegionTree,
} from '#/api/basic/dict';
import { getUserList } from '#/api/system/user';

import DetailDrawer from './detail-drawer.vue';

// 客户枚举（与后端 customer/enums.py 对齐）
const GENRE_OPTIONS = [
  { label: '企业', value: 1 },
  { label: '个人', value: 2 },
];
const CLASSIFICATION_OPTIONS = [
  { label: '正常', value: 10 },
  { label: '关注', value: 20 },
  { label: '次级', value: 30 },
  { label: '可疑', value: 40 },
  { label: '损失', value: 50 },
];
const CUSTOM_NATURE_OPTIONS = [
  { label: '国有', value: 11 },
  { label: '集体', value: 21 },
  { label: '民营', value: 31 },
  { label: '外资', value: 41 },
  { label: '合资', value: 51 },
  { label: '有限责任', value: 61 },
  { label: '股份有限', value: 71 },
];
const DECISIONOR_OPTIONS = [
  { label: '股东会', value: 11 },
  { label: '董事会', value: 12 },
  { label: '董事长', value: 13 },
  { label: '总经理办公会', value: 15 },
  { label: '其他机构', value: 21 },
  { label: '法定代表人', value: 23 },
];
const MARITAL_OPTIONS = [
  { label: '未婚', value: 10 },
  { label: '已婚', value: 20 },
  { label: '离异未再婚', value: 30 },
  { label: '丧偶', value: 40 },
];
const HOUSEHOLD_OPTIONS = [
  { label: '城镇', value: 10 },
  { label: '农村', value: 20 },
];

const classificationColor = (c: number) =>
  ({ 10: 'green', 20: 'blue', 30: 'orange', 40: 'red', 50: 'red' })[c] ?? 'default';
const classificationLabel = (c: number) =>
  CLASSIFICATION_OPTIONS.find((o) => o.value === c)?.label ?? c;

// ================= 列表 =================
const loading = ref(false);
const list = ref<CustomerListItem[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  page_size: 20,
  q: '',
  genre: undefined as number | undefined,
  // 布尔筛选用 1/0 表示（AntD Select value 不支持 boolean），提交前转换
  is_core: undefined as number | undefined,
  is_acceptor: undefined as number | undefined,
  classification: undefined as number | undefined,
});

async function loadList() {
  loading.value = true;
  try {
    const data = await getCustomerList({
      ...query,
      is_core: query.is_core === undefined ? undefined : query.is_core === 1,
      is_acceptor:
        query.is_acceptor === undefined ? undefined : query.is_acceptor === 1,
    });
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

// ================= 详情 =================
const detailOpen = ref(false);
const detailCustomerId = ref<null | number>(null);

function openDetail(row: any) {
  detailCustomerId.value = row.id;
  detailOpen.value = true;
}

async function onDelete(row: any) {
  await deleteCustomer(row.id);
  message.success('客户已注销');
  await loadList();
}

// ================= 新建（发起 customer_create 审批） =================
const createVisible = ref(false);
const createLoading = ref(false);
// 表单字段与后端 CustomerCreate schema 对齐
const createForm = reactive({
  name: '',
  short_name: '',
  genre: 1 as 1 | 2,
  linkman: '',
  contact_num: '',
  contact_addr: '',
  region_id: undefined as number | undefined,
  industry_id: undefined as number | undefined,
  credit_region_id: undefined as number | undefined,
  group_id: undefined as number | undefined,
  managementor_id: undefined as number | undefined,
  controler_id: undefined as number | undefined,
  is_core: false,
  is_acceptor: false,
  core_rate: undefined as number | undefined,
  // 企业扩展
  credit_code: '',
  representative: '',
  capital: undefined as number | undefined,
  paid_capital: undefined as number | undefined,
  registered_addr: '',
  custom_nature: undefined as number | undefined,
  decisionor: undefined as number | undefined,
  industry_c: undefined as number | undefined,
  // 个人扩展
  license_num: '',
  license_addr: '',
  marital_status: undefined as number | undefined,
  household_nature: undefined as number | undefined,
});

// 下拉数据源
const userOptions = ref<{ label: string; value: number }[]>([]);
const regionTreeData = ref<any[]>([]);
const industryTreeData = ref<any[]>([]);
const creditRegionTreeData = ref<any[]>([]);
const groupTreeData = ref<any[]>([]);

/** 后端树节点 → AntD TreeSelect treeData */
function toTreeData(nodes: any[]): any[] {
  return (nodes ?? []).map((n) => ({
    key: n.id,
    title: n.name,
    value: n.id,
    children: toTreeData(n.children),
  }));
}

async function loadOptions() {
  // 用户下拉（管护经理 / 风控专员共用）
  const [users, regions, industries, creditRegions, groups] = await Promise.all([
    getUserList({ page: 1, page_size: 200 }),
    getRegionTree(),
    getIndustryTree(),
    getCreditRegionTree(),
    getGroupTree(),
  ]);
  userOptions.value = users.items.map((u) => ({ label: u.name, value: u.id }));
  regionTreeData.value = toTreeData(regions);
  industryTreeData.value = toTreeData(industries);
  creditRegionTreeData.value = toTreeData(creditRegions);
  groupTreeData.value = toTreeData(groups);
}

function openCreate() {
  Object.assign(createForm, {
    name: '', short_name: '', genre: 1,
    linkman: '', contact_num: '', contact_addr: '',
    region_id: undefined, industry_id: undefined,
    credit_region_id: undefined, group_id: undefined,
    managementor_id: undefined, controler_id: undefined,
    is_core: false, is_acceptor: false, core_rate: undefined,
    credit_code: '', representative: '',
    capital: undefined, paid_capital: undefined,
    registered_addr: '', custom_nature: undefined,
    decisionor: undefined, industry_c: undefined,
    license_num: '', license_addr: '',
    marital_status: undefined, household_nature: undefined,
  });
  createVisible.value = true;
}

async function submitCreate() {
  // 前端轻校验（后端 Pydantic 兜底）
  if (!createForm.name || !createForm.short_name) {
    message.warning('请填写客户名称与简称');
    return;
  }
  if (!createForm.managementor_id || !createForm.controler_id) {
    message.warning('请选择管护经理与风控专员');
    return;
  }
  if (!createForm.region_id || !createForm.industry_id) {
    message.warning('请选择区域与行业');
    return;
  }
  if (createForm.genre === 1) {
    if (!createForm.credit_code || !createForm.representative || !createForm.registered_addr) {
      message.warning('企业客户需填写信用代码、法定代表人、注册地址');
      return;
    }
    if (!createForm.custom_nature || !createForm.decisionor) {
      message.warning('企业客户需选择企业性质与决策机构');
      return;
    }
  } else if (!createForm.license_num || createForm.license_num.length !== 18) {
    message.warning('个人客户证件号码须为 18 位');
    return;
  } else if (!createForm.marital_status || !createForm.household_nature) {
    message.warning('个人客户需选择婚姻状况与户籍性质');
    return;
  }

  createLoading.value = true;
  try {
    // 按类型组装扩展信息，避免提交无关字段
    const company =
      createForm.genre === 1
        ? {
            credit_code: createForm.credit_code,
            representative: createForm.representative,
            registered_addr: createForm.registered_addr,
            capital: createForm.capital ?? 0,
            paid_capital: createForm.paid_capital ?? 0,
            custom_nature: createForm.custom_nature!,
            decisionor: createForm.decisionor!,
            industry_c: createForm.industry_c ?? createForm.industry_id!,
          }
        : undefined;
    const personal =
      createForm.genre === 2
        ? {
            license_num: createForm.license_num,
            license_addr: createForm.license_addr,
            marital_status: createForm.marital_status!,
            household_nature: createForm.household_nature!,
          }
        : undefined;

    const res = await createCustomer({
      name: createForm.name,
      short_name: createForm.short_name,
      genre: createForm.genre,
      linkman: createForm.linkman,
      contact_num: createForm.contact_num,
      contact_addr: createForm.contact_addr,
      region_id: createForm.region_id!,
      industry_id: createForm.industry_id!,
      credit_region_id: createForm.credit_region_id,
      group_id: createForm.group_id,
      managementor_id: createForm.managementor_id!,
      controler_id: createForm.controler_id!,
      is_core: createForm.is_core,
      is_acceptor: createForm.is_acceptor,
      core_rate: createForm.is_core ? createForm.core_rate : undefined,
      company,
      personal,
    });
    message.success(`已发起客户创建审批（审批单 #${res.instance_id}），审批通过后客户生效`);
    createVisible.value = false;
  } finally {
    createLoading.value = false;
  }
}

const columns: TableColumnType[] = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '客户名称', dataIndex: 'name', ellipsis: true },
  { title: '简称', dataIndex: 'short_name', width: 100 },
  { title: '类型', dataIndex: 'genre', width: 70 },
  { title: '五级分类', dataIndex: 'classification', width: 90 },
  { title: '管护经理', dataIndex: 'managementor_name', width: 100 },
  { title: '风控专员', dataIndex: 'controler_name', width: 100 },
  { title: '授信额度', dataIndex: 'credit_amount', width: 110 },
  { title: '在保余额', dataIndex: 'amount', width: 110 },
  { title: '标记', key: 'flags', width: 110 },
  { title: '操作', key: 'actions', width: 130, fixed: 'right' },
];

onMounted(() => {
  loadList();
  loadOptions();
});
</script>

<template>
  <Page title="客户管理" description="客户主数据：创建走审批流，敏感修改走变更审批">
    <Card>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.q"
          allow-clear
          placeholder="客户名称 / 简称 / 信用代码"
          style="width: 220px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <Select
          v-model:value="query.genre"
          :options="GENRE_OPTIONS"
          allow-clear
          placeholder="类型"
          style="width: 100px"
        />
        <Select
          v-model:value="query.classification"
          :options="CLASSIFICATION_OPTIONS"
          allow-clear
          placeholder="五级分类"
          style="width: 110px"
        />
        <Select
          v-model:value="query.is_core"
          :options="[
            { label: '核心企业', value: 1 },
            { label: '非核心', value: 0 },
          ]"
          allow-clear
          placeholder="核心企业"
          style="width: 120px"
        />
        <Select
          v-model:value="query.is_acceptor"
          :options="[
            { label: '承兑人', value: 1 },
            { label: '非承兑', value: 0 },
          ]"
          allow-clear
          placeholder="承兑人"
          style="width: 110px"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <AccessControl :codes="['customer:create']" type="code">
          <Button type="primary" @click="openCreate">新增客户</Button>
        </AccessControl>
      </div>

      <Table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number) => { query.page = p; loadList(); },
        }"
        :scroll="{ x: 1150 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'genre'">
            {{ record.genre === 1 ? '企业' : '个人' }}
          </template>
          <template v-else-if="column.dataIndex === 'classification'">
            <Tag :color="classificationColor(record.classification)">
              {{ classificationLabel(record.classification) }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'credit_amount'">
            {{ record.credit_amount?.toLocaleString() ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'amount'">
            {{ record.amount?.toLocaleString() ?? '—' }}
          </template>
          <template v-else-if="column.key === 'flags'">
            <Tag v-if="record.is_core" color="purple">核心</Tag>
            <Tag v-if="record.is_acceptor" color="cyan">承兑</Tag>
            <span v-if="!record.is_core && !record.is_acceptor">—</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <Button size="small" type="link" @click="openDetail(record)">详情</Button>
              <AccessControl :codes="['customer:delete']" type="code">
                <Popconfirm title="确认注销该客户？" @confirm="onDelete(record)">
                  <Button danger size="small" type="link">注销</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建客户（发起审批） -->
    <Modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      :width="720"
      title="新增客户（提交后发起审批）"
      @ok="submitCreate"
    >
      <Form
        :label-col="{ span: 7 }"
        :model="createForm"
        :wrapper-col="{ span: 15 }"
        class="max-h-[60vh] overflow-y-auto pr-2"
      >
        <FormItem label="客户类型" required>
          <RadioGroup v-model:value="createForm.genre">
            <RadioButton :value="1">企业</RadioButton>
            <RadioButton :value="2">个人</RadioButton>
          </RadioGroup>
        </FormItem>
        <FormItem label="客户名称" required>
          <Input v-model:value="createForm.name" placeholder="企业全称 / 个人姓名" />
        </FormItem>
        <FormItem label="简称" required>
          <Input v-model:value="createForm.short_name" :maxlength="16" placeholder="≤16 字符" />
        </FormItem>
        <FormItem label="联系人" required>
          <Input v-model:value="createForm.linkman" />
        </FormItem>
        <FormItem label="联系电话" required>
          <Input v-model:value="createForm.contact_num" />
        </FormItem>
        <FormItem label="联系地址" required>
          <Input v-model:value="createForm.contact_addr" />
        </FormItem>

        <FormItem label="管护经理" required>
          <Select
            v-model:value="createForm.managementor_id"
            :options="userOptions"
            show-search
            option-filter-prop="label"
            placeholder="客户经理（业务发起人）"
          />
        </FormItem>
        <FormItem label="风控专员" required>
          <Select
            v-model:value="createForm.controler_id"
            :options="userOptions"
            show-search
            option-filter-prop="label"
            placeholder="风控对接人"
          />
        </FormItem>
        <FormItem label="行政区域" required>
          <TreeSelect
            v-model:value="createForm.region_id"
            :field-names="{ label: 'title', value: 'value', children: 'children' }"
            :tree-data="regionTreeData"
            placeholder="行政区划"
            tree-default-expand-all
          />
        </FormItem>
        <FormItem label="行业分类" required>
          <TreeSelect
            v-model:value="createForm.industry_id"
            :field-names="{ label: 'title', value: 'value', children: 'children' }"
            :tree-data="industryTreeData"
            placeholder="国民经济行业"
            tree-default-expand-all
          />
        </FormItem>
        <FormItem label="授信区域">
          <TreeSelect
            v-model:value="createForm.credit_region_id"
            :field-names="{ label: 'title', value: 'value', children: 'children' }"
            :tree-data="creditRegionTreeData"
            allow-clear
            placeholder="可空"
            tree-default-expand-all
          />
        </FormItem>
        <FormItem label="所属集团">
          <TreeSelect
            v-model:value="createForm.group_id"
            :field-names="{ label: 'title', value: 'value', children: 'children' }"
            :tree-data="groupTreeData"
            allow-clear
            placeholder="可空"
            tree-default-expand-all
          />
        </FormItem>

        <!-- 标记 -->
        <FormItem label="客户标记">
          <div class="flex flex-wrap items-center gap-4">
            <Checkbox v-model:checked="createForm.is_core">核心企业</Checkbox>
            <Checkbox v-model:checked="createForm.is_acceptor">承兑人</Checkbox>
          </div>
        </FormItem>
        <FormItem v-if="createForm.is_core" label="核心占比(%)">
          <InputNumber
            v-model:value="createForm.core_rate"
            :max="100"
            :min="0"
            placeholder="如 60"
          />
        </FormItem>

        <!-- 企业扩展 -->
        <template v-if="createForm.genre === 1">
          <Divider class="my-3 text-xs">企业信息</Divider>
          <FormItem label="统一社会信用代码" required>
            <Input v-model:value="createForm.credit_code" :maxlength="18" placeholder="18 位" />
          </FormItem>
          <FormItem label="法定代表人" required>
            <Input v-model:value="createForm.representative" />
          </FormItem>
          <FormItem label="注册资本">
            <InputNumber v-model:value="createForm.capital" :min="0" placeholder="万元" />
          </FormItem>
          <FormItem label="实收资本">
            <InputNumber v-model:value="createForm.paid_capital" :min="0" placeholder="万元" />
          </FormItem>
          <FormItem label="注册地址" required>
            <Input v-model:value="createForm.registered_addr" />
          </FormItem>
          <FormItem label="企业性质" required>
            <Select v-model:value="createForm.custom_nature" :options="CUSTOM_NATURE_OPTIONS" />
          </FormItem>
          <FormItem label="决策机构" required>
            <Select v-model:value="createForm.decisionor" :options="DECISIONOR_OPTIONS" />
          </FormItem>
        </template>

        <!-- 个人扩展 -->
        <template v-else>
          <Divider class="my-3 text-xs">个人信息</Divider>
          <FormItem label="证件号码" required>
            <Input v-model:value="createForm.license_num" :maxlength="18" placeholder="18 位身份证" />
          </FormItem>
          <FormItem label="户籍地址" required>
            <Input v-model:value="createForm.license_addr" />
          </FormItem>
          <FormItem label="婚姻状况" required>
            <Select v-model:value="createForm.marital_status" :options="MARITAL_OPTIONS" />
          </FormItem>
          <FormItem label="户籍性质" required>
            <Select v-model:value="createForm.household_nature" :options="HOUSEHOLD_OPTIONS" />
          </FormItem>
        </template>
      </Form>
    </Modal>

    <!-- 客户详情抽屉 -->
    <DetailDrawer v-model:open="detailOpen" :customer-id="detailCustomerId" @updated="loadList" />
  </Page>
</template>
