<script lang="ts" setup>
import type { PermissionItem, RoleListItem } from '#/api/system/role';

import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  Drawer,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

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

// ================= 新建 / 编辑 =================
const editVisible = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const editLoading = ref(false);
const editForm = reactive({
  id: 0,
  code: '',
  name: '',
  data_scope: 20,
  description: '',
});

function openCreate() {
  editMode.value = 'create';
  Object.assign(editForm, { id: 0, code: '', name: '', data_scope: 20, description: '' });
  editVisible.value = true;
}

function openEdit(row: RoleListItem) {
  editMode.value = 'edit';
  Object.assign(editForm, {
    id: row.id,
    code: row.code,
    name: row.name,
    data_scope: row.data_scope,
    description: row.description ?? '',
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
    if (editMode.value === 'create') {
      await createRole({
        code: editForm.code,
        name: editForm.name,
        data_scope: editForm.data_scope,
        description: editForm.description || undefined,
      });
      message.success('角色创建成功');
    } else {
      // 内置角色仅允许改名称/描述/数据范围（后端校验）
      await updateRole(editForm.id, {
        name: editForm.name,
        data_scope: editForm.data_scope,
        description: editForm.description || null,
      });
      message.success('保存成功');
    }
    editVisible.value = false;
    await loadList();
  } finally {
    editLoading.value = false;
  }
}

async function onDelete(row: RoleListItem) {
  await deleteRole(row.id);
  message.success('已删除');
  await loadList();
}

// ================= 权限配置抽屉 =================
const permVisible = ref(false);
const permLoading = ref(false);
const permSaving = ref(false);
const allPerms = ref<PermissionItem[]>([]);
const permRole = ref<RoleListItem | null>(null);
const checkedPermIds = ref<number[]>([]);
/** 勾选的原 code 集合（回显用，切换时对比生成新增/移除） */
const originalIds = ref<number[]>([]);

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

async function openPerms(row: RoleListItem) {
  permRole.value = row;
  permVisible.value = true;
  permLoading.value = true;
  try {
    const [perms, detail] = await Promise.all([
      getPermissionList(),
      getRoleDetail(row.id),
    ]);
    allPerms.value = perms;
    // 回显：权限码 -> 权限 id
    const codeToId = new Map(perms.map((p) => [p.code, p.id]));
    const ids = detail.permission_codes
      .map((c) => codeToId.get(c))
      .filter((v): v is number => v !== undefined);
    checkedPermIds.value = ids;
    originalIds.value = [...ids];
  } finally {
    permLoading.value = false;
  }
}

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

async function savePerms() {
  if (!permRole.value) return;
  permSaving.value = true;
  try {
    await assignRolePermissions(permRole.value.id, checkedPermIds.value);
    message.success('权限已更新（绑定用户权限缓存已失效）');
    permVisible.value = false;
    await loadList();
  } finally {
    permSaving.value = false;
  }
}

const columns = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '角色标识', dataIndex: 'code', width: 130 },
  { title: '角色名称', dataIndex: 'name', width: 130 },
  { title: '数据范围', dataIndex: 'data_scope', width: 130 },
  { title: '用户数', dataIndex: 'user_count', width: 80 },
  { title: '权限数', dataIndex: 'permission_count', width: 80 },
  { title: '类型', dataIndex: 'is_builtin', width: 80 },
  { title: '操作', key: 'actions', width: 230, fixed: 'right' },
];

onMounted(async () => {
  scopeDict.value = await getDataScopeDict();
  await loadList();
});
</script>

<template>
  <Page title="角色管理" description="角色权限配置；多角色权限并集、数据范围取最大">
    <Card>
      <div class="mb-4">
        <AccessControl :codes="['role:create']" type="code">
          <Button type="primary" @click="openCreate">新增角色</Button>
        </AccessControl>
      </div>

      <Table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1000 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'data_scope'">
            {{ scopeMap.get(record.data_scope) ?? record.data_scope }}
          </template>
          <template v-else-if="column.dataIndex === 'is_builtin'">
            <Tag v-if="record.is_builtin" color="blue">内置</Tag>
            <Tag v-else>自定义</Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <AccessControl :codes="['role:update']" type="code">
                <Button size="small" type="link" @click="openEdit(record)">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['role:assign']" type="code">
                <Button size="small" type="link" @click="openPerms(record)">配置权限</Button>
              </AccessControl>
              <AccessControl :codes="['role:delete']" type="code">
                <Popconfirm
                  :disabled="record.is_builtin"
                  title="确认删除该角色？（需先解除用户绑定）"
                  @confirm="onDelete(record)"
                >
                  <Button :disabled="record.is_builtin" danger size="small" type="link">
                    删除
                  </Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建 / 编辑弹窗 -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      :title="editMode === 'create' ? '新增角色' : '编辑角色'"
      width="480px"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :model="editForm" :wrapper-col="{ span: 17 }">
        <FormItem label="角色标识" required>
          <Input
            v-model:value="editForm.code"
            :disabled="editMode === 'edit'"
            placeholder="如 risk_officer（唯一，创建后不可改）"
          />
        </FormItem>
        <FormItem label="角色名称" required>
          <Input v-model:value="editForm.name" />
        </FormItem>
        <FormItem label="数据范围" required>
          <Select v-model:value="editForm.data_scope" :options="scopeDict" />
        </FormItem>
        <FormItem label="描述">
          <Textarea v-model:value="editForm.description" :rows="2" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 权限配置抽屉 -->
    <Drawer
      v-model:open="permVisible"
      :title="`配置权限：${permRole?.name ?? ''}`"
      :width="480"
    >
      <div v-if="permLoading" class="py-10 text-center">加载中...</div>
      <template v-else>
        <div
          v-for="(group, gi) in groupedPerms"
          :key="group.module"
          class="mb-4 rounded border border-gray-200 p-3"
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
            <Checkbox
              v-for="p in group.items"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}（{{ p.code }}）
            </Checkbox>
          </CheckboxGroup>
        </div>
        <div class="mt-4 flex justify-end">
          <Space>
            <Button @click="permVisible = false">取消</Button>
            <Button :loading="permSaving" type="primary" @click="savePerms">保存</Button>
          </Space>
        </div>
      </template>
    </Drawer>
  </Page>
</template>
