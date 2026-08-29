<script lang="ts" setup>
/** 角色管理：角色名称列为详情入口；编辑/删除/权限配置收纳在详情抽屉。 */

import type { PermissionItem, RoleDetail, RoleListItem } from '#/api/system/role';
import type { TableColumnType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  TabPane,
  Tag,
  Textarea,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';

import {
  assignRolePermissions,
  createRole,
  deleteRole,
  getPermissionList,
  getRoleDetail,
  getRoleList,
  updateRole,
} from '#/api/system/role';
import { getDataScopeDict } from '#/api/system/log';

// ================= 列表 =================
const loading = ref(false);
const list = ref<RoleListItem[]>([]);
const scopeDict = ref<{ label: string; value: number }[]>([]);
const scopeMap = computed(() => new Map(scopeDict.value.map((d) => [d.value, d.label])));

async function loadList() {
  loading.value = true;
  try {
    list.value = await getRoleList();
  } finally {
    loading.value = false;
  }
}

// ================= 详情抽屉 =================
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<null | RoleDetail>(null);

// 行点击高亮：记录当前行 key
const activeRowKey = ref<number>();
const customRow = (record: any) => ({
  onClick: () => {
    activeRowKey.value = record.id;
  },
});
const rowClassName = (record: any) =>
  record.id === activeRowKey.value ? 'row-active' : '';

function openDetail(row: any) {
  activeRowKey.value = row.id; // 打开详情即高亮该行
  detailOpen.value = true;
  detail.value = null;
  loadDetail(row.id);
}

async function loadDetail(id: number) {
  detailLoading.value = true;
  try {
    detail.value = await getRoleDetail(id);
  } catch {
    // 详情拉取失败：自动关闭抽屉 + 错误提示，避免页面挂死
    detailOpen.value = false;
    detail.value = null;
    message.error('角色详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

/** 抽屉内操作完成后刷新抽屉 + 通知列表 */
async function refresh() {
  if (detail.value) await loadDetail(detail.value.id);
  await loadList();
}

const userColumns: TableColumnType[] = [
  { title: '用户名', dataIndex: 'username', width: 110 },
  { title: '姓名', dataIndex: 'name', width: 110 },
  { title: '部门', dataIndex: 'dept_name' },
  { title: '职务', dataIndex: 'position' },
];

// ================= 编辑 Modal（RoleUpdate 自由字段：名称 / 数据范围 / 描述） =================
const editVisible = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  id: 0,
  name: '',
  data_scope: 20,
  description: '',
});

function openEdit() {
  if (!detail.value) return;
  Object.assign(editForm, {
    id: detail.value.id,
    name: detail.value.name,
    data_scope: detail.value.data_scope,
    description: detail.value.description ?? '',
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.name) {
    message.warning('请填写角色名称');
    return;
  }
  editLoading.value = true;
  try {
    // 内置角色仅允许改名称/描述/数据范围（后端校验）
    await updateRole(editForm.id, {
      name: editForm.name,
      data_scope: editForm.data_scope,
      description: editForm.description || null,
    });
    message.success('保存成功');
    editVisible.value = false;
    await refresh();
  } finally {
    editLoading.value = false;
  }
}

// ================= 删除 =================
async function onDelete() {
  if (!detail.value) return;
  await deleteRole(detail.value.id);
  message.success('已删除');
  detailOpen.value = false;
  await loadList();
}

// ================= 权限配置（抽屉 Tab 内） =================
const allPerms = ref<PermissionItem[]>([]);
const checkedPermIds = ref<number[]>([]);

/** 按模块分组渲染权限 */
const groupedPerms = computed(() => {
  const groups = new Map<string, PermissionItem[]>();
  for (const p of allPerms.value) {
    const arr = groups.get(p.module) ?? [];
    arr.push(p);
    groups.set(p.module, arr);
  }
  return [...groups.entries()].map(([module, items]) => ({
    allChecked: items.every((i) => checkedPermIds.value.includes(i.id)),
    items,
    module,
  }));
});

/** 权限 Tab 激活时加载权限清单并回显 */
const permsTabLoaded = ref(false);
watch(
  () => detail.value,
  async (val) => {
    if (!val) {
      permsTabLoaded.value = false;
      return;
    }
    if (!permsTabLoaded.value) {
      permsTabLoaded.value = true;
      const perms = await getPermissionList();
      allPerms.value = perms;
    }
    // 回显：权限码 -> 权限 id
    const codeToId = new Map(allPerms.value.map((p) => [p.code, p.id]));
    checkedPermIds.value = val.permission_codes
      .map((c) => codeToId.get(c))
      .filter((v): v is number => v !== undefined);
  },
);

function toggleGroup(groupIdx: number, checked: boolean) {
  const group = groupedPerms.value[groupIdx]!;
  const ids = group.items.map((i) => i.id);
  const set = new Set(checkedPermIds.value);
  if (checked) {
    ids.forEach((id) => set.add(id));
  } else {
    ids.forEach((id) => set.delete(id));
  }
  checkedPermIds.value = [...set];
}

const permSaving = ref(false);

async function savePerms() {
  if (!detail.value) return;
  permSaving.value = true;
  try {
    await assignRolePermissions(detail.value.id, checkedPermIds.value);
    message.success('权限已更新（绑定用户权限缓存已失效）');
    await refresh();
  } finally {
    permSaving.value = false;
  }
}

// ================= 新建角色 =================
const createVisible = ref(false);
const createLoading = ref(false);
const createForm = reactive({ code: '', name: '', data_scope: 20, description: '' });

function openCreate() {
  Object.assign(createForm, { code: '', name: '', data_scope: 20, description: '' });
  createVisible.value = true;
}

async function submitCreate() {
  if (!createForm.code || !createForm.name) {
    message.warning('请填写角色标识与名称');
    return;
  }
  createLoading.value = true;
  try {
    await createRole({
      code: createForm.code,
      name: createForm.name,
      data_scope: createForm.data_scope,
      description: createForm.description || undefined,
    });
    message.success('角色创建成功');
    createVisible.value = false;
    await loadList();
  } finally {
    createLoading.value = false;
  }
}

const columns: TableColumnType[] = [
  { title: '角色标识', dataIndex: 'code', ellipsis: true },
  { title: '角色名称', dataIndex: 'name' }, // 详情入口链接列：不加 ellipsis
  { title: '数据范围', dataIndex: 'data_scope', ellipsis: true },
  { title: '用户数', dataIndex: 'user_count', ellipsis: true },
  { title: '权限数', dataIndex: 'permission_count', ellipsis: true },
  { title: '类型', dataIndex: 'is_builtin', ellipsis: true },
  { title: '描述', dataIndex: 'description', ellipsis: true },
];

onMounted(async () => {
  scopeDict.value = await getDataScopeDict();
  await loadList();
});
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <!-- 筛选区：独立 Card（角色无筛选字段，仅放新增入口） -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex-1" />
        <AccessControl :codes="['role:create']" type="code">
          <Button type="primary" @click="openCreate">新增角色</Button>
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
        :pagination="false"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
            <!-- 角色名称列即详情入口 -->
            <a @click="openDetail(record)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'data_scope'">
            {{ scopeMap.get(record.data_scope) ?? record.data_scope }}
          </template>
          <template v-else-if="column.dataIndex === 'is_builtin'">
            <Tag v-if="record.is_builtin" color="blue">内置</Tag>
            <Tag v-else>自定义</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'description'">
            {{ record.description ?? '—' }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 角色详情抽屉：基本信息 + 绑定用户 / 权限配置 Tabs -->
    <Drawer
      v-model:open="detailOpen"
      :title="detail ? `角色 ${detail.name}` : '角色详情'"
      width="66%"
    >
      <div v-if="detail" class="space-y-4">
        <Card size="small" title="基本信息">
          <template #extra>
            <Space :size="8">
              <!-- 编辑按钮：必备，置于首位 -->
              <AccessControl :codes="['role:update']" type="code">
                <Button size="small" type="primary" @click="openEdit">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['role:delete']" type="code">
                <Popconfirm
                  :disabled="detail.is_builtin"
                  title="确认删除该角色？（需先解除用户绑定）"
                  @confirm="onDelete"
                >
                  <Button :disabled="detail.is_builtin" danger size="small">删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
          <Descriptions :column="2" size="small">
            <DescriptionsItem label="角色标识">{{ detail.code }}</DescriptionsItem>
            <DescriptionsItem label="角色名称">{{ detail.name }}</DescriptionsItem>
            <DescriptionsItem label="数据范围">
              {{ scopeMap.get(detail.data_scope) ?? detail.data_scope }}
            </DescriptionsItem>
            <DescriptionsItem label="类型">
              <Tag v-if="detail.is_builtin" color="blue">内置</Tag>
              <Tag v-else>自定义</Tag>
            </DescriptionsItem>
            <DescriptionsItem label="用户数">{{ detail.user_count }}</DescriptionsItem>
            <DescriptionsItem label="权限数">{{ detail.permission_count }}</DescriptionsItem>
            <DescriptionsItem label="描述" :span="2">{{ detail.description ?? '—' }}</DescriptionsItem>
          </Descriptions>
        </Card>

        <Tabs>
          <!-- 绑定用户（只读展示，用户编辑入口在用户管理） -->
          <TabPane key="users" :tab="`绑定用户（${detail.users.length}）`">
            <Table
              :columns="userColumns"
              :data-source="detail.users"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'dept_name'">
                  {{ record.dept_name ?? '—' }}
                </template>
                <template v-else-if="column.dataIndex === 'position'">
                  {{ record.position ?? '—' }}
                </template>
              </template>
            </Table>
          </TabPane>

          <!-- 权限配置 -->
          <TabPane key="perms" :tab="`权限配置（${detail.permission_codes.length}）`">
            <div class="mb-2 flex justify-end">
              <AccessControl :codes="['role:assign']" type="code">
                <Button :loading="permSaving" size="small" type="primary" @click="savePerms">
                  保存权限
                </Button>
              </AccessControl>
            </div>
            <div
              v-for="(group, gi) in groupedPerms"
              :key="group.module"
              class="mb-3 rounded border border-gray-200 p-3"
            >
              <Checkbox
                :checked="group.allChecked"
                class="mb-2 font-medium"
                @change="(e: any) => toggleGroup(gi, e.target.checked)"
              >
                模块：{{ group.module }}
              </Checkbox>
              <CheckboxGroup
                v-model:value="checkedPermIds"
                class="grid grid-cols-2 gap-y-1"
              >
                <Checkbox v-for="p in group.items" :key="p.id" :value="p.id">
                  {{ p.name }}（{{ p.code }}）
                </Checkbox>
              </CheckboxGroup>
            </div>
          </TabPane>
        </Tabs>
      </div>
    </Drawer>

    <!-- 新建角色弹窗 -->
    <Modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      title="新增角色"
      width="480px"
      @ok="submitCreate"
    >
      <Form :label-col="{ span: 5 }" :model="createForm" :wrapper-col="{ span: 17 }">
        <FormItem label="角色标识" required>
          <Input v-model:value="createForm.code" placeholder="如 risk_officer（唯一，创建后不可改）" />
        </FormItem>
        <FormItem label="角色名称" required>
          <Input v-model:value="createForm.name" />
        </FormItem>
        <FormItem label="数据范围" required>
          <SearchSelect v-model:value="createForm.data_scope" :options="scopeDict" />
        </FormItem>
        <FormItem label="描述">
          <Textarea v-model:value="createForm.description" :rows="2" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 编辑角色弹窗（字段对齐后端 RoleUpdate 自由字段） -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      title="编辑角色"
      width="480px"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :model="editForm" :wrapper-col="{ span: 17 }">
        <FormItem label="角色标识">
          <Input :value="detail?.code" disabled />
        </FormItem>
        <FormItem label="角色名称" required>
          <Input v-model:value="editForm.name" />
        </FormItem>
        <FormItem label="数据范围" required>
          <SearchSelect v-model:value="editForm.data_scope" :options="scopeDict" />
        </FormItem>
        <FormItem label="描述">
          <Textarea v-model:value="editForm.description" :rows="2" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

<style scoped>
/* 行点击高亮：同时覆盖普通态与 hover 态（穿透 antd 内部样式） */
:deep(.ant-table-tbody > tr.row-active) > td,
:deep(.ant-table-tbody > tr.row-active) > td.ant-table-cell-row-hover {
  background-color: #e6f4ff;
}
</style>
