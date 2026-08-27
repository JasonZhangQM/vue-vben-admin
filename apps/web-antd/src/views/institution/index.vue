<script lang="ts" setup>
import type { InstitutionListItem } from '#/api/basic/institution';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

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
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  TabPane,
  Tag,
} from 'ant-design-vue';

import {
  addAgreement,
  addBranch,
  addContact,
  createInstitution,
  deleteBranch,
  deleteContact,
  deleteAgreement,
  deleteInstitution,
  changeInstitutionStatus,
  getInstitutionDetail,
  getInstitutionList,
} from '#/api/basic/institution';

// 机构枚举（与后端 institution/enums.py 对齐）
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

// ================= 列表 =================
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
  // 银行类必须选择子类型（后端 4001 校验）
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

async function openDetail(row: any) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getInstitutionDetail(row.id);
  } catch {
    // 拉取失败也要能关闭抽屉（detail 保持 null，仅提示）
    detailVisible.value = false;
    message.error('机构详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

// 子资源快速添加（简化弹窗，联系人/分支/协议共用行内表单模式）
const contactForm = reactive({ name: '', phone: '' });
const branchForm = reactive({ name: '', short_name: '', branch_addr: '' });
const agreementForm = reactive({
  agreement_type: 10,
  flow_credit: 0,
  back_credit: 0,
  valid_begin_date: '',
  valid_end_date: '',
});

async function submitContact() {
  if (!detail.value || !contactForm.name) return;
  await addContact(detail.value.id, { ...contactForm });
  contactForm.name = '';
  contactForm.phone = '';
  message.success('联系人已添加');
  detail.value = await getInstitutionDetail(detail.value.id);
}

async function submitBranch() {
  if (!detail.value || !branchForm.name) return;
  await addBranch(detail.value.id, { ...branchForm });
  Object.assign(branchForm, { name: '', short_name: '', branch_addr: '' });
  message.success('分支机构已添加');
  detail.value = await getInstitutionDetail(detail.value.id);
}

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
  detail.value = await getInstitutionDetail(detail.value.id);
}

// ================= 行操作 =================
async function onToggleStatus(row: any) {
  await changeInstitutionStatus(row.id, row.status === 10 ? 20 : 10);
  message.success('状态已变更');
  await loadList();
}

async function onDelete(row: any) {
  await deleteInstitution(row.id);
  message.success('已注销');
  await loadList();
}

const columns: TableColumnType[] = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '机构名称', dataIndex: 'name', ellipsis: true },
  { title: '简称', dataIndex: 'short_name', width: 120 },
  { title: '类型', dataIndex: 'institution_type', width: 100 },
  { title: '法定代表人', dataIndex: 'legal_representative', width: 110 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '操作', key: 'actions', width: 220, fixed: 'right' },
];

onMounted(loadList);
</script>

<template>
  <Page title="机构管理" description="合作银行 / 担保 / 中介机构与授信协议维护">
    <Card>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.q"
          allow-clear
          placeholder="机构名称"
          style="width: 200px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <Select
          v-model:value="query.institution_type"
          :options="TYPE_OPTIONS"
          allow-clear
          placeholder="类型"
          style="width: 120px"
        />
        <Select
          v-model:value="query.status"
          :options="STATUS_OPTIONS"
          allow-clear
          placeholder="状态"
          style="width: 110px"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <AccessControl :codes="['institution:create']" type="code">
          <Button type="primary" @click="openCreate">新增机构</Button>
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
        :scroll="{ x: 900 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'institution_type'">
            {{ typeLabel(record.institution_type) }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="statusColor(record.status)">
              {{ record.status === 10 ? '正常' : record.status === 90 ? '注销' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <Button size="small" type="link" @click="openDetail(record)">详情</Button>
              <AccessControl :codes="['institution:update']" type="code">
                <Button size="small" type="link" @click="onToggleStatus(record)">
                  {{ record.status === 10 ? '停用' : '启用' }}
                </Button>
              </AccessControl>
              <AccessControl :codes="['institution:delete']" type="code">
                <Popconfirm title="确认注销该机构？" @confirm="onDelete(record)">
                  <Button danger size="small" type="link">注销</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
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
          <Select v-model:value="createForm.institution_type" :options="TYPE_OPTIONS" />
        </FormItem>
        <FormItem v-if="createForm.institution_type === 10" label="银行子类" required>
          <Select
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

    <!-- 机构详情 -->
    <Drawer v-model:open="detailVisible" title="机构详情" width="720">
      <div v-if="detail" class="space-y-4">
        <Card size="small" title="基本信息">
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>名称：{{ detail.name }}</div>
            <div>简称：{{ detail.short_name || '—' }}</div>
            <div>类型：{{ detail.institution_type_display || typeLabel(detail.institution_type) }}</div>
            <div>法定代表人：{{ detail.legal_representative || '—' }}</div>
            <div>状态：<Tag :color="statusColor(detail.status)">{{ detail.status_display }}</Tag></div>
            <div>联系人：{{ detail.contact_count }} / 分支：{{ detail.branch_count }}</div>
          </div>
        </Card>

        <Tabs>
          <TabPane key="contacts" :tab="`联系人（${detail.contacts.length}）`">
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
                <template v-if="column.dataIndex === 'is_primary'">
                  <Tag v-if="record.is_primary" color="blue">是</Tag>
                  <span v-else>—</span>
                </template>
                <template v-else-if="column.key === 'op'">
                  <AccessControl :codes="['institution:update']" type="code">
                    <Popconfirm @confirm="async () => {
                      await deleteContact(detail!.id, record.id);
                      detail = await getInstitutionDetail(detail!.id);
                    }">
                      <Button danger size="small" type="link">删除</Button>
                    </Popconfirm>
                  </AccessControl>
                </template>
              </template>
            </Table>
          </TabPane>

          <TabPane key="branches" :tab="`分支机构（${detail.branches.length}）`">
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
                <template v-if="column.key === 'op'">
                  <AccessControl :codes="['institution:update']" type="code">
                    <Popconfirm @confirm="async () => {
                      await deleteBranch(detail!.id, record.id);
                      detail = await getInstitutionDetail(detail!.id);
                    }">
                      <Button danger size="small" type="link">删除</Button>
                    </Popconfirm>
                  </AccessControl>
                </template>
              </template>
            </Table>
          </TabPane>

          <TabPane key="agreements" :tab="`授信协议（${detail.agreements.length}）`">
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <Select v-model:value="agreementForm.agreement_type" :options="AGREEMENT_TYPE_OPTIONS" size="small" style="width: 110px" />
              <InputNumber v-model:value="agreementForm.flow_credit" placeholder="流量额度" style="width: 130px" />
              <InputNumber v-model:value="agreementForm.back_credit" placeholder="保函额度" style="width: 130px" />
              <Input v-model:value="agreementForm.valid_begin_date" placeholder="生效日 2026-01-01" style="width: 140px" />
              <Input v-model:value="agreementForm.valid_end_date" placeholder="到期日 2028-12-31" style="width: 140px" />
              <AccessControl :codes="['institution:update']" type="code">
                <Button size="small" type="primary" @click="submitAgreement">添加</Button>
              </AccessControl>
            </div>
            <Table
              :columns="[
                { title: '类型', dataIndex: 'agreement_type', customRender: ({ text }) => AGREEMENT_TYPE_OPTIONS.find(o => o.value === text)?.label ?? text },
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
                <template v-if="column.key === 'valid'">
                  {{ record.valid_begin_date }} ~ {{ record.valid_end_date }}
                </template>
                <template v-else-if="column.key === 'op'">
                  <AccessControl :codes="['institution:update']" type="code">
                    <Popconfirm @confirm="async () => {
                      await deleteAgreement(detail!.id, record.id);
                      detail = await getInstitutionDetail(detail!.id);
                    }">
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
  </Page>
</template>
