<script lang="ts" setup>
import type { UserListItem } from '#/api/system/user';

import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  SelectOption,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  assignUserRoles,
  changeUserStatus,
  createUser,
  deleteUser,
  getUserDetail,
  getUserList,
  resetUserPassword,
  updateUser,
} from '#/api/system/user';
import { getDeptTree } from '#/api/system/org';
import { getRoleList } from '#/api/system/role';
import { getUserStatusDict } from '#/api/system/log';

// ================= 列表状态 =================
const loading = ref(false);
const list = ref<UserListItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, page_size: 20, q: '', status: undefined as number | undefined });

const statusDict = ref<{ label: string; value: number }[]>([]);
const statusMap = computed(() => new Map(statusDict.value.map((d) => [d.value, d.label])));

async function loadList() {
  loading.value = true;
  try {
    const data = await getUserList(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

// 状态 → 标签颜色
function statusColor(status: number) {
  return { 10: 'green', 20: 'red', 30: 'default' }[status] ?? 'default';
}

// ================= 部门 / 角色选项 =================
const deptOptions = ref<{ label: string; value: number }[]>([]);
const roleOptions = ref<{ label: string; value: number }[]>([]);

/** 部门树拍平成带缩进的下拉选项 */
function flattenDept(nodes: any[], prefix = ''): { label: string; value: number }[] {
  return nodes.flatMap((n) => [
    { label: prefix + n.name, value: n.id },
    ...flattenDept(n.children ?? [], prefix + '　'),
  ]);
}

async function loadOptions() {
  const [depts, roles] = await Promise.all([getDeptTree(), getRoleList()]);
  deptOptions.value = flattenDept(depts);
  roleOptions.value = roles.map((r) => ({ label: r.name, value: r.id }));
}

// ================= 新建 / 编辑 =================
const editVisible = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const editLoading = ref(false);
const editForm = reactive({
  id: 0,
  username: '',
  name: '',
  email: '',
  phone: '',
  gender: 0,
  dept_id: undefined as number | undefined,
  position: '',
  role_ids: [] as number[],
});

function openCreate() {
  editMode.value = 'create';
  Object.assign(editForm, {
    id: 0, username: '', name: '', email: '', phone: '', gender: 0,
    dept_id: undefined, position: '', role_ids: [],
  });
  editVisible.value = true;
}

async function openEdit(row: UserListItem) {
  editMode.value = 'edit';
  const detail = await getUserDetail(row.id);
  Object.assign(editForm, {
    id: detail.id,
    username: detail.username,
    name: detail.name,
    email: detail.email,
    phone: detail.phone ?? '',
    gender: detail.gender,
    dept_id: detail.dept_id ?? undefined,
    position: detail.position ?? '',
    role_ids: detail.roles.map((r) => r.id),
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.name || !editForm.email) {
    message.warning('请填写姓名与邮箱');
    return;
  }
  editLoading.value = true;
  try {
    if (editMode.value === 'create') {
      const { initial_password } = await createUser({
        username: editForm.username,
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || undefined,
        gender: editForm.gender,
        dept_id: editForm.dept_id ?? undefined,
        position: editForm.position || undefined,
        role_ids: editForm.role_ids,
      });
      Modal.success({
        title: '用户创建成功',
        content: `初始密码：${initial_password}（用户首登将被要求修改）`,
      });
    } else {
      await updateUser(editForm.id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || undefined,
        gender: editForm.gender,
        dept_id: editForm.dept_id ?? undefined,
        position: editForm.position || undefined,
      });
      await assignUserRoles(editForm.id, editForm.role_ids);
      message.success('保存成功');
    }
    editVisible.value = false;
    await loadList();
  } finally {
    editLoading.value = false;
  }
}

// ================= 行操作 =================

async function onToggleStatus(row: UserListItem, checked: boolean) {
  await changeUserStatus(row.id, checked ? 10 : 20);
  message.success(checked ? '已启用' : '已停用');
  await loadList();
}

async function onResetPwd(row: UserListItem) {
  const { initial_password } = await resetUserPassword(row.id);
  Modal.success({ title: '密码已重置', content: `新初始密码：${initial_password}` });
}

async function onDelete(row: UserListItem) {
  await deleteUser(row.id);
  message.success('已删除');
  await loadList();
}

// ================= 表格定义 =================
const columns = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '用户名', dataIndex: 'username', width: 110 },
  { title: '姓名', dataIndex: 'name', width: 100 },
  { title: '部门', dataIndex: 'dept_name', width: 120 },
  { title: '角色', dataIndex: 'role_names', ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '最近登录', dataIndex: 'last_login_at', width: 160 },
  { title: '操作', key: 'actions', width: 250, fixed: 'right' },
];

onMounted(async () => {
  const [dicts] = await Promise.all([getUserStatusDict(), loadOptions()]);
  statusDict.value = dicts;
  await loadList();
});
</script>

<template>
  <Page title="用户管理" description="账号、部门与角色分配；停用即时踢出会话">
    <Card>
      <!-- 筛选区 -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.q"
          allow-clear
          placeholder="用户名 / 姓名 / 邮箱"
          style="width: 220px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <Select
          v-model:value="query.status"
          allow-clear
          placeholder="状态"
          style="width: 120px"
          :options="statusDict"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <AccessControl :codes="['user:create']" type="code">
          <Button type="primary" @click="openCreate">新增用户</Button>
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
        :scroll="{ x: 1100 }"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'role_names'">
            {{ (record.role_names ?? []).join('、') || '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="statusColor(record.status)">
              {{ statusMap.get(record.status) ?? record.status }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4" wrap>
              <AccessControl :codes="['user:update']" type="code">
                <Button size="small" type="link" @click="openEdit(record)">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['user:update']" type="code">
                <Switch
                  :checked="record.status === 10"
                  checked-children="启用"
                  un-checked-children="停用"
                  @change="(checked: any) => onToggleStatus(record, !!checked)"
                />
              </AccessControl>
              <AccessControl :codes="['user:reset_pwd']" type="code">
                <Button size="small" type="link" @click="onResetPwd(record)">重置密码</Button>
              </AccessControl>
              <AccessControl :codes="['user:delete']" type="code">
                <Popconfirm title="确认删除该用户？（逻辑删除）" @confirm="onDelete(record)">
                  <Button danger size="small" type="link">删除</Button>
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
      :title="editMode === 'create' ? '新增用户' : '编辑用户'"
      width="560px"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :model="editForm" :wrapper-col="{ span: 17 }">
        <FormItem label="用户名" required>
          <Input v-model:value="editForm.username" :disabled="editMode === 'edit'" />
        </FormItem>
        <FormItem label="姓名" required>
          <Input v-model:value="editForm.name" />
        </FormItem>
        <FormItem label="邮箱" required>
          <Input v-model:value="editForm.email" />
        </FormItem>
        <FormItem label="手机号">
          <Input v-model:value="editForm.phone" />
        </FormItem>
        <FormItem label="性别">
          <Select v-model:value="editForm.gender" style="width: 100px">
            <SelectOption :value="0">未知</SelectOption>
            <SelectOption :value="1">男</SelectOption>
            <SelectOption :value="2">女</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="部门">
          <Select
            v-model:value="editForm.dept_id"
            :options="deptOptions"
            allow-clear
            placeholder="选择部门"
          />
        </FormItem>
        <FormItem label="职务">
          <Input v-model:value="editForm.position" />
        </FormItem>
        <FormItem label="角色">
          <Select
            v-model:value="editForm.role_ids"
            :options="roleOptions"
            mode="multiple"
            placeholder="选择角色（权限取并集）"
          />
        </FormItem>
        <FormItem v-if="editMode === 'create'" label="说明">
          <Textarea
            :rows="2"
            disabled
            value="提交后系统生成初始密码，用户首次登录强制修改。"
          />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
