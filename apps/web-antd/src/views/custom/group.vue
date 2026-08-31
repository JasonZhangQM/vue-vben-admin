<script lang="ts" setup>
/** 集团管理：树形列表(合并口径统计)+ 新建/编辑 + 详情抽屉(成员/子集团)。 */

import type { TableColumnType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
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
  Table,
  Tabs,
  TabPane,
  TreeSelect,
} from 'ant-design-vue';

import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  getCustomerList,
  getGroupDetail,
  getGroupTree,
  listGroupMembers,
  removeGroupMember,
  updateGroup,
} from '#/api/basic/customer';
import type { GroupDetail, GroupTreeNode } from '#/api/basic/customer';
import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { useRowHighlight } from '#/composables/useRowHighlight';
import { useDictStore } from '#/store/dict';
import { dash, filterTreeOption, formatAmount, opt, toTreeData } from '#/utils/format';

const dictStore = useDictStore();

// 表格行点击高亮(全局共享 composable)
const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

// 详情基本信息响应式列数(视口越宽列越多)
const { columns: detailColumns } = useDetailColumns();

// ================= 树列表 =================
const loading = ref(false);
const tree = ref<GroupTreeNode[]>([]);
const keyword = ref('');
const expandedRowKeys = ref<number[]>([]); // 受控展开(配合 全部展开/收起)

/** 叶子节点 children:[] → undefined(AntD Table 空数组仍渲染展开箭头) */
function normalize(nodes: GroupTreeNode[]): GroupTreeNode[] {
  return nodes.map((n) => {
    const children = n.children?.length ? normalize(n.children) : undefined;
    return { ...n, children } as GroupTreeNode;
  });
}

/** 关键字本地过滤树：命中保留整棵子树；子孙命中则保留路径节点 */
function filterTree(nodes: GroupTreeNode[], kw: string): GroupTreeNode[] {
  return nodes.reduce<GroupTreeNode[]>((acc, n) => {
    const hit =
      n.name.toLowerCase().includes(kw) || n.code.toLowerCase().includes(kw);
    if (hit) {
      acc.push(n);
    } else {
      const subs = filterTree(n.children ?? [], kw);
      if (subs.length > 0) acc.push({ ...n, children: subs });
    }
    return acc;
  }, []);
}

const displayTree = computed(() =>
  normalize(filterTree(tree.value, keyword.value.trim().toLowerCase())),
);

/** 收集全部节点 id(受控展开用) */
function collectIds(nodes: GroupTreeNode[], acc: number[] = []): number[] {
  for (const n of nodes) {
    acc.push(n.id);
    if (n.children?.length) collectIds(n.children, acc);
  }
  return acc;
}

async function loadTree(keepExpand = true) {
  loading.value = true;
  try {
    tree.value = await getGroupTree();
    if (!keepExpand) expandedRowKeys.value = [];
  } finally {
    loading.value = false;
  }
}

function toggleExpandAll() {
  const all = collectIds(tree.value);
  expandedRowKeys.value =
    expandedRowKeys.value.length >= all.length ? [] : all;
}

/** 单行展开/收起(受控 expandedRowKeys) */
function handleExpand(expanded: boolean, record: GroupTreeNode) {
  expandedRowKeys.value = expanded
    ? [...expandedRowKeys.value, record.id]
    : expandedRowKeys.value.filter((k) => k !== record.id);
}

/** 重置：清空关键字重新过滤 */
function resetQuery() {
  keyword.value = '';
}

/** 集团下拉树(新建/编辑选上级集团；含"(顶级)"项，选 0 = 无上级) */
const parentTreeData = computed(() => [
  { key: 0, title: '(顶级)', value: 0, children: toTreeData(tree.value) },
]);

const columns: TableColumnType[] = [
  { title: '集团名称', dataIndex: 'name' }, // 详情入口链接列：不加 ellipsis
  { title: '编码', dataIndex: 'code', ellipsis: true },
  { title: '母公司', dataIndex: 'parent_customer_name', ellipsis: true },
  { title: '成员数', dataIndex: 'member_count', width: 90, ellipsis: true },
  { title: '在保汇总', dataIndex: 'total_insure_amount', width: 140, ellipsis: true },
  { title: '授信额度', dataIndex: 'credit_amount', width: 140, ellipsis: true },
  { title: '创建人', dataIndex: 'created_by_name', ellipsis: true },
];

// ================= 客户远程搜索(母公司 / 添加成员共用) =================
const customerOptions = ref<{ label: string; value: number }[]>([]);
let customerSearchToken = 0;

async function searchCustomers(kw: string) {
  const token = ++customerSearchToken; // 防乱序回写
  const data = await getCustomerList({
    q: kw || undefined,
    genre: 1, // 母公司/成员必须是企业客户
    page: 1,
    page_size: 20,
  });
  if (token !== customerSearchToken) return;
  customerOptions.value = data.items.map((c) => ({
    label: c.name,
    value: c.id,
  }));
}

// ================= 新建 =================
const createVisible = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  code: '',
  name: '',
  parent_id: 0 as number,
  parent_customer_id: undefined as number | undefined,
  credit_amount: undefined as number | undefined,
  description: '',
});

function openCreate() {
  Object.assign(createForm, {
    code: '',
    name: '',
    parent_id: 0,
    parent_customer_id: undefined,
    credit_amount: undefined,
    description: '',
  });
  customerOptions.value = [];
  createVisible.value = true;
  searchCustomers(''); // 预加载企业客户：不输关键字也有默认选项
}

async function submitCreate() {
  if (!createForm.code.trim() || !createForm.name.trim()) {
    message.warning('请填写集团编码与名称');
    return;
  }
  if (!createForm.parent_customer_id) {
    message.warning('请选择母公司客户');
    return;
  }
  createLoading.value = true;
  try {
    await createGroup({
      code: createForm.code.trim(),
      name: createForm.name.trim(),
      parent_id: createForm.parent_id || undefined,
      parent_customer_id: createForm.parent_customer_id,
      credit_amount: createForm.credit_amount ?? 0,
      description: opt(createForm.description),
    });
    message.success('集团已创建(母公司已自动加入成员)');
    createVisible.value = false;
    await loadTree();
  } finally {
    createLoading.value = false;
  }
}

// ================= 详情抽屉 =================
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<GroupDetail | null>(null);

async function openDetail(record: any) {
  highlightRow(record);
  detailVisible.value = true;
  await reloadDetail(record.id);
}

async function reloadDetail(id: number) {
  detailLoading.value = true;
  try {
    detail.value = await getGroupDetail(id);
    membersQuery.page = 1;
    await loadMembers(id);
  } catch {
    // 详情拉取失败：自动关闭抽屉(错误提示由全局拦截器弹出)
    detailVisible.value = false;
    detail.value = null;
  } finally {
    detailLoading.value = false;
  }
}

/** 删除集团(后端拦截：仍有成员/子集团) */
async function onDelete() {
  if (!detail.value) return;
  await deleteGroup(detail.value.id);
  message.success('集团已删除');
  detailVisible.value = false;
  detail.value = null;
  await loadTree();
}

// ---- 成员 Tab(直接成员，独立分页接口) ----
const membersLoading = ref(false);
const members = ref<any[]>([]);
const membersTotal = ref(0);
const membersQuery = reactive({ page: 1, page_size: 20 });

async function loadMembers(groupId: number) {
  membersLoading.value = true;
  try {
    const data = await listGroupMembers(groupId, {
      page: membersQuery.page,
      page_size: membersQuery.page_size,
    });
    members.value = data.items;
    membersTotal.value = data.total;
  } finally {
    membersLoading.value = false;
  }
}

const memberColumns: TableColumnType[] = [
  { title: '客户名称', dataIndex: 'name' }, // 成员属客户模块维护，此处仅展示
  { title: '简称', dataIndex: 'short_name', ellipsis: true },
  { title: '五级分类', dataIndex: 'classification', width: 100, ellipsis: true },
  { title: '客户状态', dataIndex: 'custom_state', width: 100, ellipsis: true },
  { title: '管护人', dataIndex: 'managementor_name', ellipsis: true },
  { title: '授信额度', dataIndex: 'credit_amount', width: 130, ellipsis: true },
  { title: '在保金额', dataIndex: 'amount', width: 130, ellipsis: true },
  { title: '操作', key: 'op', width: 70 },
];

/** 移除成员(母公司不可移除——前端禁用，后端兜底拦截) */
async function onRemoveMember(record: any) {
  if (!detail.value) return;
  await removeGroupMember(detail.value.id, record.id);
  message.success('已移除');
  // 刷新抽屉(汇总数字)+ 成员列表 + 树(成员数变化)
  await reloadDetail(detail.value.id);
  await loadTree();
}

// ---- 添加成员 ----
const memberAddVisible = ref(false);
const memberAddLoading = ref(false);
const memberAddIds = ref<number[]>([]);

function openMemberAdd() {
  memberAddIds.value = [];
  customerOptions.value = [];
  memberAddVisible.value = true;
  searchCustomers(''); // 预加载企业客户
}

async function submitMemberAdd() {
  if (!detail.value) return;
  if (memberAddIds.value.length === 0) {
    message.warning('请选择要加入的客户');
    return;
  }
  memberAddLoading.value = true;
  try {
    const { added } = await addGroupMembers(detail.value.id, memberAddIds.value);
    message.success(`已加入 ${added} 家成员企业`);
    memberAddVisible.value = false;
    await reloadDetail(detail.value.id);
    await loadTree();
  } finally {
    memberAddLoading.value = false;
  }
}

// ---- 子集团 Tab ----
const subColumns: TableColumnType[] = [
  { title: '集团名称', dataIndex: 'name' }, // 链接列：打开子集团详情
  { title: '编码', dataIndex: 'code', ellipsis: true },
  { title: '母公司', dataIndex: 'parent_customer_name', ellipsis: true },
  { title: '成员数', dataIndex: 'member_count', width: 90, ellipsis: true },
  { title: '在保汇总', dataIndex: 'total_insure_amount', width: 140, ellipsis: true },
];

// ================= 编辑 =================
const editVisible = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  id: 0,
  name: '',
  parent_id: undefined as number | undefined,
  parent_customer_id: undefined as number | undefined,
  credit_amount: 0 as number,
  description: '',
});

function openEdit() {
  if (!detail.value) return;
  Object.assign(editForm, {
    id: detail.value.id,
    name: detail.value.name,
    parent_id: detail.value.parent_id ?? undefined,
    parent_customer_id: undefined, // 留空 = 不修改(换母公司才选新值)
    credit_amount: detail.value.credit_amount,
    description: detail.value.description ?? '',
  });
  // 预置当前母公司进 options 供回显(搜索时会被替换)
  customerOptions.value = detail.value.parent_customer_id
    ? [
        {
          label: detail.value.parent_customer_name ?? `客户#${detail.value.parent_customer_id}`,
          value: detail.value.parent_customer_id,
        },
      ]
    : [];
  editVisible.value = true;
}

/** GroupUpdate：name/credit_amount/description 全字段提交；
 * parent_id / parent_customer_id 留空 = 不修改(换值才生效) */
async function submitEdit() {
  if (!editForm.name.trim()) {
    message.warning('请填写集团名称');
    return;
  }
  editLoading.value = true;
  try {
    await updateGroup(editForm.id, {
      name: editForm.name.trim(),
      parent_id: editForm.parent_id,
      parent_customer_id: editForm.parent_customer_id,
      credit_amount: editForm.credit_amount ?? 0,
      description: opt(editForm.description),
    });
    message.success('修改成功');
    editVisible.value = false;
    await reloadDetail(editForm.id);
    await loadTree();
  } finally {
    editLoading.value = false;
  }
}

onMounted(() => {
  dictStore.loadAll();
  loadTree(false);
});
</script>

<template>
  <!-- 不传 title/description：不渲染页头，表格区域最大化 -->
  <Page>
    <!-- 筛选区：独立 Card -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="keyword"
          allow-clear
          placeholder="集团名称 / 编码(实时过滤)"
          style="width: 240px"
        />
        <Button @click="resetQuery">重置</Button>
        <Button @click="toggleExpandAll">
          {{ expandedRowKeys.length > 0 ? '全部收起' : '全部展开' }}
        </Button>
        <div class="flex-1" />
        <AccessControl :codes="['customer:create']" type="code">
          <Button type="primary" @click="openCreate">新增集团</Button>
        </AccessControl>
      </div>
    </Card>

    <!-- 树形表格：集团 → 下属集团 -->
    <Card size="small">
      <Table
        :columns="columns"
        :custom-row="customRow"
        :data-source="displayTree"
        :expandable="{ expandedRowKeys, onExpand: handleExpand }"
        :loading="loading"
        :pagination="false"
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
          <template v-else-if="column.dataIndex === 'parent_customer_name'">
            {{ dash(record.parent_customer_name) }}
          </template>
          <template v-else-if="column.dataIndex === 'total_insure_amount'">
            {{ formatAmount(record.total_insure_amount) }}
          </template>
          <template v-else-if="column.dataIndex === 'credit_amount'">
            {{ formatAmount(record.credit_amount) }}
          </template>
          <template v-else-if="column.dataIndex === 'created_by_name'">
            {{ dash(record.created_by_name) }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建集团：母公司必选(自动加入成员)，上级集团可选 -->
    <Modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      title="新增集团"
      @ok="submitCreate"
    >
      <Form :label-col="{ span: 5 }" :model="createForm" :wrapper-col="{ span: 17 }">
        <FormItem label="集团编码" required>
          <Input v-model:value="createForm.code" placeholder="如：G-2026-001" />
        </FormItem>
        <FormItem label="集团名称" required>
          <Input v-model:value="createForm.name" />
        </FormItem>
        <FormItem label="上级集团">
          <TreeSelect
            v-model:value="createForm.parent_id"
            :filter-tree-node="filterTreeOption"
            :tree-data="parentTreeData"
            allow-clear
            placeholder="默认顶级"
            tree-default-expand-all
            tree-node-filter-prop="title"
          />
        </FormItem>
        <FormItem label="母公司" required>
          <SearchSelect
            v-model:value="createForm.parent_customer_id"
            :options="customerOptions"
            placeholder="输入名称搜索企业客户"
            remote
            style="width: 100%"
            @search="searchCustomers"
          />
        </FormItem>
        <FormItem label="授信额度">
          <InputNumber
            v-model:value="createForm.credit_amount"
            :min="0"
            placeholder="0"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="描述">
          <Input.TextArea v-model:value="createForm.description" :rows="2" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 集团详情抽屉：66% 宽度 -->
    <Drawer v-model:open="detailVisible" title="集团详情" width="66%">
      <div v-if="detail" class="space-y-4">
        <Card size="small" title="基本信息">
          <template #extra>
            <Space :size="4">
              <!-- 编辑按钮：必备，置于首位 -->
              <AccessControl :codes="['customer:update']" type="code">
                <Button size="small" type="primary" @click="openEdit">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['customer:delete']" type="code">
                <Popconfirm title="确认删除该集团？" @confirm="onDelete">
                  <Button danger size="small">删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="名称">{{ dash(detail.name) }}</DescriptionsItem>
            <DescriptionsItem label="编码">{{ dash(detail.code) }}</DescriptionsItem>
            <DescriptionsItem label="母公司">
              {{ dash(detail.parent_customer_name) }}
            </DescriptionsItem>
            <DescriptionsItem label="成员数(含子集团)">
              {{ detail.member_count }}
            </DescriptionsItem>
            <DescriptionsItem label="在保汇总(含子集团)">
              {{ formatAmount(detail.total_insure_amount) }}
            </DescriptionsItem>
            <DescriptionsItem label="授信额度">
              {{ formatAmount(detail.credit_amount) }}
            </DescriptionsItem>
            <DescriptionsItem label="创建人 / 时间">
              {{ dash(detail.created_by_name) }} / {{ detail.created_at }}
            </DescriptionsItem>
            <DescriptionsItem label="描述" :span="detailColumns">
              {{ dash(detail.description) }}
            </DescriptionsItem>
          </Descriptions>
        </Card>

        <Tabs>
          <!-- 成员企业 Tab：直接成员(分页)，母公司不可移除 -->
          <TabPane key="members" tab="成员企业">
            <div class="mb-2">
              <AccessControl :codes="['customer:update']" type="code">
                <Button size="small" type="primary" @click="openMemberAdd">
                  添加成员
                </Button>
              </AccessControl>
            </div>
            <Table
              :columns="memberColumns"
              :data-source="members"
              :loading="membersLoading"
              :pagination="{
                current: membersQuery.page,
                pageSize: membersQuery.page_size,
                total: membersTotal,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (t: number) => `共 ${t} 条`,
                onChange: (p: number) => {
                  membersQuery.page = p;
                  if (detail) loadMembers(detail.id);
                },
                onShowSizeChange: (_c: number, s: number) => {
                  membersQuery.page = 1;
                  membersQuery.page_size = s;
                  if (detail) loadMembers(detail.id);
                },
              }"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'classification'">
                  {{ dictStore.labelOf('customer.classification', record.classification) }}
                </template>
                <template v-else-if="column.dataIndex === 'custom_state'">
                  {{ dictStore.labelOf('customer.custom_state', record.custom_state) }}
                </template>
                <template v-else-if="column.dataIndex === 'credit_amount'">
                  {{ formatAmount(record.credit_amount) }}
                </template>
                <template v-else-if="column.dataIndex === 'amount'">
                  {{ formatAmount(record.amount) }}
                </template>
                <template v-else-if="column.key === 'op'">
                  <!-- 母公司不可移除(后端兜底拦截) -->
                  <AccessControl :codes="['customer:update']" type="code">
                    <Popconfirm
                      v-if="record.id !== detail?.parent_customer_id"
                      title="确认移除该成员？"
                      @confirm="() => onRemoveMember(record)"
                    >
                      <Button danger size="small" type="link">移除</Button>
                    </Popconfirm>
                    <span v-else>—</span>
                  </AccessControl>
                </template>
              </template>
            </Table>
          </TabPane>

          <!-- 子集团 Tab：名称链接打开该子集团详情 -->
          <TabPane key="subgroups" :tab="`下属集团(${detail.children?.length ?? 0})`">
            <Table
              :columns="subColumns"
              :data-source="detail.children ?? []"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'name'">
                  <a @click="openDetail(record)">{{ record.name }}</a>
                </template>
                <template v-else-if="column.dataIndex === 'parent_customer_name'">
                  {{ dash(record.parent_customer_name) }}
                </template>
                <template v-else-if="column.dataIndex === 'total_insure_amount'">
                  {{ formatAmount(record.total_insure_amount) }}
                </template>
              </template>
            </Table>
          </TabPane>
        </Tabs>
      </div>
    </Drawer>

    <!-- 添加成员：批量多选企业客户 -->
    <Modal
      v-model:open="memberAddVisible"
      :confirm-loading="memberAddLoading"
      title="添加成员企业"
      @ok="submitMemberAdd"
    >
      <SearchSelect
        v-model:value="memberAddIds"
        :options="customerOptions"
        mode="multiple"
        placeholder="输入名称搜索企业客户(可多选)"
        remote
        style="width: 100%"
        @search="searchCustomers"
      />
    </Modal>

    <!-- 编辑集团：parent 两项留空 = 不修改 -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      title="编辑集团"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :model="editForm" :wrapper-col="{ span: 17 }">
        <FormItem label="集团名称" required>
          <Input v-model:value="editForm.name" />
        </FormItem>
        <FormItem label="上级集团">
          <TreeSelect
            v-model:value="editForm.parent_id"
            :filter-tree-node="filterTreeOption"
            :tree-data="parentTreeData"
            allow-clear
            placeholder="不修改"
            tree-default-expand-all
            tree-node-filter-prop="title"
          />
        </FormItem>
        <FormItem label="母公司">
          <SearchSelect
            v-model:value="editForm.parent_customer_id"
            :options="customerOptions"
            placeholder="不修改(换母公司才选择新值)"
            remote
            style="width: 100%"
            @search="searchCustomers"
          />
        </FormItem>
        <FormItem label="授信额度">
          <InputNumber
            v-model:value="editForm.credit_amount"
            :min="0"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="描述">
          <Input.TextArea v-model:value="editForm.description" :rows="2" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
