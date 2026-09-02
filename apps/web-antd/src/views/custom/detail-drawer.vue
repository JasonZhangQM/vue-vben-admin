<script lang="ts" setup>
/** 客户详情抽屉：基本信息 / 企业扩展 / 股东 / 董事 / 核心企业额度 / 客户标签。 */

import type { CustomerDetail, ExtraTag, ExtendItem } from '#/api/basic/customer';

import { computed, reactive, ref, watch } from 'vue';

import { AccessControl, useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Descriptions,
  DescriptionsItem,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Switch,
  Table,
  Tabs,
  TabPane,
  Tag,
  TreeSelect,
} from 'ant-design-vue';

import {
  addCoreLimit,
  addCustomerContact,
  addDirector,
  addExtend,
  addShareholder,
  bindSpouse,
  deleteCustomerContact,
  deleteDirector,
  deleteExtend,
  deleteShareholder,
  getCustomerDetail,
  getTagList,
  listDirectors,
  listExtends,
  listShareholders,
  unbindSpouse,
  updateCustomer,
  updateCustomerContact,
  updateCustomerTags,
} from '#/api/basic/customer';
import RegionTreeSelect from '#/components/RegionTreeSelect/index.vue';
import SearchSelect from '#/components/SearchSelect/index.vue';
import { getCustomerDict } from '#/api/basic/dict';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { useDictStore } from '#/store';
import { dash, opt, toTreeData, filterTreeOption } from '#/utils/format';

import { getIndustryTree } from '#/api/basic/dict';

const dictStore = useDictStore();

const props = defineProps<{ customerId: null | number }>();
const emit = defineEmits<{ updated: [] }>();

// 详情基本信息响应式列数(视口越宽列越多)
const { columns: detailColumns } = useDetailColumns();

const open = defineModel<boolean>('open', { default: false });
const detail = ref<null | CustomerDetail>(null);
const loading = ref(false);

// 股东 / 董事：详情接口只返回计数，数据走独立 API
const shareholderList = ref<any[]>([]);
const directorList = ref<any[]>([]);

// 经营快照
const extendList = ref<ExtendItem[]>([]);
const extendForm = reactive({
  sales_revenue: undefined as number | undefined,
  total_assets: undefined as number | undefined,
  people_engaged: undefined as number | undefined,
  data_date: undefined as string | undefined,
});

const classificationColor = (c: number) =>
  ({ 10: 'green', 20: 'blue', 30: 'orange', 40: 'red', 50: 'red' })[c] ?? 'default';
/** 抽屉内操作完成后刷新抽屉 + 通知列表 */
async function refresh() {
  await load();
  emit('updated');
}

// ===== 配偶绑定/解绑 =====
const bindSpouseVisible = ref(false);
const bindSpouseLoading = ref(false);
const bindSpouseOptions = ref<{ label: string; value: number }[]>([]);
const bindSpouseForm = reactive({ spouse_customer_id: undefined as number | undefined });

async function openBindSpouse() {
  bindSpouseForm.spouse_customer_id = undefined;
  // 加载个人客户字典（排除当前客户自己）
  const r = await getCustomerDict({ genre: 2, page_size: 200 });
  bindSpouseOptions.value = r.items
    .filter((c) => c.id !== props.customerId)
    .map((c) => ({
      label: `${c.name}${c.short_name ? ` (${c.short_name})` : ''}`,
      value: c.id,
    }));
  bindSpouseVisible.value = true;
}

async function submitBindSpouse() {
  if (!bindSpouseForm.spouse_customer_id) {
    message.warning('请选择配偶');
    return;
  }
  bindSpouseLoading.value = true;
  try {
    await bindSpouse(props.customerId!, bindSpouseForm.spouse_customer_id);
    message.success('配偶已绑定');
    bindSpouseVisible.value = false;
    await refresh();
  } finally {
    bindSpouseLoading.value = false;
  }
}

async function submitUnbindSpouse() {
  try {
    await unbindSpouse(props.customerId!);
    message.success('配偶已解绑');
    await refresh();
  } catch (e: any) {
    message.error(e?.response?.data?.detail ?? '解绑失败');
  }
}

async function load() {
  if (!props.customerId) return;
  loading.value = true;
  try {
    detail.value = await getCustomerDetail(props.customerId);
    // 仅企业客户才拉股东/董事/经营快照
    if (detail.value.genre === 1) {
      const [shareholders, directors, extends_] = await Promise.all([
        listShareholders(props.customerId).catch(() => []),
        listDirectors(props.customerId).catch(() => []),
        listExtends(props.customerId).catch(() => []),
      ]);
      shareholderList.value = shareholders;
      directorList.value = directors;
      extendList.value = extends_;
    } else {
      shareholderList.value = [];
      directorList.value = [];
      extendList.value = [];
    }
  } catch {
    // 详情拉取失败：自动关闭抽屉 + 错误提示，避免页面挂死
    open.value = false;
    detail.value = null;
    message.error('客户详情加载失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [open.value, props.customerId],
  ([visible]) => {
    if (visible) load();
  },
);

// ===== 编辑(CustomerUpdate，所有字段直接生效) =====
const { hasAccessByCodes } = useAccess();
const canUpdate = computed(() => hasAccessByCodes(['customer:update']));

const editVisible = ref(false);
const editLoading = ref(false);
const industryTreeData = ref<any[]>([]);
const editForm = reactive({
  name: '',
  short_name: '',
  credit_amount: undefined as number | undefined,
  managementor_id: undefined as number | undefined,
  region_id: undefined as number | undefined,
  industry_id: undefined as number | undefined,
});

async function openEdit() {
  if (!detail.value) return;
  // 编辑需要行业全量(仅首次加载)；区域懒加载/搜索已封装进 RegionTreeSelect 组件
  if (!industryTreeData.value.length) {
    industryTreeData.value = toTreeData(await getIndustryTree());
  }
  Object.assign(editForm, {
    name: detail.value.name ?? '',
    short_name: detail.value.short_name ?? '',
    credit_amount: detail.value.credit_amount ?? undefined,
    managementor_id: undefined, // 留空保持不变
    region_id: undefined, // 留空保持不变(后端 exclude_unset)
    industry_id: undefined,
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!detail.value) return;
  editLoading.value = true;
  try {
    await updateCustomer(detail.value.id, {
      name: opt(editForm.name),
      short_name: opt(editForm.short_name),
      credit_amount: editForm.credit_amount,
      managementor_id: editForm.managementor_id,
      region_id: editForm.region_id,
      industry_id: editForm.industry_id,
    });
    message.success('客户信息已更新');
    editVisible.value = false;
    await refresh();
  } finally {
    editLoading.value = false;
  }
}

// ===== 股东 / 董事快速添加 =====
const shareholderForm = reactive({
  shareholder_name: '',
  invested_amount: 0,
  shareholding_ratio: 0,
});
const directorName = ref('');

async function submitShareholder() {
  if (!detail.value || !shareholderForm.shareholder_name) return;
  await addShareholder(detail.value.id, { ...shareholderForm });
  Object.assign(shareholderForm, { shareholder_name: '', invested_amount: 0, shareholding_ratio: 0 });
  message.success('股东已添加');
  await refresh();
}

async function submitDirector() {
  if (!detail.value || !directorName.value) return;
  await addDirector(detail.value.id, directorName.value);
  directorName.value = '';
  message.success('董事已添加');
  await refresh();
}

async function onDeleteShareholder(record: any) {
  if (!detail.value) return;
  await deleteShareholder(detail.value.id, record.id);
  message.success('股东已删除');
  await refresh();
}

async function onDeleteDirector(record: any) {
  if (!detail.value) return;
  await deleteDirector(detail.value.id, record.id);
  message.success('董事已删除');
  await refresh();
}

// ===== 经营快照 =====
async function submitExtend() {
  if (!detail.value) return;
  if (!extendForm.sales_revenue || !extendForm.total_assets || !extendForm.people_engaged || !extendForm.data_date) {
    message.warning('请完整填写营业收入、总资产、从业人数和基准日');
    return;
  }
  await addExtend(detail.value.id, {
    sales_revenue: extendForm.sales_revenue,
    total_assets: extendForm.total_assets,
    people_engaged: extendForm.people_engaged,
    data_date: extendForm.data_date,
  });
  Object.assign(extendForm, {
    sales_revenue: undefined,
    total_assets: undefined,
    people_engaged: undefined,
    data_date: undefined,
  });
  message.success('经营快照已保存');
  await refresh();
}

async function onDeleteExtend(record: any) {
  if (!detail.value) return;
  await deleteExtend(detail.value.id, record.id);
  message.success('快照已删除');
  await refresh();
}

// ===== 核心企业额度 =====
const limitForm = reactive({
  credit_amount: 0,
  valid_begin_date: '',
  valid_end_date: '',
});

async function submitLimit() {
  if (!detail.value || !limitForm.credit_amount || !limitForm.valid_begin_date || !limitForm.valid_end_date) {
    message.warning('请填写额度与有效期');
    return;
  }
  await addCoreLimit(detail.value.id, { ...limitForm });
  Object.assign(limitForm, { credit_amount: 0, valid_begin_date: '', valid_end_date: '' });
  message.success('额度已创建(旧额度自动失效)');
  await refresh();
}

// ===== 联系人(CustomerContact) =====

const contactForm = reactive({
  name: '',
  phone: '',
  email: '',
  addr: '',
  is_primary: false,
  remark: '',
});

const editContactVisible = ref(false);
const editContactLoading = ref(false);
const editContactForm = reactive({
  id: 0,
  name: '',
  phone: '',
  email: '',
  addr: '',
  is_primary: false,
  remark: '',
});

async function submitContact() {
  if (!detail.value || !contactForm.name?.trim() || !contactForm.phone?.trim()) {
    message.warning('请填写姓名和电话');
    return;
  }
  await addCustomerContact(detail.value.id, { ...contactForm });
  Object.assign(contactForm, { name: '', phone: '', email: '', addr: '', is_primary: false, remark: '' });
  message.success('联系人已添加');
  await refresh();
}

function openContactEdit(record: any) {
  Object.assign(editContactForm, {
    id: record.id,
    name: record.name ?? '',
    phone: record.phone ?? '',
    email: record.email ?? '',
    addr: record.addr ?? '',
    is_primary: !!record.is_primary,
    remark: record.remark ?? '',
  });
  editContactVisible.value = true;
}

async function submitContactEdit() {
  if (!detail.value) return;
  editContactLoading.value = true;
  try {
    await updateCustomerContact(detail.value.id, editContactForm.id, {
      name: editContactForm.name,
      phone: editContactForm.phone,
      email: editContactForm.email || undefined,
      addr: editContactForm.addr || undefined,
      is_primary: editContactForm.is_primary,
      remark: editContactForm.remark || undefined,
    });
    editContactVisible.value = false;
    message.success('联系人已更新');
    await refresh();
  } finally {
    editContactLoading.value = false;
  }
}

async function onDeleteContact(record: any) {
  if (!detail.value) return;
  await deleteCustomerContact(detail.value.id, record.id);
  message.success('联系人已删除');
  await refresh();
}

// ===== 客户标签(参照 system/roles 权限配置：分组多选 + 保存) =====
const allTags = ref<ExtraTag[]>([]);
const checkedTagIds = ref<number[]>([]);
const tagSaving = ref(false);
const tagsTabLoaded = ref(false);

/** 标签类型 -> 分组标题 */
const TAG_TYPE_LABELS: Record<number, string> = { 10: '行业标签', 20: '业务标签' };

/** 按类型分组渲染可选标签 */
const groupedTags = computed(() => {
  const groups = new Map<number, ExtraTag[]>();
  for (const t of allTags.value) {
    const arr = groups.get(t.type) ?? [];
    arr.push(t);
    groups.set(t.type, arr);
  }
  return [...groups.entries()].map(([type, items]) => {
    const checkedCount = items.filter((i) => checkedTagIds.value.includes(i.id)).length;
    return {
      type,
      label: TAG_TYPE_LABELS[type] ?? `类型${type}`,
      allChecked: checkedCount === items.length,
      indeterminate: checkedCount > 0 && checkedCount < items.length,
      checkedCount,
      total: items.length,
      items,
    };
  });
});

/** 抽屉打开时加载标签清单并回显客户已选 */
watch(
  () => detail.value,
  async (val) => {
    if (!val) {
      tagsTabLoaded.value = false;
      return;
    }
    if (!tagsTabLoaded.value) {
      tagsTabLoaded.value = true;
      allTags.value = await getTagList().catch(() => []);
    }
    checkedTagIds.value = val.tags ?? [];
  },
);

function toggleTagGroup(type: number, checked: boolean) {
  const group = groupedTags.value.find((g) => g.type === type);
  if (!group) return;
  const set = new Set(checkedTagIds.value);
  for (const item of group.items) {
    if (checked) {
      set.add(item.id);
    } else {
      set.delete(item.id);
    }
  }
  checkedTagIds.value = [...set];
}

function toggleTag(tagId: number, checked: boolean) {
  const set = new Set(checkedTagIds.value);
  if (checked) {
    set.add(tagId);
  } else {
    set.delete(tagId);
  }
  checkedTagIds.value = [...set];
}

async function saveTags() {
  if (!detail.value) return;
  tagSaving.value = true;
  try {
    await updateCustomerTags(detail.value.id, checkedTagIds.value);
    message.success('标签已更新');
    await refresh();
  } finally {
    tagSaving.value = false;
  }
}
</script>

<template>
  <Drawer v-model:open="open" :title="detail?.name ?? '客户详情'" width="66%">
    <div v-if="detail" class="space-y-4">
      <Card size="small" title="基本信息">
        <template #extra>
          <div class="flex gap-2">
            <!-- 编辑按钮：必备，置于首位 -->
            <AccessControl :codes="['customer:update']" type="code">
              <Button size="small" type="primary" @click="openEdit">编辑</Button>
            </AccessControl>
          </div>
        </template>
        <Descriptions :column="detailColumns" size="small">
          <!-- 基础标识 -->
          <DescriptionsItem label="客户名称">{{ dash(detail.name) }}</DescriptionsItem>
          <DescriptionsItem label="简称">{{ dash(detail.short_name) }}</DescriptionsItem>
          <DescriptionsItem label="类型">{{ detail.genre === 1 ? '企业' : '个人' }}</DescriptionsItem>
          <!-- 统一证照（企业=信用代码/注册地址，个人=身份证号/身份证地址） -->
          <DescriptionsItem :label="detail.genre === 1 ? '统一社会信用代码' : '证件号码'">
            {{ dash(detail.license_num) }}
          </DescriptionsItem>
          <DescriptionsItem :label="detail.genre === 1 ? '注册地址' : '户籍地址'">
            {{ dash(detail.license_addr) }}
          </DescriptionsItem>

          <!-- 关联归属 -->
          <DescriptionsItem label="管护经理">{{ dash(detail.managementor_name) }}</DescriptionsItem>
          <DescriptionsItem label="风控专员">{{ dash(detail.controler_name) }}</DescriptionsItem>
          <DescriptionsItem label="所属集团">{{ dash(detail.group_name) }}</DescriptionsItem>
          <DescriptionsItem label="授信区域">{{ dash(detail.credit_region_name) }}</DescriptionsItem>
          <DescriptionsItem label="行政区域">{{ dash(detail.region_name) }}</DescriptionsItem>
          <DescriptionsItem label="行业分类">{{ dash(detail.industry_name) }}</DescriptionsItem>

          <!-- 状态/分类 -->
          <DescriptionsItem label="五级分类">
            <Tag :color="classificationColor(detail.classification)">
              {{ dash(detail.classification_display) }}
            </Tag>
          </DescriptionsItem>

          <!-- 金额/汇总 -->
          <DescriptionsItem label="授信额度">{{ detail.credit_amount?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="在保余额">{{ detail.amount?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="流贷余额">{{ detail.custom_flow?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="担保余额">{{ detail.custom_accept?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="反担保余额">{{ detail.custom_back?.toLocaleString() ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="委托贷款">{{ detail.entrusted_loan?.toLocaleString() ?? '—' }}</DescriptionsItem>

          <!-- 时间 -->
          <DescriptionsItem label="最近放款">{{ dash(detail.last_provide_date) }}</DescriptionsItem>
          <DescriptionsItem label="最近评审">{{ dash(detail.last_review_date) }}</DescriptionsItem>
          <DescriptionsItem label="授信到期天数">{{ detail.day_space ?? '—' }}</DescriptionsItem>
          <DescriptionsItem label="数据同步时间">{{ dash(detail.last_synced_at) }}</DescriptionsItem>

          <!-- 审计信息 -->
          <DescriptionsItem label="创建人">{{ dash(detail.created_by_name) }}</DescriptionsItem>
          <DescriptionsItem label="创建时间">{{ dash(detail.created_at) }}</DescriptionsItem>
        </Descriptions>
      </Card>

      <Tabs>
        <!-- 企业扩展 -->
        <TabPane v-if="detail.company" key="company" tab="企业信息">
          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="法定代表人">{{ dash(detail.company.representative) }}</DescriptionsItem>
            <DescriptionsItem label="注册资本">{{ detail.company.capital != null ? detail.company.capital.toLocaleString() : '—' }}</DescriptionsItem>
            <DescriptionsItem label="实收资本">{{ detail.company.paid_capital != null ? detail.company.paid_capital.toLocaleString() : '—' }}</DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 个人扩展 -->
        <TabPane v-if="detail.personal" key="personal" tab="个人信息">
          <Card size="small">
            <template #extra>
              <AccessControl :codes="['customer:update']" type="code">
                <Button
                  v-if="!detail.personal.spouse"
                  size="small"
                  type="primary"
                  @click="openBindSpouse"
                >关联配偶</Button>
                <Popconfirm
                  v-else
                  title="确认解绑配偶？"
                  content="解绑后双方婚姻状态将回到默认（未知）"
                  ok-text="确认解绑"
                  cancel-text="取消"
                  @confirm="submitUnbindSpouse"
                >
                  <Button size="small" danger type="primary">解绑配偶</Button>
                </Popconfirm>
              </AccessControl>
            </template>
            <Descriptions :column="detailColumns" size="small">
              <DescriptionsItem label="婚姻状态">{{ dash(detail.personal.marital_status_display) }}</DescriptionsItem>
              <DescriptionsItem label="户籍性质">{{ dash(detail.personal.household_nature_display) }}</DescriptionsItem>
              <DescriptionsItem label="配偶">
                <template v-if="detail.personal.spouse">
                  {{ dash(detail.personal.spouse.name) }}
                </template>
                <template v-else>—</template>
              </DescriptionsItem>
            </Descriptions>
          </Card>
        </TabPane>

        <!-- 联系人 -->
        <TabPane key="contacts" :tab="`联系人(${detail.contacts?.length ?? 0})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <Input v-model:value="contactForm.name" placeholder="姓名 *" style="width: 120px" />
            <Input v-model:value="contactForm.phone" placeholder="电话 *" style="width: 140px" />
            <Input v-model:value="contactForm.email" placeholder="邮箱" style="width: 160px" />
            <Input v-model:value="contactForm.addr" placeholder="联系地址" style="width: 200px" />
            <Checkbox v-model:checked="contactForm.is_primary">首选</Checkbox>
            <Input v-model:value="contactForm.remark" placeholder="备注" style="width: 140px" />
            <AccessControl :codes="['customer:update']" type="code">
              <Button size="small" type="primary" @click="submitContact">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '姓名', dataIndex: 'name', width: 110 },
              { title: '电话', dataIndex: 'phone', width: 140 },
              { title: '邮箱', dataIndex: 'email', width: 170, ellipsis: true },
              { title: '联系地址', dataIndex: 'addr', ellipsis: true },
              { title: '备注', dataIndex: 'remark', width: 140, ellipsis: true },
              { title: '首选', dataIndex: 'is_primary', width: 70, align: 'center' },
              { title: '创建人', dataIndex: 'created_by_name', width: 100, ellipsis: true },
              { title: '操作', key: 'op', width: 70, align: 'center' },
            ]"
            :data-source="detail.contacts ?? []"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'name'">
                <a @click="openContactEdit(record)">{{ dash(record.name) }}</a>
              </template>
              <template v-else-if="column.dataIndex === 'phone'">
                {{ dash(record.phone) }}
              </template>
              <template v-else-if="column.dataIndex === 'email'">
                {{ dash(record.email) }}
              </template>
              <template v-else-if="column.dataIndex === 'addr'">
                {{ dash(record.addr) }}
              </template>
              <template v-else-if="column.dataIndex === 'remark'">
                {{ dash(record.remark) }}
              </template>
              <template v-else-if="column.dataIndex === 'is_primary'">
                <Tag v-if="record.is_primary" color="blue">首选</Tag>
              </template>
              <template v-else-if="column.dataIndex === 'created_by_name'">
                {{ dash(record.created_by_name) }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['customer:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteContact(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 股东(独立 API 拉取) -->
        <TabPane v-if="detail.genre === 1" key="shareholders" :tab="`股东(${shareholderList.length})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <Input v-model:value="shareholderForm.shareholder_name" placeholder="股东名称" style="width: 140px" />
            <InputNumber v-model:value="shareholderForm.invested_amount" placeholder="投资额" style="width: 120px" />
            <InputNumber v-model:value="shareholderForm.shareholding_ratio" placeholder="持股% (≤100)" style="width: 120px" />
            <AccessControl :codes="['customer:update']" type="code">
              <Button size="small" type="primary" @click="submitShareholder">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '股东名称', dataIndex: 'shareholder_name' },
              { title: '投资额', dataIndex: 'invested_amount' },
              { title: '持股比例(%)', dataIndex: 'shareholding_ratio' },
              { title: '操作', key: 'op', width: 70 },
            ]"
            :data-source="shareholderList"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'shareholder_name'">
                {{ dash(record.shareholder_name) }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['customer:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteShareholder(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 董事(独立 API 拉取) -->
        <TabPane v-if="detail.genre === 1" key="directors" :tab="`董事(${directorList.length})`">
          <div class="mb-2 flex items-center gap-2">
            <Input v-model:value="directorName" placeholder="董事姓名" style="width: 160px" />
            <AccessControl :codes="['customer:update']" type="code">
              <Button size="small" type="primary" @click="submitDirector">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '姓名', dataIndex: 'director_name' },
              { title: '操作', key: 'op', width: 70 },
            ]"
            :data-source="directorList"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'director_name'">
                {{ dash(record.director_name) }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['customer:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteDirector(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 核心企业额度（有额度记录即显示） -->
        <TabPane v-if="detail.core_info" key="core-limits" tab="核心企业额度">
          <div v-if="detail.core_info" class="mb-3">
            <Descriptions :column="detailColumns" size="small">
              <DescriptionsItem label="累计已用">{{ detail.core_info.total_used_amount.toLocaleString() }}</DescriptionsItem>
            </Descriptions>
          </div>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <InputNumber v-model:value="limitForm.credit_amount" placeholder="额度" style="width: 130px" />
            <DatePicker v-model:value="limitForm.valid_begin_date" value-format="YYYY-MM-DD" placeholder="生效日" style="width: 150px" />
            <DatePicker v-model:value="limitForm.valid_end_date" value-format="YYYY-MM-DD" placeholder="到期日" style="width: 150px" />
            <AccessControl :codes="['customer:update']" type="code">
              <Button size="small" type="primary" @click="submitLimit">新增额度</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '额度', dataIndex: 'credit_amount' },
              { title: '已用', dataIndex: 'used_amount' },
              { title: '剩余', dataIndex: 'remaining_amount' },
              { title: '有效期', key: 'valid' },
              { title: '状态', dataIndex: 'status' },
            ]"
            :data-source="(detail as any).core_limits ?? []"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'valid'">
                {{ record.valid_begin_date }} ~ {{ record.valid_end_date }}
              </template>
              <template v-else-if="column.dataIndex === 'status'">
                <Tag :color="record.status === 10 ? 'green' : 'default'">
                  {{ record.status === 10 ? '生效' : '失效' }}
                </Tag>
              </template>
            </template>
          </Table>
        </TabPane>
        <!-- 客户标签(参照 system/roles 权限配置：分组多选 + 保存) -->
        <TabPane key="tags" :tab="`客户标签(${checkedTagIds.length})`">
          <div class="mb-2 flex justify-end">
            <AccessControl :codes="['customer:update']" type="code">
              <Button :loading="tagSaving" size="small" type="primary" @click="saveTags">
                保存标签
              </Button>
            </AccessControl>
          </div>
          <div
            v-for="group in groupedTags"
            :key="group.type"
            class="mb-3 overflow-hidden rounded border border-gray-200"
          >
            <!-- 分组标题行：整行可点击，点击全选/全不选 -->
            <div
              class="flex items-center gap-2 bg-gray-50 px-3 py-2 font-medium"
              @click="toggleTagGroup(group.type, !group.allChecked)"
            >
              <Checkbox
                :checked="group.allChecked"
                :indeterminate="group.indeterminate"
                @click.stop
                @change="(e: any) => toggleTagGroup(group.type, e.target.checked)"
              />
              <span>{{ group.label }}</span>
              <span class="ml-auto text-xs text-gray-400">
                {{ group.checkedCount }} / {{ group.total }}
              </span>
            </div>
            <!-- 子标签区 -->
            <div class="flex flex-wrap gap-x-5 gap-y-2 p-3">
              <Checkbox
                v-for="t in group.items"
                :key="t.id"
                :checked="checkedTagIds.includes(t.id)"
                @change="(e: any) => toggleTag(t.id, e.target.checked)"
              >
                {{ t.name }}
              </Checkbox>
            </div>
          </div>
          <div v-if="!groupedTags.length" class="text-gray-400">暂无可选标签(请先在客户标签页创建)</div>
        </TabPane>

        <!-- 经营快照(仅企业客户，独立 API 拉取历史) -->
        <TabPane v-if="detail.genre === 1" key="extends" :tab="`经营快照(${extendList.length})`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <InputNumber
              v-model:value="extendForm.sales_revenue"
              :min="0"
              :precision="2"
              placeholder="营业收入 *"
              style="width: 160px"
            />
            <InputNumber
              v-model:value="extendForm.total_assets"
              :min="0"
              :precision="2"
              placeholder="总资产 *"
              style="width: 160px"
            />
            <InputNumber
              v-model:value="extendForm.people_engaged"
              :min="0"
              :precision="0"
              placeholder="从业人数 *"
              style="width: 140px"
            />
            <DatePicker
              v-model:value="extendForm.data_date"
              value-format="YYYY-MM-DD"
              placeholder="基准日 *"
              style="width: 160px"
            />
            <AccessControl :codes="['customer:update']" type="code">
              <Button size="small" type="primary" @click="submitExtend">添加</Button>
            </AccessControl>
          </div>
          <Table
            :columns="[
              { title: '基准日', dataIndex: 'data_date', width: 120 },
              { title: '营业收入', dataIndex: 'sales_revenue', ellipsis: true },
              { title: '总资产', dataIndex: 'total_assets', ellipsis: true },
              { title: '从业人数', dataIndex: 'people_engaged', width: 100, align: 'right' },
              { title: '划型', dataIndex: 'typing', width: 80, align: 'center' },
              { title: '创建人', dataIndex: 'created_by_name', width: 100, ellipsis: true },
              { title: '操作', key: 'op', width: 70, align: 'center' },
            ]"
            :data-source="extendList"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'sales_revenue'">
                {{ Number(record.sales_revenue).toLocaleString() }}
              </template>
              <template v-else-if="column.dataIndex === 'total_assets'">
                {{ Number(record.total_assets).toLocaleString() }}
              </template>
              <template v-else-if="column.dataIndex === 'typing'">
                {{ dictStore.labelOf('customer.typing', record.typing) }}
              </template>
              <template v-else-if="column.key === 'op'">
                <AccessControl :codes="['customer:update']" type="code">
                  <Popconfirm @confirm="() => onDeleteExtend(record)">
                    <Button danger size="small" type="link">删除</Button>
                  </Popconfirm>
                </AccessControl>
              </template>
            </template>
          </Table>
        </TabPane>
      </Tabs>
    </div>

    <!-- 客户编辑 Modal(字段对齐后端 CustomerUpdate，留空表示保持不变) -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="编辑客户"
      @ok="submitEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Alert banner class="mb-3" message="留空字段保持原值不变" type="info" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="客户名称">
          <Input v-model:value="editForm.name" :disabled="!canUpdate" placeholder="留空保持不变" />
        </FormItem>
        <FormItem label="简称">
          <Input v-model:value="editForm.short_name" :disabled="!canUpdate" placeholder="留空保持不变" />
        </FormItem>
        <FormItem label="授信额度">
          <InputNumber v-model:value="editForm.credit_amount" :disabled="!canUpdate" :min="0" :precision="2" class="!w-full" placeholder="留空保持不变" />
        </FormItem>
        <FormItem label="行政区域">
          <RegionTreeSelect
            v-model:value="editForm.region_id"
            :disabled="!canUpdate"
            allow-clear
            placeholder="留空保持不变"
          />
        </FormItem>
        <FormItem label="行业分类">
          <TreeSelect
            show-search
            :filter-tree-node="filterTreeOption"
            v-model:value="editForm.industry_id"
            :disabled="!canUpdate"
            :field-names="{ label: 'title', value: 'value', children: 'children' }"
            :tree-data="industryTreeData"
            allow-clear
            placeholder="留空保持不变"
            tree-default-expand-all
          />
        </FormItem>
      </Form>
    </Modal>

    <!-- 联系人编辑 Modal -->
    <Modal
      v-model:open="editContactVisible"
      :confirm-loading="editContactLoading"
      title="编辑联系人"
      @ok="submitContactEdit"
    >
      <Form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <FormItem label="姓名 *">
          <Input v-model:value="editContactForm.name" :placeholder="'必填'" />
        </FormItem>
        <FormItem label="电话 *">
          <Input v-model:value="editContactForm.phone" :placeholder="'必填'" />
        </FormItem>
        <FormItem label="邮箱">
          <Input v-model:value="editContactForm.email" placeholder="可空" />
        </FormItem>
        <FormItem label="联系地址">
          <Input v-model:value="editContactForm.addr" placeholder="可空" />
        </FormItem>
        <FormItem label="首选联系人">
          <Switch v-model:checked="editContactForm.is_primary" />
        </FormItem>
        <FormItem label="备注">
          <Input v-model:value="editContactForm.remark" placeholder="可空" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 绑定配偶 Modal -->
    <Modal
      v-model:open="bindSpouseVisible"
      title="关联配偶"
      :confirm-loading="bindSpouseLoading"
      ok-text="确认绑定"
      cancel-text="取消"
      @ok="submitBindSpouse"
    >
      <div class="py-2">
        <div class="mb-2 text-sm text-gray-500">选择要绑定的个人客户（双方婚姻状态将置为"已婚"）：</div>
        <SearchSelect
          v-model:value="bindSpouseForm.spouse_customer_id"
          :options="bindSpouseOptions"
          placeholder="输入客户名搜索"
          style="width: 100%"
        />
      </div>
    </Modal>
  </Drawer>
</template>

