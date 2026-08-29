<script lang="ts" setup>
/** 客户详情抽屉：基本信息 / 企业扩展 / 股东 / 董事 / 核心企业额度 / 客户标签。 */

import type { CustomerDetail, ExtraTag } from '#/api/basic/customer';

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
  Table,
  Tabs,
  TabPane,
  Tag,
  TreeSelect,
} from 'ant-design-vue';

import {
  addCoreLimit,
  addDirector,
  addShareholder,
  deleteCustomer,
  deleteDirector,
  deleteShareholder,
  getCustomerDetail,
  getTagList,
  listDirectors,
  listShareholders,
  updateCustomer,
  updateCustomerTags,
} from '#/api/basic/customer';
import RegionTreeSelect from '#/components/RegionTreeSelect/index.vue';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { dash, opt, toTreeData, filterTreeOption } from '#/utils/format';

import { getIndustryTree } from '#/api/basic/dict';

const props = defineProps<{ customerId: null | number }>();
const emit = defineEmits<{ updated: [] }>();

// 详情基本信息响应式列数（视口越宽列越多）
const { columns: detailColumns } = useDetailColumns();

const open = defineModel<boolean>('open', { default: false });
const detail = ref<null | CustomerDetail>(null);
const loading = ref(false);

// 股东 / 董事：详情接口只返回计数，数据走独立 API
const shareholderList = ref<any[]>([]);
const directorList = ref<any[]>([]);

const classificationColor = (c: number) =>
  ({ 10: 'green', 20: 'blue', 30: 'orange', 40: 'red', 50: 'red' })[c] ?? 'default';
/** 抽屉内操作完成后刷新抽屉 + 通知列表 */
async function refresh() {
  await load();
  emit('updated');
}

async function load() {
  if (!props.customerId) return;
  loading.value = true;
  try {
    detail.value = await getCustomerDetail(props.customerId);
    // 股东 / 董事并行拉取（Tab 懒数据，失败不影响主信息）
    const [shareholders, directors] = await Promise.all([
      listShareholders(props.customerId).catch(() => []),
      listDirectors(props.customerId).catch(() => []),
    ]);
    shareholderList.value = shareholders;
    directorList.value = directors;
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

// ===== 编辑（CustomerUpdate，所有字段直接生效） =====
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
  contact_addr: '',
  linkman: '',
  contact_num: '',
  region_id: undefined as number | undefined,
  industry_id: undefined as number | undefined,
});

async function openEdit() {
  if (!detail.value) return;
  // 编辑需要行业全量（仅首次加载）；区域懒加载/搜索已封装进 RegionTreeSelect 组件
  if (!industryTreeData.value.length) {
    industryTreeData.value = toTreeData(await getIndustryTree());
  }
  Object.assign(editForm, {
    name: detail.value.name ?? '',
    short_name: detail.value.short_name ?? '',
    credit_amount: detail.value.credit_amount ?? undefined,
    managementor_id: undefined, // 留空保持不变
    contact_addr: (detail.value as any).contact_addr ?? '',
    linkman: (detail.value as any).linkman ?? '',
    contact_num: (detail.value as any).contact_num ?? '',
    region_id: undefined, // 留空保持不变（后端 exclude_unset）
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
      contact_addr: opt(editForm.contact_addr),
      linkman: opt(editForm.linkman),
      contact_num: opt(editForm.contact_num),
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

// ===== 注销（收纳在抽屉内） =====
async function onDelete() {
  if (!detail.value) return;
  await deleteCustomer(detail.value.id);
  message.success('客户已注销');
  open.value = false;
  emit('updated');
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
  message.success('额度已创建（旧额度自动失效）');
  await refresh();
}

// ===== 客户标签（参照 system/roles 权限配置：分组多选 + 保存） =====
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
  return [...groups.entries()].map(([type, items]) => ({
    type,
    label: TAG_TYPE_LABELS[type] ?? `类型${type}`,
    allChecked: items.every((i) => checkedTagIds.value.includes(i.id)),
    items,
  }));
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
            <AccessControl :codes="['customer:delete']" type="code">
              <Popconfirm title="确认注销该客户？" @confirm="onDelete">
                <Button danger size="small">注销</Button>
              </Popconfirm>
            </AccessControl>
          </div>
        </template>
        <Descriptions :column="detailColumns" size="small">
          <DescriptionsItem label="客户名称">{{ dash(detail.name) }}</DescriptionsItem>
          <DescriptionsItem label="简称">{{ dash(detail.short_name) }}</DescriptionsItem>
          <DescriptionsItem label="类型">{{ detail.genre === 1 ? '企业' : '个人' }}</DescriptionsItem>
          <DescriptionsItem label="五级分类">
            <Tag :color="classificationColor(detail.classification)">
              {{ dash(detail.classification_display) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="管护经理">{{ dash(detail.managementor_name) }}</DescriptionsItem>
          <DescriptionsItem label="风控专员">{{ dash(detail.controler_name) }}</DescriptionsItem>
          <DescriptionsItem label="联系人">{{ dash((detail as any).linkman) }}</DescriptionsItem>
          <DescriptionsItem label="联系电话">{{ dash((detail as any).contact_num) }}</DescriptionsItem>
          <DescriptionsItem label="授信额度">{{ detail.credit_amount.toLocaleString() }}</DescriptionsItem>
          <DescriptionsItem label="在保余额">{{ detail.amount.toLocaleString() }}</DescriptionsItem>
          <DescriptionsItem label="所属集团">{{ dash(detail.group_name) }}</DescriptionsItem>
          <DescriptionsItem label="授信区域">{{ dash(detail.credit_region_name) }}</DescriptionsItem>
          <DescriptionsItem v-if="detail.is_core" label="核心企业">
            <Tag color="purple">是</Tag>
          </DescriptionsItem>
          <DescriptionsItem v-if="detail.is_acceptor" label="承兑人">
            <Tag color="cyan">是</Tag>
          </DescriptionsItem>
        </Descriptions>
      </Card>

      <Tabs>
        <!-- 企业扩展 -->
        <TabPane v-if="detail.company" key="company" tab="企业信息">
          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="统一社会信用代码">{{ dash(detail.company.credit_code) }}</DescriptionsItem>
            <DescriptionsItem label="法定代表人">{{ dash(detail.company.representative) }}</DescriptionsItem>
            <DescriptionsItem label="注册资本">{{ detail.company.capital?.toLocaleString() ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="实收资本">{{ detail.company.paid_capital?.toLocaleString() ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="注册地址" :span="detailColumns">{{ dash(detail.company.registered_addr) }}</DescriptionsItem>
          </Descriptions>
          <div v-if="detail.latest_extend" class="mt-3">
            <Card size="small" title="最新经营快照">
              <Descriptions :column="detailColumns" size="small">
                <DescriptionsItem label="营业收入">{{ detail.latest_extend.sales_revenue.toLocaleString() }}</DescriptionsItem>
                <DescriptionsItem label="总资产">{{ detail.latest_extend.total_assets.toLocaleString() }}</DescriptionsItem>
                <DescriptionsItem label="从业人数">{{ detail.latest_extend.people_engaged }}</DescriptionsItem>
              </Descriptions>
            </Card>
          </div>
        </TabPane>

        <!-- 个人扩展 -->
        <TabPane v-if="detail.personal" key="personal" tab="个人信息">
          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="证件号码">{{ dash(detail.personal.license_num) }}</DescriptionsItem>
            <DescriptionsItem label="户籍地址">{{ dash(detail.personal.license_addr) }}</DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 股东（独立 API 拉取） -->
        <TabPane v-if="detail.genre === 1" key="shareholders" :tab="`股东（${shareholderList.length}）`">
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

        <!-- 董事（独立 API 拉取） -->
        <TabPane v-if="detail.genre === 1" key="directors" :tab="`董事（${directorList.length}）`">
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

        <!-- 核心企业额度 -->
        <TabPane v-if="detail.is_core" key="core-limits" tab="核心企业额度">
          <div v-if="detail.core_info" class="mb-3">
            <Descriptions :column="detailColumns" size="small">
              <DescriptionsItem label="核心占比">{{ detail.core_info.core_rate ?? '—' }}%</DescriptionsItem>
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
        <!-- 客户标签（参照 system/roles 权限配置：分组多选 + 保存） -->
        <TabPane key="tags" :tab="`客户标签（${checkedTagIds.length}）`">
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
            class="mb-3 rounded border border-gray-200 p-3"
          >
            <Checkbox
              :checked="group.allChecked"
              class="mb-2 font-medium"
              @change="(e: any) => toggleTagGroup(group.type, e.target.checked)"
            >
              {{ group.label }}
            </Checkbox>
            <!-- 不用 CheckboxGroup：多个 Group 绑同一数组会互相覆盖，改为独立 Checkbox 手动维护 -->
            <div class="flex flex-wrap gap-y-1">
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
          <div v-if="!groupedTags.length" class="text-gray-400">暂无可选标签（请先在客户标签页创建）</div>
        </TabPane>
      </Tabs>
    </div>

    <!-- 客户编辑 Modal（字段对齐后端 CustomerUpdate，留空表示保持不变） -->
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
        <FormItem label="联系人">
          <Input v-model:value="editForm.linkman" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="联系电话">
          <Input v-model:value="editForm.contact_num" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="联系地址">
          <Input v-model:value="editForm.contact_addr" :disabled="!canUpdate" />
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
  </Drawer>
</template>

