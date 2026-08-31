<script lang="ts" setup>
/** 新增客户抽屉：紧凑型 Card + 动态 grid 列数(2~4 列根据 Card 内容自适应) + genre 切换保护。
 *
 * 参照 views/warrant/create-drawer.vue 的模式：
 * - Drawer 宽度 66%，Card size="small" 分区布局
 * - Form rules 统一校验 + genre 切换保护(已有扩展数据时弹窗确认清空)
 * - watch(open) → resetAll 打开即重置
 *
 * 紧凑布局策略：
 * - 两列 grid（与权证 create-drawer.vue 对齐），长地址类字段 col-span-2 占满整行
 * - 窄 Card(客户标记/个人扩展)用 2 列 grid，字段少则自适应
 * - label-col span 8 + wrapper-col span 16
 * - gap-x-3 gap-y-2 缩小行列间距
 */

import type { FormInstance } from 'ant-design-vue';

import { computed, reactive, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  RadioButton,
  RadioGroup,
  TreeSelect,
} from 'ant-design-vue';

import RegionTreeSelect from '#/components/RegionTreeSelect/index.vue';
import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDictStore } from '#/store/dict';

import { createCustomer, getGroupTree } from '#/api/basic/customer';
import { getCreditRegionTree, getEmployeeDict, getIndustryTree } from '#/api/basic/dict';

import { filterTreeOption, toTreeData } from '#/utils/format';

const emit = defineEmits<{ created: [] }>();
const open = defineModel<boolean>('open', { default: false });

const userStore = useUserStore();
const dictStore = useDictStore();

// ================= 下拉数据 =================
const pmOptions = ref<{ label: string; value: number }[]>([]);
const industryTreeData = ref<any[]>([]);
const creditRegionTreeData = ref<any[]>([]);
const groupTreeData = ref<any[]>([]);

async function loadOptions() {
  // 管护经理下拉 + 当前用户（PM 新增客户时管护经理默认自己，也可以改选其他 PM）
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
  core_remark: '',
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

/** Form 校验规则(条件必填用 validator 动态判断 genre) */
const formRules = computed(() => ({
  name: [{ required: true, message: '请填写客户名称', trigger: 'blur' }],
  short_name: [
    { required: true, message: '请填写客户简称', trigger: 'blur' },
    { max: 8, message: '简称不得超过 8 字符', trigger: 'blur' },
  ],
  managementor_id: [{ required: true, message: '请选择管护经理', trigger: 'change' }],
  // 行政区域/行业/集团均可空
  // 联系人/电话/地址/行业分类均可空(后端 schema 已改为 str | None / int | None)
  // 企业条件必填
  credit_code: [
    {
      validator: async (_rule: any, value: string) => {
        if (createForm.genre !== 1) return;
        if (!value) throw new Error('企业客户需填写统一社会信用代码');
        if (value.length !== 18) throw new Error('信用代码须为 18 位');
      },
      trigger: 'blur',
    },
  ],
  representative: [
    {
      validator: async (_rule: any, value: string) => {
        if (createForm.genre !== 1) return;
        if (!value) throw new Error('企业客户需填写法定代表人');
      },
      trigger: 'blur',
    },
  ],
  registered_addr: [
    {
      validator: async (_rule: any, value: string) => {
        if (createForm.genre !== 1) return;
        if (!value) throw new Error('企业客户需填写注册地址');
      },
      trigger: 'blur',
    },
  ],
  custom_nature: [
    {
      validator: async (_rule: any, value: number | undefined) => {
        if (createForm.genre !== 1) return;
        if (!value) throw new Error('企业客户需选择企业性质');
      },
      trigger: 'change',
    },
  ],
  decisionor: [
    {
      validator: async (_rule: any, value: number | undefined) => {
        if (createForm.genre !== 1) return;
        if (!value) throw new Error('企业客户需选择决策机构');
      },
      trigger: 'change',
    },
  ],
  // 个人条件必填
  license_num: [
    {
      validator: async (_rule: any, value: string) => {
        if (createForm.genre !== 2) return;
        if (!value) throw new Error('个人客户需填写证件号码');
        if (value.length !== 18) throw new Error('证件号码须为 18 位');
      },
      trigger: 'blur',
    },
  ],
  license_addr: [
    {
      validator: async (_rule: any, value: string) => {
        if (createForm.genre !== 2) return;
        if (!value) throw new Error('个人客户需填写户籍地址');
      },
      trigger: 'blur',
    },
  ],
  marital_status: [
    {
      validator: async (_rule: any, value: number | undefined) => {
        if (createForm.genre !== 2) return;
        if (!value) throw new Error('个人客户需选择婚姻状况');
      },
      trigger: 'change',
    },
  ],
  household_nature: [
    {
      validator: async (_rule: any, value: number | undefined) => {
        if (createForm.genre !== 2) return;
        if (!value) throw new Error('个人客户需选择户籍性质');
      },
      trigger: 'change',
    },
  ],
}));

// ================= 类型切换保护 =================

/** 扩展区是否已有填写内容(用于切换确认) */
function isExtDirty(): boolean {
  if (createForm.genre === 1) {
    return [
      createForm.credit_code, createForm.representative,
      createForm.registered_addr, createForm.capital,
      createForm.paid_capital, createForm.custom_nature,
      createForm.decisionor, createForm.industry_c,
    ].some((v) => v !== '' && v !== undefined && v !== 0);
  }
  // 个人
  return [
    createForm.license_num, createForm.license_addr,
    createForm.marital_status, createForm.household_nature,
  ].some((v) => v !== '' && v !== undefined);
}

/** 清空扩展区字段(切换确认后调用) */
function resetExtFields() {
  Object.assign(createForm, {
    credit_code: '', representative: '',
    capital: undefined, paid_capital: undefined,
    registered_addr: '', custom_nature: undefined,
    decisionor: undefined, industry_c: undefined,
    license_num: '', license_addr: '',
    marital_status: undefined, household_nature: undefined,
  });
}

/** 监听 genre 变化：已有扩展数据时弹窗确认清空 */
watch(() => createForm.genre, (newVal, oldVal) => {
  if (oldVal === undefined) return;
  if (newVal === oldVal) return;
  if (isExtDirty()) {
    Modal.confirm({
      title: '切换客户类型',
      content: '切换类型将清空已填写的扩展信息，确认切换？',
      okText: '切换',
      cancelText: '取消',
      onOk: () => {
        resetExtFields();
        formRef.value?.clearValidate();
      },
      onCancel: () => {
        createForm.genre = oldVal as 1 | 2;
      },
    });
  }
});

// ================= 提交 =================

async function onSubmit() {
  // 1) Form rules 校验(条件必填由 validator 动态判断)
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    // 2) 按类型组装扩展信息，避免提交无关字段
    const company =
      createForm.genre === 1
        ? {
            credit_code: createForm.credit_code,
            representative: createForm.representative,
            registered_addr: createForm.registered_addr,
            capital: createForm.capital ?? 0,
            paid_capital: createForm.paid_capital ?? 0,
            custom_nature: createForm.custom_nature,
            decisionor: createForm.decisionor,
            industry_c: createForm.industry_c ?? createForm.industry_id,
          }
        : undefined;
    const personal =
      createForm.genre === 2
        ? {
            license_num: createForm.license_num,
            license_addr: createForm.license_addr,
            marital_status: createForm.marital_status,
            household_nature: createForm.household_nature,
          }
        : undefined;

    await createCustomer({
      name: createForm.name,
      short_name: createForm.short_name,
      genre: createForm.genre,
      linkman: createForm.linkman,
      contact_num: createForm.contact_num,
      contact_addr: createForm.contact_addr,
      region_id: createForm.region_id,
      industry_id: createForm.industry_id,
      credit_region_id: createForm.credit_region_id,
      group_id: createForm.group_id,
      managementor_id: createForm.managementor_id!,
      controler_id: createForm.controler_id,
      is_core: createForm.is_core,
      is_acceptor: createForm.is_acceptor,
      core_rate: createForm.is_core ? createForm.core_rate : undefined,
      company,
      personal,
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
  // 管护经理默认当前登录用户（PM 新增客户场景）
  const currentUserId = Number(userStore.userInfo?.userId) || undefined;
  Object.assign(createForm, {
    name: '', short_name: '', genre: 1,
    linkman: '', contact_num: '', contact_addr: '',
    region_id: undefined, industry_id: undefined,
    credit_region_id: undefined, group_id: undefined,
    managementor_id: currentUserId, controler_id: undefined,
    is_core: false, is_acceptor: false, core_rate: undefined,
    core_remark: '',
    credit_code: '', representative: '',
    capital: undefined, paid_capital: undefined,
    registered_addr: '', custom_nature: undefined,
    decisionor: undefined, industry_c: undefined,
    license_num: '', license_addr: '',
    marital_status: undefined, household_nature: undefined,
  });
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
      <!-- 分区一：基本信息(4 列 grid，地址类跨 2 列) -->
      <Card size="small" title="基本信息">
        <Form
          ref="formRef"
          :label-col="{ span: 8 }"
          :model="createForm"
          :rules="formRules as any"
          :wrapper-col="{ span: 16 }"
        >
          <div class="grid grid-cols-2 gap-x-6">
            <FormItem label="客户类型">
              <RadioGroup v-model:value="createForm.genre">
                <RadioButton :value="1">企业</RadioButton>
                <RadioButton :value="2">个人</RadioButton>
              </RadioGroup>
            </FormItem>
            <FormItem name="name" label="客户名称">
              <Input v-model:value="createForm.name" placeholder="企业全称 / 个人姓名" />
            </FormItem>
            <FormItem name="short_name" label="简称">
              <Input v-model:value="createForm.short_name" :maxlength="8" placeholder="≤8 字符" />
            </FormItem>
            <FormItem name="linkman" label="联系人">
              <Input v-model:value="createForm.linkman" />
            </FormItem>
            <FormItem name="contact_num" label="联系电话">
              <Input v-model:value="createForm.contact_num" />
            </FormItem>
            <!-- 联系地址跨 2 列 -->
            <FormItem name="contact_addr" label="联系地址">
              <Input v-model:value="createForm.contact_addr" />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- 分区二：关联归属(4 列 grid) -->
      <Card size="small" title="关联归属">
        <Form :label-col="{ span: 8 }" :model="createForm" :rules="formRules as any" :wrapper-col="{ span: 16 }">
          <div class="grid grid-cols-2 gap-x-6">
            <FormItem name="managementor_id" label="管护经理">
              <SearchSelect
                v-model:value="createForm.managementor_id"
                :options="pmOptions"
                placeholder="默认当前用户"
              />
            </FormItem>
            <FormItem name="region_id" label="行政区域">
              <RegionTreeSelect v-model:value="createForm.region_id" allow-clear />
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
                :filter-tree-node="filterTreeOption"
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
                show-search
                :filter-tree-node="filterTreeOption"
                v-model:value="createForm.group_id"
                :field-names="{ label: 'title', value: 'value', children: 'children' }"
                :tree-data="groupTreeData"
                allow-clear
                placeholder="可空"
                tree-default-expand-all
              />
            </FormItem>
          </div>
        </Form>
      </Card>

      <!-- 分区三：客户标记(2 列，字段少) -->
      <Card size="small" title="客户标记">
        <Form :label-col="{ span: 8 }" :model="createForm" :wrapper-col="{ span: 16 }">
          <div class="grid grid-cols-2 gap-x-6">
            <FormItem class="col-span-2" label="客户标记">
              <div class="flex flex-wrap items-center gap-4">
                <Checkbox v-model:checked="createForm.is_core">核心企业</Checkbox>
                <Checkbox v-model:checked="createForm.is_acceptor">承兑人</Checkbox>
              </div>
            </FormItem>
            <template v-if="createForm.is_core">
              <FormItem label="核心占比(%)">
                <InputNumber
                  v-model:value="createForm.core_rate"
                  :max="100"
                  :min="0"
                  placeholder="如 60"
                  class="w-full"
                />
              </FormItem>
              <FormItem  label="核心备注">
                <Input
                  v-model:value="createForm.core_remark"
                  :maxlength="255"
                  placeholder="可空"
                />
              </FormItem>
            </template>
          </div>
        </Form>
      </Card>

      <!-- 分区四：扩展信息(4 列，字段多；注册/户籍地址跨 2 列) -->
      <Card size="small" :title="createForm.genre === 1 ? '企业信息' : '个人信息'">
        <Form :label-col="{ span: 8 }" :model="createForm" :rules="formRules as any" :wrapper-col="{ span: 16 }">
          <div class="grid grid-cols-2 gap-x-6">
            <!-- 企业扩展 -->
            <template v-if="createForm.genre === 1">
              <FormItem name="credit_code" label="统一社会信用代码">
                <Input v-model:value="createForm.credit_code" :maxlength="18" placeholder="18 位" />
              </FormItem>
              <FormItem name="representative" label="法定代表人">
                <Input v-model:value="createForm.representative" />
              </FormItem>
              <FormItem name="custom_nature" label="企业性质">
                <SearchSelect
                  v-model:value="createForm.custom_nature"
                  :options="dictStore.get('customer.custom_nature')"
                />
              </FormItem>
              <FormItem name="decisionor" label="决策机构">
                <SearchSelect
                  v-model:value="createForm.decisionor"
                  :options="dictStore.get('customer.decisionor')"
                />
              </FormItem>
              <FormItem label="注册资本">
                <InputNumber v-model:value="createForm.capital" :min="0" class="w-full" placeholder="万元" />
              </FormItem>
              <FormItem label="实收资本">
                <InputNumber v-model:value="createForm.paid_capital" :min="0" class="w-full" placeholder="万元" />
              </FormItem>
              <FormItem name="registered_addr" label="注册地址">
                <Input v-model:value="createForm.registered_addr" />
              </FormItem>
            </template>

            <!-- 个人扩展 -->
            <template v-else>
              <FormItem name="license_num" label="证件号码">
                <Input v-model:value="createForm.license_num" :maxlength="18" placeholder="18 位身份证" />
              </FormItem>
              <FormItem name="marital_status" label="婚姻状况">
                <SearchSelect
                  v-model:value="createForm.marital_status"
                  :options="dictStore.get('customer.marital_status')"
                />
              </FormItem>
              <FormItem name="household_nature" label="户籍性质">
                <SearchSelect
                  v-model:value="createForm.household_nature"
                  :options="dictStore.get('customer.household_nature')"
                />
              </FormItem>
              <FormItem class="col-span-2" name="license_addr" label="户籍地址">
                <Input v-model:value="createForm.license_addr" />
              </FormItem>
            </template>
          </div>
        </Form>
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
