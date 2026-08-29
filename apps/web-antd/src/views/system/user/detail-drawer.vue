<script lang="ts" setup>
/** 用户详情抽屉：基本信息全字段 + 操作（编辑 / 启停 / 重置密码 / 删除）收纳在 #extra。 */

import type { UserDetail } from '#/api/system/user';

import { reactive, ref, watch } from 'vue';

import { AccessControl } from '@vben/access';

import {
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Drawer,
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
  Tag,
} from 'ant-design-vue';

import {
  assignUserRoles,
  changeUserStatus,
  deleteUser,
  getUserDetail,
  resetUserPassword,
  updateUser,
} from '#/api/system/user';
import { getDeptTree } from '#/api/system/org';
import { getRoleList } from '#/api/system/role';

const props = defineProps<{ userId: null | number }>();
const emit = defineEmits<{ updated: [] }>();

const open = defineModel<boolean>('open', { default: false });
const detail = ref<null | UserDetail>(null);
const loading = ref(false);

function statusColor(status: number) {
  return { 10: 'green', 20: 'red', 30: 'default' }[status] ?? 'default';
}
function statusLabel(status: number) {
  return { 10: '在职', 20: '停用', 30: '离职' }[status] ?? status;
}
function genderLabel(g: number) {
  return { 0: '未知', 1: '男', 2: '女' }[g] ?? g;
}

/** 空值文案兜底 */
const dash = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : String(v);

/** 抽屉内操作完成后刷新抽屉 + 通知列表 */
async function refresh() {
  await load();
  emit('updated');
}

async function load() {
  if (!props.userId) return;
  loading.value = true;
  try {
    detail.value = await getUserDetail(props.userId);
  } catch {
    // 详情拉取失败：自动关闭抽屉 + 错误提示，避免页面挂死
    open.value = false;
    detail.value = null;
    message.error('用户详情加载失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [open.value, props.userId],
  ([visible]) => {
    if (visible) load();
  },
);

// ===== 编辑 Modal（字段对齐后端 UserUpdate 自由字段 + 角色全量分配） =====
const deptOptions = ref<{ label: string; value: number }[]>([]);
const roleOptions = ref<{ label: string; value: number }[]>([]);

/** 部门树拍平成带缩进的下拉选项 */
function flattenDept(nodes: any[], prefix = ''): { label: string; value: number }[] {
  return nodes.flatMap((n) => [
    { label: prefix + n.name, value: n.id },
    ...flattenDept(n.children ?? [], prefix + '　'),
  ]);
}

const editVisible = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  id: 0,
  name: '',
  email: '',
  phone: '',
  gender: 0,
  dept_id: undefined as number | undefined,
  position: '',
  role_ids: [] as number[],
});

async function openEdit() {
  if (!detail.value) return;
  const [depts, roles] = await Promise.all([getDeptTree(), getRoleList()]);
  deptOptions.value = flattenDept(depts);
  roleOptions.value = roles.map((r) => ({ label: r.name, value: r.id }));
  Object.assign(editForm, {
    id: detail.value.id,
    name: detail.value.name,
    email: detail.value.email,
    phone: detail.value.phone ?? '',
    gender: detail.value.gender,
    dept_id: detail.value.dept_id ?? undefined,
    position: detail.value.position ?? '',
    role_ids: detail.value.roles.map((r) => r.id),
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
    editVisible.value = false;
    await refresh();
  } finally {
    editLoading.value = false;
  }
}

// ===== 启停 / 重置密码 / 删除 =====
async function onToggleStatus(checked: boolean) {
  if (!detail.value) return;
  await changeUserStatus(detail.value.id, checked ? 10 : 20);
  message.success(checked ? '已启用' : '已停用');
  await refresh();
}

async function onResetPwd() {
  if (!detail.value) return;
  const { initial_password } = await resetUserPassword(detail.value.id);
  Modal.success({ title: '密码已重置', content: `新初始密码：${initial_password}` });
}

async function onDelete() {
  if (!detail.value) return;
  await deleteUser(detail.value.id);
  message.success('已删除');
  open.value = false;
  emit('updated');
}
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="detail ? `用户 ${detail.name}` : '用户详情'"
    width="66%"
  >
    <div v-if="detail" class="space-y-4">
      <Card size="small" title="基本信息">
        <template #extra>
          <Space :size="8">
            <!-- 编辑按钮：必备，置于首位 -->
            <AccessControl :codes="['user:update']" type="code">
              <Button size="small" type="primary" @click="openEdit">编辑</Button>
            </AccessControl>
            <AccessControl :codes="['user:update']" type="code">
              <Switch
                :checked="detail.status === 10"
                checked-children="启用"
                un-checked-children="停用"
                @change="(checked: any) => onToggleStatus(!!checked)"
              />
            </AccessControl>
            <AccessControl :codes="['user:reset_pwd']" type="code">
              <Button size="small" @click="onResetPwd">重置密码</Button>
            </AccessControl>
            <AccessControl :codes="['user:delete']" type="code">
              <Popconfirm title="确认删除该用户？（逻辑删除）" @confirm="onDelete">
                <Button danger size="small">删除</Button>
              </Popconfirm>
            </AccessControl>
          </Space>
        </template>
        <Descriptions :column="2" size="small">
          <DescriptionsItem label="用户名">{{ dash(detail.username) }}</DescriptionsItem>
          <DescriptionsItem label="姓名">{{ dash(detail.name) }}</DescriptionsItem>
          <DescriptionsItem label="状态">
            <Tag :color="statusColor(detail.status)">{{ statusLabel(detail.status) }}</Tag>
          </DescriptionsItem>
          <DescriptionsItem label="性别">{{ genderLabel(detail.gender) }}</DescriptionsItem>
          <DescriptionsItem label="邮箱">{{ dash(detail.email) }}</DescriptionsItem>
          <DescriptionsItem label="手机号">{{ dash(detail.phone) }}</DescriptionsItem>
          <DescriptionsItem label="部门">{{ dash(detail.dept_name) }}</DescriptionsItem>
          <DescriptionsItem label="职务">{{ dash(detail.position) }}</DescriptionsItem>
          <DescriptionsItem label="角色" :span="2">
            {{ detail.roles.length ? detail.roles.map((r) => r.name).join('、') : '—' }}
          </DescriptionsItem>
          <DescriptionsItem label="最近登录">{{ dash(detail.last_login_at) }}</DescriptionsItem>
          <DescriptionsItem label="创建时间">{{ dash(detail.created_at) }}</DescriptionsItem>
        </Descriptions>
      </Card>
    </div>

    <!-- 编辑 Modal（字段对齐后端 UserUpdate 自由字段） -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      title="编辑用户"
      width="560px"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :model="editForm" :wrapper-col="{ span: 17 }">
        <FormItem label="用户名">
          <Input :value="detail?.username" disabled />
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
          <Select v-model:value="editForm.gender" style="width: 100px" show-search>
            <SelectOption :value="0">未知</SelectOption>
            <SelectOption :value="1">男</SelectOption>
            <SelectOption :value="2">女</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="部门">
          <Select
            show-search
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
            show-search
            v-model:value="editForm.role_ids"
            :options="roleOptions"
            mode="multiple"
            placeholder="选择角色（权限取并集）"
          />
        </FormItem>
      </Form>
    </Modal>
  </Drawer>
</template>

