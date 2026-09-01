<script lang="ts" setup>
/** 新增客户抽屉：基本信息 + 关联归属 + 联系人可编辑表格。
 *
 * 布局策略：
 * - Drawer 宽度 66%，Card size="small" 分区布局
 * - 响应式 grid：useFormColumns composable 提供
 * - 联系人参考 warrant/create-drawer.vue 的所有权人可编辑表格模式
 * - watch(open) → resetAll 打开即重置 + 加载下拉选项
 * - genre 类型切换保护：已有 license_num/license_addr 时弹窗确认清空
 */

import type { FormInstance } from 'ant-design-vue';
import type { TableColumnType } from 'ant-design-vue';

import { computed, reactive, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

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
  RadioButton,
  RadioGroup,
  Select,
  Switch,
  Table,
  TreeSelect,
} from 'ant-design-vue';

import RegionTreeSelect from '#/components/RegionTreeSelect/index.vue';
import SearchSelect from '#/components/SearchSelect/index.vue';

import { createCustomer, getGroupTree } from '#/api/basic/customer';
import { getCreditRegionTree, getEmployeeDict, getIndustryTree } from '#/api/basic/dict';
import { useDictStore } from '#/store';

import { filterTreeOption, toTreeData } from '#/utils/format';
import { useFormColumns } from '#/composables/useFormColumns';

const emit = defineEmits<{ created: [] }>();
const open = defineModel<boolean>('open', { default: false });

const userStore = useUserStore();
const dictStore = useDictStore();

// 表单响应式列数
const { gridColsClass } = useFormColumns(3);
const { gridColsClass: gridColsClass4 } = useFormColumns(4);

// ================= 下拉数据 =================
const pmOptions = ref<{ label: string; value: number }[]>([]);
const industryTreeData = ref<any[]>([]);
const creditRegionTreeData = ref<any[]>([]);
const groupTreeData = ref<any[]>([]);

async function loadOptions() {
  const [pms, industries, creditRegions, groups] = await Promise.all([
    getEmployeeDict({ role: 'pm' }),
    getIndustryTree(),
    getCreditRegionTree(),
    getGroupTree(),
  ]);
  pmOptions.value = pms.map((u) => ({ label: u.name, value: u.id }));
  industryTreeData.value = toTreeData(industries);
  creditRegionTreeData.value = toTreeData(creditRegions);
  groupTreeData.value = toTreeData(groups);
}

// ================= 主表单 =================

const formRef = ref<FormInstance>();
const submitting = ref(false);

const createForm = reactive({
  name: '',
  short_name: '',
  genre: 1 as 1 | 2,
  license_num: '',
  license_addr: '',
  region_id: undefined as number | undefined,
  managementor_id: undefined as number | undefined,
  industry_id: undefined as number | undefined,
  credit_region_id: undefined as number | undefined,
  group_id: undefined as number | undefined,
});

// 企业扩展字段（genre=1 时提交到 company）
const companyForm = reactive({
  decisionor: undefined as number | undefined,
  custom_nature: undefined as number | undefined,
  typing: undefined as number | undefined,
  capital: undefined as number | undefined,
  paid_capital: undefined as number | undefined,
  representative: '',
});

// 个人扩展字段（genre=2 时提交到 personal）
const personalForm = reactive({
  marital_status: undefined as number | undefined,
  household_nature: undefined as number | undefined,
});

/** 证件号/地址标签随 genre 动态切换 */
const licenseNumLabel = computed(() => (createForm.genre === 1 ? '统一社会信用代码' : '身份证号'));
const licenseAddrLabel = computed(() => (createForm.genre === 1 ? '注册地址' : '身份证地址'));

/** Form 校验规则 */
const formRules = computed(() => ({
  name: [{ required: true, message: '请填写客户名称', trigger: 'blur' }],
  short_name: [
    { required: true, message: '请填写客户简称', trigger: 'blur' },
    { max: 8, message: '简称不得超过 8 字符', trigger: 'blur' },
  ],
  managementor_id: [{ required: true, message: '请选择管护经理', trigger: 'change' }],
  license_num: [
    {
      validator: async (_rule: any, value: string) => {
        if (!value) return; // 非必填，但如果填了企业需要 18 位
        if (createForm.genre === 1 && value.length !== 18) throw new Error('信用代码须为 18 位');
      },
      trigger: 'blur',
    },
  ],
}));

// ================= 类型切换保护 =================

/** 证件号/地址是否已有填写内容 */
function isLicenseDirty(): boolean {
  return [createForm.license_num, createForm.license_addr].some(
    (v) => v !== '' && v !== undefined,
  );
}

/** 监听 genre 变化：已有证件号/地址时弹窗确认清空 */
watch(() => createForm.genre, (newVal, oldVal) => {
  if (oldVal === undefined) return;
  if (newVal === oldVal) return;
  if (isLicenseDirty()) {
    Modal.confirm({
      title: '切换客户类型',
      content: '切换类型将清空已填写的证件号和地址，确认切换？',
      okText: '切换',
      cancelText: '取消',
      onOk: () => {
        createForm.license_num = '';
        createForm.license_addr = '';
        formRef.value?.clearValidate();
      },
      onCancel: () => {
        createForm.genre = oldVal as 1 | 2;
      },
    });
  }
});

// ================= 联系人(可编辑表格) =================

interface ContactRow {
  name: string;
  phone: string;
  email: string;
  addr: string;
  is_primary: boolean;
  remark: string;
  _key: number;
}

let contactKeySeq = 0;
const emptyContactRow = (isPrimary = false): ContactRow => ({
  name: '',
  phone: '',
  email: '',
  addr: '',
  is_primary: isPrimary,
  remark: '',
  _key: ++contactKeySeq,
});

const contacts = ref<ContactRow[]>([emptyContactRow(true)]);

function addContactRow() {
  contacts.value.push(emptyContactRow(false));
}

function removeContactRow(index: number) {
  const removed = contacts.value[index];
  contacts.value.splice(index, 1);
  // 被删的是首选，则把剩余第一行设为首选
  if (removed?.is_primary && contacts.value.length > 0 && contacts.value[0]) {
    contacts.value[0].is_primary = true;
  }
  // 只剩一行时强制为首选
  if (contacts.value.length === 1 && contacts.value[0]) {
    contacts.value[0].is_primary = true;
  }
}

const contactColumns: TableColumnType[] = [
  { title: '姓名 *', dataIndex: 'name', width: 120 },
  { title: '电话 *', dataIndex: 'phone', width: 140 },
  { title: '邮箱', dataIndex: 'email', width: 160 },
  { title: '联系地址', dataIndex: 'addr' },
  { title: '备注', dataIndex: 'remark', width: 120 },
  { title: '首选', dataIndex: 'is_primary', width: 70, align: 'center' },
  { title: '操作', dataIndex: '_op', width: 60, align: 'center' },
];

// ================= 提交 =================

async function onSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    // 联系人：过滤掉 name 和 phone 都为空的行，去掉前端临时字段
    const contactPayload = contacts.value
      .filter((c) => c.name?.trim() || c.phone?.trim())
      .map((c) => ({
        name: c.name,
        phone: c.phone,
        email: c.email || undefined,
        addr: c.addr || undefined,
        is_primary: c.is_primary,
        remark: c.remark || undefined,
      }));

    // 扩展信息：genre 决定传 company 还是 personal
    let companyPayload = undefined;
    let personalPayload = undefined;
    if (createForm.genre === 1) {
      // 企业扩展：有填写才传
      const hasCompanyExt =
        companyForm.decisionor !== undefined ||
        companyForm.custom_nature !== undefined ||
        companyForm.typing !== undefined ||
        companyForm.capital !== undefined ||
        companyForm.paid_capital !== undefined ||
        companyForm.representative;
      if (hasCompanyExt) {
        companyPayload = {
          decisionor: companyForm.decisionor,
          custom_nature: companyForm.custom_nature,
          typing: companyForm.typing,
          capital: companyForm.capital ?? 0,
          paid_capital: companyForm.paid_capital ?? 0,
          representative: companyForm.representative || undefined,
        };
      }
    } else {
      // 个人扩展：有填写才传
      const hasPersonalExt =
        personalForm.marital_status !== undefined ||
        personalForm.household_nature !== undefined;
      if (hasPersonalExt) {
        personalPayload = {
          marital_status: personalForm.marital_status,
          household_nature: personalForm.household_nature,
        };
      }
    }

    await createCustomer({
      name: createForm.name,
      short_name: createForm.short_name,
      genre: createForm.genre,
      // 证照字段统一落 Customer 主表（不再分装 company/personal）
      license_num: createForm.license_num || undefined,
      license_addr: createForm.license_addr || undefined,
      region_id: createForm.region_id,
      managementor_id: createForm.managementor_id!,
      industry_id: createForm.industry_id,
      credit_region_id: createForm.credit_region_id,
      group_id: createForm.group_id,
      company: companyPayload,
      personal: personalPayload,
      contacts: contactPayload.length > 0 ? contactPayload : undefined,
    });
    message.success('客户已创建');
    open.value = false;
    emit('created');
  } finally {
    submitting.value = false;
  }
}

// ================= 重置 / watch =================

function resetAll() {
  const currentUserId = Number(userStore.userInfo?.userId) || undefined;
  Object.assign(createForm, {
    name: '',
    short_name: '',
    genre: 1,
    license_num: '',
    license_addr: '',
    region_id: undefined,
    managementor_id: currentUserId,
    industry_id: undefined,
    credit_region_id: undefined,
    group_id: undefined,
  });
  Object.assign(companyForm, {
    decisionor: undefined,
    custom_nature: undefined,
    typing: undefined,
    capital: undefined,
    paid_capital: undefined,
    representative: '',
  });
  Object.assign(personalForm, {
    marital_status: undefined,
    household_nature: undefined,
  });
  contactKeySeq = 0;
  contacts.value = [emptyContactRow(true)];
  formRef.value?.clearValidate();
}

watch(open, (val) => {
  if (val) {
    resetAll();
    loadOptions();
  }
});
</script>

<template>
  <Drawer v-model:open="open" title="新增客户" width="66%">
    <div class="space-y-3">
      <!-- Card 1 客户基本信息 -->
      <Card size="small" title="客户基本信息">
        <Form
          ref="formRef"
          :label-col="{ span: 8 }"
          :model="createForm"
          :rules="formRules as any"
          :wrapper-col="{ span: 16 }"
        >
          <div class="grid gap-x-6 gap-y-2" :class="gridColsClass">
            <FormItem label="客户类型">
              <RadioGroup v-model:value="createForm.genre">
                <RadioButton :value="1">企业</RadioButton>
                <RadioButton :value="2">个人</RadioButton>
              </RadioGroup>
            </FormItem>
            <FormItem name="name" label="客户名称">
              <Input v-model:value="createForm.name" placeholder="企业全称 / 个人姓名" />
            </FormItem>
            <FormItem name="short_name" label="客户简称">
              <Input v-model:value="createForm.short_name" :maxlength="8" placeholder="≤8 字符" />
            </FormItem>
            <FormItem :label="licenseNumLabel" name="license_num">
              <Input
                v-model:value="createForm.license_num"
                :maxlength="18"
                :placeholder="createForm.genre === 1 ? '18 位信用代码' : '18 位身份证号'"
              />
            </FormItem>
            <FormItem name="region_id" label="行政区域">
              <RegionTreeSelect v-model:value="createForm.region_id" allow-clear />
            </FormItem>
            <FormItem :label="licenseAddrLabel">
              <Input v-model:value="createForm.license_addr" placeholder="详细地址" />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- Card 2 关联归属 -->
      <Card size="small" title="关联归属">
        <Form
          :label-col="{ span: 8 }"
          :model="createForm"
          :rules="formRules as any"
          :wrapper-col="{ span: 16 }"
        >
          <div class="grid gap-x-6 gap-y-2" :class="gridColsClass4">
            <FormItem name="managementor_id" label="管护经理">
              <SearchSelect
                v-model:value="createForm.managementor_id"
                :options="pmOptions"
                placeholder="默认当前用户"
              />
            </FormItem>
            <FormItem name="industry_id" label="行业分类">
              <TreeSelect
                show-search
                allow-clear
                :filter-tree-node="filterTreeOption"
                v-model:value="createForm.industry_id"
                :field-names="{ label: 'title', value: 'value', children: 'children' }"
                :tree-data="industryTreeData"
                placeholder="可空"
                tree-default-expand-all
              />
            </FormItem>
            <FormItem label="授信区域">
              <TreeSelect
                show-search
                allow-clear
                :filter-tree-node="filterTreeOption"
                v-model:value="createForm.credit_region_id"
                :field-names="{ label: 'title', value: 'value', children: 'children' }"
                :tree-data="creditRegionTreeData"
                placeholder="可空"
                tree-default-expand-all
              />
            </FormItem>
            <FormItem label="所属集团">
              <TreeSelect
                show-search
                allow-clear
                :filter-tree-node="filterTreeOption"
                v-model:value="createForm.group_id"
                :field-names="{ label: 'title', value: 'value', children: 'children' }"
                :tree-data="groupTreeData"
                placeholder="可空"
                tree-default-expand-all
              />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- Card 3a 企业扩展信息(仅 genre=1) -->
      <Card v-if="createForm.genre === 1" size="small" title="企业扩展信息">
        <Form :label-col="{ span: 8 }" :model="companyForm" :wrapper-col="{ span: 16 }">
          <div class="grid gap-x-6 gap-y-2" :class="gridColsClass">
            <FormItem label="决策机构">
              <Select
                v-model:value="companyForm.decisionor"
                :options="dictStore.get('customer.decisionor')"
                allow-clear
                placeholder="可空"
              />
            </FormItem>
            <FormItem label="企业性质">
              <Select
                v-model:value="companyForm.custom_nature"
                :options="dictStore.get('customer.custom_nature')"
                allow-clear
                placeholder="可空"
              />
            </FormItem>
            <FormItem label="企业划型">
              <Select
                v-model:value="companyForm.typing"
                :options="dictStore.get('customer.typing')"
                allow-clear
                placeholder="可空"
              />
            </FormItem>
            <FormItem label="法人代表">
              <Input v-model:value="companyForm.representative" placeholder="可空" />
            </FormItem>
            <FormItem label="注册资本(万元)">
              <InputNumber
                v-model:value="companyForm.capital"
                :min="0"
                :precision="2"
                class="!w-full"
                placeholder="可空"
              />
            </FormItem>
            <FormItem label="实收资本(万元)">
              <InputNumber
                v-model:value="companyForm.paid_capital"
                :min="0"
                :precision="2"
                class="!w-full"
                placeholder="可空"
              />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- Card 3b 个人扩展信息(仅 genre=2) -->
      <Card v-if="createForm.genre === 2" size="small" title="个人扩展信息">
        <Form :label-col="{ span: 8 }" :model="personalForm" :wrapper-col="{ span: 16 }">
          <div class="grid gap-x-6 gap-y-2" :class="gridColsClass">
            <FormItem label="婚姻状态">
              <Select
                v-model:value="personalForm.marital_status"
                :options="dictStore.get('customer.marital_status')"
                allow-clear
                placeholder="可空"
              />
            </FormItem>
            <FormItem label="户籍性质">
              <Select
                v-model:value="personalForm.household_nature"
                :options="dictStore.get('customer.household_nature')"
                allow-clear
                placeholder="可空"
              />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- Card 4 联系人(可编辑表格) -->
      <Card size="small" title="联系人">
        <template #extra>
          <Button size="small" type="link" @click="addContactRow">+ 增加</Button>
        </template>
        <Table
          :columns="contactColumns"
          :data-source="contacts"
          :pagination="false"
          :row-key="(r: ContactRow) => r._key"
          size="small"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.dataIndex === 'name'">
              <Input v-model:value="record.name" placeholder="姓名 *" style="width: 100%" />
            </template>
            <template v-else-if="column.dataIndex === 'phone'">
              <Input v-model:value="record.phone" placeholder="电话 *" style="width: 100%" />
            </template>
            <template v-else-if="column.dataIndex === 'email'">
              <Input v-model:value="record.email" placeholder="可空" style="width: 100%" />
            </template>
            <template v-else-if="column.dataIndex === 'addr'">
              <Input v-model:value="record.addr" placeholder="可空" style="width: 100%" />
            </template>
            <template v-else-if="column.dataIndex === 'remark'">
              <Input v-model:value="record.remark" placeholder="可空" style="width: 100%" />
            </template>
            <template v-else-if="column.dataIndex === 'is_primary'">
              <Switch v-model:checked="record.is_primary" />
            </template>
            <template v-else-if="column.dataIndex === '_op'">
              <Button
                v-if="contacts.length > 1"
                danger
                size="small"
                type="link"
                @click="removeContactRow(index)"
              >
                删除
              </Button>
            </template>
          </template>
        </Table>
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
