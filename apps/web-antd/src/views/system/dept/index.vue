<script lang="ts" setup>
import type { DeptNode } from '#/api/system/org';

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
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import { createDept, deleteDept, getDeptTree, updateDept } from '#/api/system/org';

const loading = ref(false);
const tree = ref<DeptNode[]>([]);

async function loadTree() {
  loading.value = true;
  try {
    tree.value = await getDeptTree();
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
  parent_id: 0,
  name: '',
  ordery: 100,
});

/** 树拍平成下拉选项（排除自身及子孙，防成环） */
function flattenForParent(nodes: DeptNode[], excludeId: number, prefix = '') {
  return nodes
    .filter((n) => n.id !== excludeId)
    .flatMap((n) => [
      { label: prefix + n.name, value: n.id },
      ...flattenForParent(n.children ?? [], excludeId, prefix + '　'),
    ]);
}

function openCreate(parent?: DeptNode) {
  editMode.value = 'create';
  Object.assign(editForm, {
    id: 0,
    parent_id: parent?.id ?? 0,
    name: '',
    ordery: 100,
  });
  editVisible.value = true;
}

function openEdit(row: DeptNode) {
  editMode.value = 'edit';
  Object.assign(editForm, {
    id: row.id,
    parent_id: row.parent_id,
    name: row.name,
    ordery: row.ordery,
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.name) {
    message.warning('请填写部门名称');
    return;
  }
  editLoading.value = true;
  try {
    if (editMode.value === 'create') {
      await createDept({
        parent_id: editForm.parent_id,
        name: editForm.name,
        ordery: editForm.ordery,
      });
      message.success('部门创建成功');
    } else {
      await updateDept(editForm.id, {
        parent_id: editForm.parent_id,
        name: editForm.name,
        ordery: editForm.ordery,
      });
      message.success('保存成功');
    }
    editVisible.value = false;
    await loadTree();
  } finally {
    editLoading.value = false;
  }
}

async function onDelete(row: DeptNode) {
  await deleteDept(row.id);
  message.success('已删除');
  await loadTree();
}

async function onToggleStatus(row: DeptNode, checked: boolean) {
  await updateDept(row.id, { status: checked ? 10 : 20 });
  message.success(checked ? '已启用' : '已停用');
  await loadTree();
}

const columns = [
  { title: '部门名称', dataIndex: 'name' },
  { title: '排序', dataIndex: 'ordery', width: 80 },
  { title: '人数', dataIndex: 'member_count', width: 80 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', key: 'actions', width: 280, fixed: 'right' },
];

onMounted(loadTree);
</script>

<template>
  <Page title="部门管理" description="部门树维护；删除前需清空成员与子部门">
    <Card>
      <div class="mb-4">
        <AccessControl :codes="['dept:create']" type="code">
          <Button type="primary" @click="openCreate()">新增一级部门</Button>
        </AccessControl>
      </div>

      <Table
        :columns="columns"
        :data-source="tree"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 800 }"
        default-expand-all-rows
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="record.status === 10 ? 'green' : 'red'">
              {{ record.status === 10 ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <AccessControl :codes="['dept:create']" type="code">
                <Button size="small" type="link" @click="openCreate(record)">加子部门</Button>
              </AccessControl>
              <AccessControl :codes="['dept:update']" type="code">
                <Button size="small" type="link" @click="openEdit(record)">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['dept:update']" type="code">
                <Switch
                  :checked="record.status === 10"
                  checked-children="启用"
                  un-checked-children="停用"
                  @change="(checked: any) => onToggleStatus(record, !!checked)"
                />
              </AccessControl>
              <AccessControl :codes="['dept:delete']" type="code">
                <Popconfirm title="确认删除该部门？" @confirm="onDelete(record)">
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
      :title="editMode === 'create' ? '新增部门' : '编辑部门'"
      width="440px"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :model="editForm" :wrapper-col="{ span: 17 }">
        <FormItem label="上级部门">
          <Input
            v-if="editForm.parent_id === 0"
            disabled
            value="（顶级）"
          />
          <Select
            v-else
            v-model:value="editForm.parent_id"
            :options="flattenForParent(tree, editForm.id)"
            placeholder="选择上级部门"
          />
        </FormItem>
        <FormItem label="部门名称" required>
          <Input v-model:value="editForm.name" />
        </FormItem>
        <FormItem label="排序">
          <InputNumber v-model:value="editForm.ordery" :min="0" :step="10" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
