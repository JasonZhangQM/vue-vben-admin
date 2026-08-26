<script lang="ts" setup>
import type { MenuNode } from '#/api/system/org';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  SelectOption,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { createMenu, deleteMenu, getMenuList, updateMenu } from '#/api/system/org';

const loading = ref(false);
const tree = ref<MenuNode[]>([]);

async function loadTree() {
  loading.value = true;
  try {
    tree.value = await getMenuList();
  } finally {
    loading.value = false;
  }
}

const typeLabels: Record<number, { color: string; text: string }> = {
  10: { color: 'blue', text: '目录' },
  20: { color: 'green', text: '菜单' },
  30: { color: 'orange', text: '按钮' },
};

// ================= 新建 / 编辑 =================
const editVisible = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const editLoading = ref(false);
const editForm = reactive({
  id: 0,
  parent_id: 0,
  caption: '',
  path: '',
  component: '',
  redirect: '',
  icon: '',
  type: 20,
  ordery: 100,
  permission_code: '',
});

function flattenForParent(nodes: MenuNode[], prefix = '') {
  // 只允许挂到目录（10）下
  return nodes
    .filter((n) => n.type === 10)
    .flatMap((n) => [
      { label: prefix + n.caption, value: n.id },
      ...flattenForParent(n.children ?? [], prefix + '　'),
    ]);
}

function openCreate(parent?: MenuNode) {
  editMode.value = 'create';
  Object.assign(editForm, {
    id: 0,
    parent_id: parent?.id ?? 0,
    caption: '',
    path: '',
    component: '',
    redirect: '',
    icon: '',
    type: 20,
    ordery: 100,
    permission_code: '',
  });
  editVisible.value = true;
}

function openEdit(row: MenuNode) {
  editMode.value = 'edit';
  Object.assign(editForm, {
    id: row.id,
    parent_id: row.parent_id,
    caption: row.caption,
    path: row.path ?? '',
    component: row.component ?? '',
    redirect: row.redirect ?? '',
    icon: row.icon ?? '',
    type: row.type,
    ordery: row.ordery,
    permission_code: row.permission_code ?? '',
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.caption) {
    message.warning('请填写菜单标题');
    return;
  }
  editLoading.value = true;
  try {
    const payload = {
      parent_id: editForm.parent_id,
      caption: editForm.caption,
      path: editForm.path || null,
      component: editForm.component || null,
      redirect: editForm.redirect || null,
      icon: editForm.icon || null,
      type: editForm.type,
      ordery: editForm.ordery,
      permission_code: editForm.permission_code || null,
    };
    if (editMode.value === 'create') {
      await createMenu(payload);
      message.success('菜单创建成功（权限点已同步生成）');
    } else {
      await updateMenu(editForm.id, payload);
      message.success('保存成功');
    }
    editVisible.value = false;
    await loadTree();
  } finally {
    editLoading.value = false;
  }
}

async function onDelete(row: MenuNode) {
  await deleteMenu(row.id);
  message.success('已删除');
  await loadTree();
}

const columns = [
  { title: '标题', dataIndex: 'caption' },
  { title: '类型', dataIndex: 'type', width: 80 },
  { title: '路由路径', dataIndex: 'path', ellipsis: true },
  { title: '组件', dataIndex: 'component', ellipsis: true },
  { title: '权限码', dataIndex: 'permission_code', width: 150 },
  { title: '排序', dataIndex: 'ordery', width: 70 },
  { title: '操作', key: 'actions', width: 180, fixed: 'right' },
];

onMounted(loadTree);
</script>

<template>
  <Page title="菜单管理" description="菜单与权限点配置；菜单可见性由权限码单通道推导">
    <Card>
      <div class="mb-4">
        <AccessControl :codes="['menu:create']" type="code">
          <Button type="primary" @click="openCreate()">新增顶级目录</Button>
        </AccessControl>
      </div>

      <Table
        :columns="columns"
        :data-source="tree"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 900 }"
        default-expand-all-rows
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'type'">
            <Tag :color="typeLabels[record.type]?.color">
              {{ typeLabels[record.type]?.text ?? record.type }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'permission_code'">
            <code v-if="record.permission_code">{{ record.permission_code }}</code>
            <span v-else class="text-gray-400">—</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <AccessControl :codes="['menu:update']" type="code">
                <Button size="small" type="link" @click="openEdit(record)">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['menu:delete']" type="code">
                <Popconfirm title="确认删除？（子级将联动删除）" @confirm="onDelete(record)">
                  <Button danger size="small" type="link">删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      :title="editMode === 'create' ? '新增菜单' : '编辑菜单'"
      width="520px"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :model="editForm" :wrapper-col="{ span: 17 }">
        <FormItem label="上级">
          <Select
            v-model:value="editForm.parent_id"
            :options="flattenForParent(tree)"
            placeholder="顶级（parent_id=0）"
            allow-clear
          />
        </FormItem>
        <FormItem label="标题" required>
          <Input v-model:value="editForm.caption" />
        </FormItem>
        <FormItem label="类型">
          <Select v-model:value="editForm.type">
            <SelectOption :value="10">目录</SelectOption>
            <SelectOption :value="20">菜单</SelectOption>
            <SelectOption :value="30">按钮</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="路由路径">
          <Input v-model:value="editForm.path" placeholder="如 /system/users" />
        </FormItem>
        <FormItem v-if="editForm.type === 20" label="组件路径">
          <Input v-model:value="editForm.component" placeholder="如 system/user/index" />
        </FormItem>
        <FormItem v-if="editForm.type === 10" label="重定向">
          <Input v-model:value="editForm.redirect" placeholder="如 /system/users" />
        </FormItem>
        <FormItem label="图标">
          <Input v-model:value="editForm.icon" placeholder="如 lucide:settings" />
        </FormItem>
        <FormItem label="权限码">
          <Input
            v-model:value="editForm.permission_code"
            placeholder="如 user:list（为空则不鉴权）"
          />
        </FormItem>
        <FormItem label="排序">
          <InputNumber v-model:value="editForm.ordery" :min="0" :step="10" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
