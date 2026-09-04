<script lang="ts" setup>
import type { InstitutionListItem } from '#/api/basic/institution';
import type { TableColumnType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl, useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

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
  Space,
  Switch,
  Table,
  Tabs,
  TabPane,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { useRowHighlight } from '#/composables/useRowHighlight';
import { dash, opt } from '#/utils/format';

import {
  addAgreement,
  addBranch,
  addContact,
  createInstitution,
  deleteAgreement,
  deleteBranch,
  deleteContact,
  deleteInstitution,
  changeInstitutionStatus,
  getInstitutionDetail,
  getInstitutionList,
  updateAgreement,
  updateBranch,
  updateContact,
  updateInstitution,
} from '#/api/basic/institution';

// 机构枚举(与后端 institution/enums.py 对齐)
const TYPE_OPTIONS = [
  { label: '银行', value: 10 },
  { label: '担保', value: 20 },
  { label: '律所', value: 30 },
  { label: '评估', value: 40 },
  { label: '会计师', value: 50 },
  { label: '其他', value: 90 },
];
const SUBTYPE_OPTIONS = [
  { label: '国有', value: 10 },
  { label: '股份', value: 20 },
  { label: '城商', value: 30 },
  { label: '农商', value: 40 },
  { label: '外资', value: 50 },
  { label: '民营', value: 60 },
];
const STATUS_OPTIONS = [
  { label: '正常', value: 10 },
  { label: '停用', value: 20 },
];
const AGREEMENT_TYPE_OPTIONS = [
  { label: '综合授信', value: 10 },
  { label: '保函授信', value: 20 },
  { label: '服务协议', value: 30 },
  { label: '委贷协议', value: 40 },
];

const typeLabel = (v: number) => TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
const statusColor = (s: number) => ({ 10: 'green', 20: 'red', 90: 'default' })[s] ?? 'default';

// 表格行点击高亮(useRowHighlight composable 全局共享)
const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

// 详情基本信息响应式列数(视口越宽列越多)
const { columns: detailColumns } = useDetailColumns();
const loading = ref(false);
const list = ref<InstitutionListItem[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  page_size: 20,
  q: '',
  institution_type: undefined as number | undefined,
  status: undefined as number | undefined,
});

async function loadList() {
  loading.value = true;
  try {
    const data = await getInstitutionList(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

/** 重置：清空全部筛选条件并回到第 1 页重新查询 */
function resetQuery() {
  query.q = '';
  query.institution_type = undefined;
  query.status = undefined;
  query.page = 1;
  loadList();
}

// ================= 新建 =================
const createVisible = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  name: '',
  short_name: '',
  institution_type: 10 as number,
  institution_subtype: undefined as number | undefined,
  legal_representative: '',
});

function openCreate() {
  Object.assign(createForm, {
    name: '', short_name: '', institution_type: 10,
    institution_subtype: undefined, legal_representative: '',
  });
  createVisible.value = true;
}

async function submitCreate() {
  if (!createForm.name) {
    message.warning('请填写机构名称');
    return;
  }
  // 银行类必须选择子类型(后端 4001 校验)
  if (createForm.institution_type === 10 && !createForm.institution_subtype) {
    message.warning('银行类机构必须选择子类型');
    return;
  }
  createLoading.value = true;
  try {
    await createInstitution({
      name: createForm.name,
      short_name: createForm.short_name || undefined,
      institution_type: createForm.institution_type,
      institution_subtype:
        createForm.institution_type === 10 ? createForm.institution_subtype : undefined,
      legal_representative: createForm.legal_representative || undefined,
    });
    message.success('机构创建成功');
    createVisible.value = false;
    await loadList();
  } finally {
    createLoading.value = false;
  }
}

// ================= 详情抽屉 =================
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<null | {
  id: number;
  name: string;
  [key: string]: any; // 后端扁平结构：机构字段在顶层 + contacts/branches/agreements
}>(null);

/** 抽屉内操作完成后同步刷新抽屉与列表 */
async function reloadDetail() {
  if (!detail.value) return;
  detail.value = await getInstitutionDetail(detail.value.id);
  await loadList();
}

async function openDetail(row: any) {
  highlightRow(row);
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getInstitutionDetail(row.id);
  } catch {
    // 拉取失败自动关闭抽屉，避免页面挂死
    detailVisible.value = false;
    message.error('机构详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

// ---------- 机构编辑(InstitutionUpdate 自由字段，可少不可多) ----------
const { hasAccessByCodes } = useAccess();
const canUpdate = computed(() => hasAccessByCodes(['institution:update']));

const editVisible = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  name: '',
  short_name: '',
  institution_subtype: undefined as number | undefined,
  credit_code: '',
  legal_representative: '',
  registered_addr: '',
  contact_addr: '',
  contact_num: '',
  email: '',
  up_scale: undefined as number | undefined,
});

function openEdit() {
  if (!detail.value) return;
  Object.assign(editForm, {
    name: detail.value.name ?? '',
    short_name: detail.value.short_name ?? '',
    institution_subtype: detail.value.institution_subtype ?? undefined,
    credit_code: detail.value.credit_code ?? '',
    legal_representative: detail.value.legal_representative ?? '',
    registered_addr: detail.value.registered_addr ?? '',
    contact_addr: detail.value.contact_addr ?? '',
    contact_num: detail.value.contact_num ?? '',
    email: detail.value.email ?? '',
    up_scale: detail.value.up_scale ?? undefined,
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!detail.value) return;
  editLoading.value = true;
  try {
    await updateInstitution(detail.value.id, {
      name: opt(editForm.name),
      short_name: opt(editForm.short_name),
      institution_subtype: editForm.institution_subtype,
      credit_code: opt(editForm.credit_code),
      legal_representative: opt(editForm.legal_representative),
      registered_addr: opt(editForm.registered_addr),
      contact_addr: opt(editForm.contact_addr),
      contact_num: opt(editForm.contact_num),
      email: opt(editForm.email),
      up_scale: editForm.up_scale,
    });
    message.success('机构信息已更新');
    editVisible.value = false;
    await reloadDetail();
  } finally {
    editLoading.value = false;
  }
}

// ---------- 状态变更 / 注销(收纳在抽屉内，列表页不放) ----------
async function onToggleStatus() {
  if (!detail.value) return;
  await changeInstitutionStatus(detail.value.id, detail.value.status === 10 ? 20 : 10);
  message.success('状态已变更');
  await reloadDetail();
}

async function onDelete() {
  if (!detail.value) return;
  await deleteInstitution(detail.value.id);
  message.success('已注销');
  detailVisible.value = false;
  await loadList();
}

// ================= 子资源：联系人 =================
const contactForm = reactive({ name: '', phone: '' });

async function submitContact() {
  if (!detail.value || !contactForm.name) return;
  await addContact(detail.value.id, { ...contactForm });
  contactForm.name = '';
  contactForm.phone = '';
  message.success('联系人已添加');
  await reloadDetail();
}

// 联系人编辑(ContactUpdate 自由字段)
const contactEditVisible = ref(false);
const contactEditLoading = ref(false);
const contactEditForm = reactive({
  id: 0,
  name: '',
  job: '',
  phone: '',
  email: '',
  is_primary: false,
  remark: '',
});

function openContactEdit(record: any) {
  Object.assign(contactEditForm, {
    id: record.id,
    name: record.name ?? '',
    job: record.job ?? '',
    phone: record.phone ?? '',
    email: record.email ?? '',
    is_primary: !!record.is_primary,
    remark: record.remark ?? '',
  });
  contactEditVisible.value = true;
}

async function submitContactEdit() {
  if (!detail.value) return;
  contactEditLoading.value = true;
  try {
    await updateContact(detail.value.id, contactEditForm.id, {
      name: opt(contactEditForm.name),
      job: opt(contactEditForm.job),
      phone: opt(contactEditForm.phone),
      email: opt(contactEditForm.email),
      is_primary: contactEditForm.is_primary,
      remark: opt(contactEditForm.remark),
    });
    message.success('联系人已更新');
    contactEditVisible.value = false;
    await reloadDetail();
  } finally {
    contactEditLoading.value = false;
  }
}

async function onDeleteContact(record: any) {
  if (!detail.value) return;
  await deleteContact(detail.value.id, record.id);
  message.success('联系人已删除');
  await reloadDetail();
}

// ================= 子资源：分支机构 =================
const branchForm = reactive({ name: '', short_name: '', branch_addr: '' });

async function submitBranch() {
  if (!detail.value || !branchForm.name) return;
  await addBranch(detail.value.id, { ...branchForm });
  Object.assign(branchForm, { name: '', short_name: '', branch_addr: '' });
  message.success('分支机构已添加');
  await reloadDetail();
}

// 分支机构编辑(BranchUpdate 自由字段，status 不进编辑弹窗)
const branchEditVisible = ref(false);
const branchEditLoading = ref(false);
const branchEditForm = reactive({
  id: 0,
  name: '',
  short_name: '',
  branch_addr: '',
  contact_num: '',
});

function openBranchEdit(record: any) {
  Object.assign(branchEditForm, {
    id: record.id,
    name: record.name ?? '',
    short_name: record.short_name ?? '',
    branch_addr: record.branch_addr ?? '',
    contact_num: record.contact_num ?? '',
  });
  branchEditVisible.value = true;
}

async function submitBranchEdit() {
  if (!detail.value) return;
  branchEditLoading.value = true;
  try {
    await updateBranch(detail.value.id, branchEditForm.id, {
      name: opt(branchEditForm.name),
      short_name: opt(branchEditForm.short_name),
      branch_addr: opt(branchEditForm.branch_addr),
      contact_num: opt(branchEditForm.contact_num),
    });
    message.success('分支机构已更新');
    branchEditVisible.value = false;
    await reloadDetail();
  } finally {
    branchEditLoading.value = false;
  }
}

async function onDeleteBranch(record: any) {
  if (!detail.value) return;
  await deleteBranch(detail.value.id, record.id);
  message.success('分支机构已删除');
  await reloadDetail();
}

// ================= 子资源：授信协议 =================
const agreementForm = reactive({
  agreement_type: 10,
  flow_credit: 0,
  back_credit: 0,
  valid_begin_date: '',
  valid_end_date: '',
});

async function submitAgreement() {
  if (!detail.value || !agreementForm.valid_begin_date || !agreementForm.valid_end_date) {
    message.warning('请填写协议有效期');
    return;
  }
  await addAgreement(detail.value.id, { ...agreementForm });
  Object.assign(agreementForm, {
    agreement_type: 10, flow_credit: 0, back_credit: 0,
    valid_begin_date: '', valid_end_date: '',
  });
  message.success('协议已创建');
  await reloadDetail();
}

// 协议编辑(AgreementUpdate 自由字段子集)
const agreementEditVisible = ref(false);
const agreementEditLoading = ref(false);
const agreementEditForm = reactive({
  id: 0,
  flow_credit: undefined as number | undefined,
  back_credit: undefined as number | undefined,
  valid_end_date: '',
  remark: '',
});

function openAgreementEdit(record: any) {
  Object.assign(agreementEditForm, {
    id: record.id,
    flow_credit: record.flow_credit ?? undefined,
    back_credit: record.back_credit ?? undefined,
    valid_end_date: record.valid_end_date ?? '',
    remark: record.remark ?? '',
  });
  agreementEditVisible.value = true;
}

async function submitAgreementEdit() {
  if (!detail.value) return;
  agreementEditLoading.value = true;
  try {
    await updateAgreement(detail.value.id, agreementEditForm.id, {
      flow_credit: agreementEditForm.flow_credit,
      back_credit: agreementEditForm.back_credit,
      valid_end_date: agreementEditForm.valid_end_date || undefined,
      remark: opt(agreementEditForm.remark),
    });
    message.success('协议已更新');
    agreementEditVisible.value = false;
    await reloadDetail();
  } finally {
    agreementEditLoading.value = false;
  }
}

async function onDeleteAgreement(record: any) {
  if (!detail.value) return;
  await deleteAgreement(detail.value.id, record.id);
  message.success('协议已删除');
  await reloadDetail();
}

// ================= 列定义(无 ID 列 / 无操作列，名称列链接化) =================
const columns: TableColumnType[] = [
  { title: '机构名称', dataIndex: 'name' }, // 详情入口链接列：不加 ellipsis
  { title: '简称', dataIndex: 'short_name', ellipsis: true },
  { title: '类型', dataIndex: 'institution_type', ellipsis: true },
  { title: '法定代表人', dataIndex: 'legal_representative', ellipsis: true },
  { title: '状态', dataIndex: 'status', ellipsis: true },
  { title: '创建人', dataIndex: 'created_by_name', ellipsis: true },
];

onMounted(loadList);
</script>

<template>
  <!-- 不传 title/description：不渲染页头，表格区域最大化 -->
  <Page>
    <!-- 筛选区：独立 Card -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.q"
          allow-clear
          placeholder="机构名称"
          style="width: 200px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <SearchSelect
          v-model:value="query.institution_type"
          :options="TYPE_OPTIONS"
          allow-clear
          placeholder="类型"
          style="width: 120px"
        />
        <SearchSelect
          v-model:value="query.status"
          :options="STATUS_OPTIONS"
          allow-clear
          placeholder="状态"
          style="width: 110px"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <div class="flex-1" />
        <AccessControl :codes="['institution:create']" type="code">
          <Button type="primary" @click="openCreate">新增机构</Button>
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
          <template v-if="column.dataIndex === 'name'">
            <!-- 名称列即详情入口(不加 ellipsis) -->
            <a @click="openDetail(record)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'institution_type'">
            {{ typeLabel(record.institution_type) }}
          </template>
          <template v-else-if="column.dataIndex === 'legal_representative'">
            {{ dash(record.legal_representative) }}
          </template>
          <template v-else-if="column.dataIndex === 'short_name'">
            {{ dash(record.short_name) }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="statusColor(record.status)">
              {{ record.status === 10 ? '正常' : record.status === 90 ? '注销' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'created_by_name'">
            {{ dash(record.created_by_name) }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建机构 -->
    <Modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      title="新增机构"
      @ok="submitCreate"
    >
      <Form :label-col="{ span: 5 }" :model="createForm" :wrapper-col="{ span: 17 }">
        <FormItem label="机构名称" required>
          <Input v-model:value="createForm.name" placeholder="如：杭州银行股份有限公司" />
        </FormItem>
        <FormItem label="简称">
          <Input v-model:value="createForm.short_name" />
        </FormItem>
        <FormItem label="机构类型" required>
          <SearchSelect v-model:value="createForm.institution_type" :options="TYPE_OPTIONS" />
        </FormItem>
        <FormItem v-if="createForm.institution_type === 10" label="银行子类" required>
          <SearchSelect
            v-model:value="createForm.institution_subtype"
            :options="SUBTYPE_OPTIONS"
            placeholder="银行类必选"
          />
        </FormItem>
        <FormItem label="法定代表人">
          <Input v-model:value="createForm.legal_representative" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 机构详情抽屉：66% 宽度 -->
    <Drawer v-model:open="detailVisible" title="机构详情" width="66%">
      <div v-if="detail" class="space-y-4">
        <Card size="small" title="基本信息">
          <template #extra>
            <Space :size="4">
              <!-- 编辑按钮：必备，置于首位 -->
              <AccessControl :codes="['institution:update']" type="code">
                <Button size="small" type="primary" @click="openEdit">修改</Button>
              </AccessControl>
              <AccessControl :codes="['institution:update']" type="code">
                <Button size="small" @click="onToggleStatus">
                  {{ detail.status === 10 ? '停用' : '启用' }}
                </Button>
              </AccessControl>
              <AccessControl :codes="['institution:delete']" type="code">
                <Popconfirm title="确认注销该机构？" @confirm="onDelete">
                  <Button danger size="small">注销</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="名称">{{ dash(detail.name) }}</DescriptionsItem>
            <DescriptionsItem label="简称">{{ dash(detail.short_name) }}</DescriptionsItem>
            <DescriptionsItem label="类型">
              {{ detail.institution_type_display || typeLabel(detail.institution_type) }}
            </DescriptionsItem>
            <DescriptionsItem label="银行子类">
              {{ detail.institution_subtype_display || '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="法定代表人">{{ dash(detail.legal_representative) }}</DescriptionsItem>
            <DescriptionsItem label="状态">
              <Tag :color="statusColor(detail.status)">{{ detail.status_display }}</Tag>
            </DescriptionsItem>
            <DescriptionsItem label="信用代码">{{ dash(detail.credit_code) }}</DescriptionsItem>
            <DescriptionsItem label="联系人 / 分支">
              {{ detail.contact_count }} / {{ detail.branch_count }}
            </DescriptionsItem>
            <DescriptionsItem label="注册地址" :span="detailColumns">{{ dash(detail.registered_addr) }}</DescriptionsItem>
            <DescriptionsItem label="联系地址">{{ dash(detail.contact_addr) }}</DescriptionsItem>
            <DescriptionsItem label="联系电话">{{ dash(detail.contact_num) }}</DescriptionsItem>
            <DescriptionsItem label="邮箱">{{ dash(detail.email) }}</DescriptionsItem>
            <DescriptionsItem label="上浮比例">{{ dash(detail.up_scale) }}</DescriptionsItem>
          </Descriptions>
        </Card>

        <Tabs>
          <!-- 联系人 Tab：首列链接化打开编辑 Modal -->
          <TabPane key="contacts" :tab="`联系人(${detail.contacts.length})`">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <Input v-model:value="contactForm.name" placeholder="姓名" style="width: 120px" />
              <Input v-model:value="contactForm.phone" placeholder="电话" style="width: 160px" />
              <AccessControl :codes="['institution:update']" type="code">
                <Button size="small" type="primary" @click="submitContact">添加</Button>
              </AccessControl>
            </div>
            <Table
              :columns="[
                { title: '姓名', dataIndex: 'name' },
                { title: '电话', dataIndex: 'phone' },
                { title: '主要', dataIndex: 'is_primary', width: 70 },
                { title: '操作', key: 'op', width: 70 },
              ]"
              :data-source="detail.contacts"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'name'">
                  <a @click="openContactEdit(record)">{{ record.name }}</a>
                </template>
                <template v-else-if="column.dataIndex === 'phone'">
                  {{ dash(record.phone) }}
                </template>
                <template v-else-if="column.dataIndex === 'is_primary'">
                  <Tag v-if="record.is_primary" color="blue">是</Tag>
                  <span v-else>—</span>
                </template>
                <template v-else-if="column.key === 'op'">
                  <AccessControl :codes="['institution:update']" type="code">
                    <Popconfirm @confirm="() => onDeleteContact(record)">
                      <Button danger size="small" type="link">删除</Button>
                    </Popconfirm>
                  </AccessControl>
                </template>
              </template>
            </Table>
          </TabPane>

          <!-- 分支机构 Tab -->
          <TabPane key="branches" :tab="`分支机构(${detail.branches.length})`">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <Input v-model:value="branchForm.name" placeholder="名称" style="width: 140px" />
              <Input v-model:value="branchForm.short_name" placeholder="简称" style="width: 100px" />
              <Input v-model:value="branchForm.branch_addr" placeholder="地址" style="width: 180px" />
              <AccessControl :codes="['institution:update']" type="code">
                <Button size="small" type="primary" @click="submitBranch">添加</Button>
              </AccessControl>
            </div>
            <Table
              :columns="[
                { title: '名称', dataIndex: 'name' },
                { title: '简称', dataIndex: 'short_name' },
                { title: '地址', dataIndex: 'branch_addr' },
                { title: '操作', key: 'op', width: 70 },
              ]"
              :data-source="detail.branches"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'name'">
                  <a @click="openBranchEdit(record)">{{ record.name }}</a>
                </template>
                <template v-else-if="column.key === 'op'">
                  <AccessControl :codes="['institution:update']" type="code">
                    <Popconfirm @confirm="() => onDeleteBranch(record)">
                      <Button danger size="small" type="link">删除</Button>
                    </Popconfirm>
                  </AccessControl>
                </template>
              </template>
            </Table>
          </TabPane>

          <!-- 授信协议 Tab -->
          <TabPane key="agreements" :tab="`授信协议(${detail.agreements.length})`">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <SearchSelect v-model:value="agreementForm.agreement_type" :options="AGREEMENT_TYPE_OPTIONS" size="small" style="width: 110px" />
              <InputNumber v-model:value="agreementForm.flow_credit" placeholder="流量额度" style="width: 130px" />
              <InputNumber v-model:value="agreementForm.back_credit" placeholder="保函额度" style="width: 130px" />
              <DatePicker v-model:value="agreementForm.valid_begin_date" value-format="YYYY-MM-DD" placeholder="生效日" style="width: 150px" />
              <DatePicker v-model:value="agreementForm.valid_end_date" value-format="YYYY-MM-DD" placeholder="到期日" style="width: 150px" />
              <AccessControl :codes="['institution:update']" type="code">
                <Button size="small" type="primary" @click="submitAgreement">添加</Button>
              </AccessControl>
            </div>
            <Table
              :columns="[
                { title: '类型', dataIndex: 'agreement_type' },
                { title: '流量额度', dataIndex: 'flow_credit' },
                { title: '保函额度', dataIndex: 'back_credit' },
                { title: '有效期', key: 'valid' },
                { title: '操作', key: 'op', width: 70 },
              ]"
              :data-source="detail.agreements"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'agreement_type'">
                  <!-- 首列链接：打开协议编辑 Modal -->
                  <a @click="openAgreementEdit(record)">
                    {{ AGREEMENT_TYPE_OPTIONS.find((o) => o.value === record.agreement_type)?.label ?? record.agreement_type }}
                  </a>
                </template>
                <template v-else-if="column.key === 'valid'">
                  {{ record.valid_begin_date }} ~ {{ record.valid_end_date }}
                </template>
                <template v-else-if="column.key === 'op'">
                  <AccessControl :codes="['institution:update']" type="code">
                    <Popconfirm @confirm="() => onDeleteAgreement(record)">
                      <Button danger size="small" type="link">删除</Button>
                    </Popconfirm>
                  </AccessControl>
                </template>
              </template>
            </Table>
          </TabPane>
        </Tabs>
      </div>
    </Drawer>

    <!-- 机构编辑 Modal(字段对齐后端 InstitutionUpdate) -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="修改机构"
      @ok="submitEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="机构名称">
          <Input v-model:value="editForm.name" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="简称">
          <Input v-model:value="editForm.short_name" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="银行子类">
          <SearchSelect
            v-model:value="editForm.institution_subtype"
            :disabled="!canUpdate"
            :options="SUBTYPE_OPTIONS"
            allow-clear
            placeholder="仅银行类机构"
          />
        </FormItem>
        <FormItem label="信用代码">
          <Input v-model:value="editForm.credit_code" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="法定代表人">
          <Input v-model:value="editForm.legal_representative" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="注册地址">
          <Input v-model:value="editForm.registered_addr" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="联系地址">
          <Input v-model:value="editForm.contact_addr" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="联系电话">
          <Input v-model:value="editForm.contact_num" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="邮箱">
          <Input v-model:value="editForm.email" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="上浮比例">
          <InputNumber
            v-model:value="editForm.up_scale"
            :disabled="!canUpdate"
            :min="0"
            class="w-full"
          />
        </FormItem>
      </Form>
    </Modal>

    <!-- 联系人编辑 Modal(字段对齐后端 ContactUpdate) -->
    <Modal
      v-model:open="contactEditVisible"
      :confirm-loading="contactEditLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="修改联系人"
      @ok="submitContactEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="姓名">
          <Input v-model:value="contactEditForm.name" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="职务">
          <Input v-model:value="contactEditForm.job" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="电话">
          <Input v-model:value="contactEditForm.phone" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="邮箱">
          <Input v-model:value="contactEditForm.email" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="主要联系人">
          <Switch v-model:checked="contactEditForm.is_primary" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="备注">
          <Input v-model:value="contactEditForm.remark" :disabled="!canUpdate" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 分支机构编辑 Modal(字段对齐后端 BranchUpdate) -->
    <Modal
      v-model:open="branchEditVisible"
      :confirm-loading="branchEditLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="修改分支机构"
      @ok="submitBranchEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="名称">
          <Input v-model:value="branchEditForm.name" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="简称">
          <Input v-model:value="branchEditForm.short_name" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="地址">
          <Input v-model:value="branchEditForm.branch_addr" :disabled="!canUpdate" />
        </FormItem>
        <FormItem label="联系电话">
          <Input v-model:value="branchEditForm.contact_num" :disabled="!canUpdate" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 授信协议编辑 Modal(字段对齐后端 AgreementUpdate 子集) -->
    <Modal
      v-model:open="agreementEditVisible"
      :confirm-loading="agreementEditLoading"
      :ok-button-props="{ disabled: !canUpdate }"
      title="修改授信协议"
      @ok="submitAgreementEdit"
    >
      <Alert v-if="!canUpdate" banner class="mb-3" message="无修改权限，仅可查看" type="warning" />
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="流量额度">
          <InputNumber
            v-model:value="agreementEditForm.flow_credit"
            :disabled="!canUpdate"
            :min="0"
            class="w-full"
          />
        </FormItem>
        <FormItem label="保函额度">
          <InputNumber
            v-model:value="agreementEditForm.back_credit"
            :disabled="!canUpdate"
            :min="0"
            class="w-full"
          />
        </FormItem>
        <FormItem label="到期日">
          <DatePicker
            v-model:value="agreementEditForm.valid_end_date"
            :disabled="!canUpdate"
            class="w-full"
            value-format="YYYY-MM-DD"
          />
        </FormItem>
        <FormItem label="备注">
          <Input v-model:value="agreementEditForm.remark" :disabled="!canUpdate" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

