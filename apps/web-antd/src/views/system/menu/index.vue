<script lang="ts" setup>
/** 菜单管理：树形表格，标题列为详情入口；编辑/删除/加子级收纳在详情抽屉。 */

import type { MenuNode } from '#/api/system/org';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

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

/** 在树中按 id 查找节点（含子孙） */
function findNode(nodes: MenuNode[], id: number): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children ?? [], id);
    if (hit) return hit;
  }
  return undefined;
}

/** 上级菜单标题（详情展示用） */
function parentName(node: MenuNode): string {
  if (!node.parent_id) return '（顶级）';
  const parent = findNode(tree.value, node.parent_id);
  return parent?.caption ?? '—';
}

const typeLabels: Record<number, { color: string; text: string }> = {
  10: { color: 'blue', text: '目录' },
  20: { color: 'green', text: '菜单' },
  30: { color: 'orange', text: '按钮' },
};

// ================= 详情抽屉 =================
const detailOpen = ref(false);
const detailNode = ref<null | MenuNode>(null);

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
  detailNode.value = row;
  detailOpen.value = true;
}

/** 抽屉内操作完成后刷新树 + 重载抽屉数据 */
async function refresh() {
  await loadTree();
  if (detailNode.value) {
    detailNode.value = findNode(tree.value, detailNode.value.id) ?? null;
  }
}

// ================= 新建 / 编辑（编辑入口在详情抽屉） =================
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

function flattenForParent(
  nodes: MenuNode[],
  prefix = '',
): { label: string; value: number }[] {
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

function openEdit() {
  if (!detailNode.value) return;
  editMode.value = 'edit';
  Object.assign(editForm, {
    id: detailNode.value.id,
    parent_id: detailNode.value.parent_id,
    caption: detailNode.value.caption,
    path: detailNode.value.path ?? '',
    component: detailNode.value.component ?? '',
    redirect: detailNode.value.redirect ?? '',
    icon: detailNode.value.icon ?? '',
    type: detailNode.value.type,
    ordery: detailNode.value.ordery,
    permission_code: detailNode.value.permission_code ?? '',
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
    await refresh();
  } finally {
    editLoading.value = false;
  }
}

// ================= 删除（收纳在详情抽屉） =================
async function onDelete() {
  if (!detailNode.value) return;
  await deleteMenu(detailNode.value.id);
  message.success('已删除');
  detailOpen.value = false;
  await loadTree();
}

const columns: TableColumnType[] = [
  { title: '标题', dataIndex: 'caption' }, // 详情入口链接列：不加 ellipsis
  { title: '类型', dataIndex: 'type', ellipsis: true },
  { title: '路由路径', dataIndex: 'path', ellipsis: true },
  { title: '组件', dataIndex: 'component', ellipsis: true },
  { title: '权限码', dataIndex: 'permission_code', ellipsis: true },
  { title: '排序', dataIndex: 'ordery', ellipsis: true },
];

onMounted(loadTree);
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <!-- 筛选区：独立 Card（菜单树无筛选字段，仅放新增入口） -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex-1" />
        <AccessControl :codes="['menu:create']" type="code">
          <Button type="primary" @click="openCreate()">新增顶级目录</Button>
        </AccessControl>
      </div>
    </Card>

    <!-- 数据区：Card 与 Table 均 size="small" 紧凑布局 -->
    <Card size="small">
      <Table
        :columns="columns"
        :custom-row="customRow"
        :data-source="tree"
        :loading="loading"
        :pagination="false"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        default-expand-all-rows
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'caption'">
            <!-- 标题列即详情入口 -->
            <a @click="openDetail(record)">{{ record.caption }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'type'">
            <Tag :color="typeLabels[record.type]?.color">
              {{ typeLabels[record.type]?.text ?? record.type }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'path'">
            {{ record.path ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'component'">
            {{ record.component ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'permission_code'">
            <code v-if="record.permission_code">{{ record.permission_code }}</code>
            <span v-else class="text-gray-400">—</span>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 菜单详情抽屉：操作收纳在 #extra -->
    <Drawer
      v-model:open="detailOpen"
      :title="detailNode ? `菜单 ${detailNode.caption}` : '菜单详情'"
      width="66%"
    >
      <div v-if="detailNode">
        <Card size="small" title="基本信息">
          <template #extra>
            <Space :size="8">
              <!-- 编辑按钮：必备，置于首位 -->
              <AccessControl :codes="['menu:update']" type="code">
                <Button size="small" type="primary" @click="openEdit">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['menu:create']" type="code">
                <Button size="small" @click="openCreate(detailNode)">加子级</Button>
              </AccessControl>
              <AccessControl :codes="['menu:delete']" type="code">
                <Popconfirm title="确认删除？（子级将联动删除）" @confirm="onDelete">
                  <Button danger size="small">删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
          <Descriptions :column="2" size="small">
            <DescriptionsItem label="标题">{{ detailNode.caption }}</DescriptionsItem>
            <DescriptionsItem label="类型">
              <Tag :color="typeLabels[detailNode.type]?.color">
                {{ typeLabels[detailNode.type]?.text ?? detailNode.type }}
              </Tag>
            </DescriptionsItem>
            <DescriptionsItem label="上级">{{ parentName(detailNode) }}</DescriptionsItem>
            <DescriptionsItem label="排序">{{ detailNode.ordery }}</DescriptionsItem>
            <DescriptionsItem label="路由路径">{{ detailNode.path ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="组件路径">{{ detailNode.component ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="重定向">{{ detailNode.redirect ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="图标">{{ detailNode.icon ?? '—' }}</DescriptionsItem>
            <DescriptionsItem label="权限码" :span="2">
              <code v-if="detailNode.permission_code">{{ detailNode.permission_code }}</code>
              <span v-else>—</span>
            </DescriptionsItem>
          </Descriptions>
        </Card>
      </div>
    </Drawer>

    <!-- 新建 / 编辑菜单弹窗 -->
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
            show-search
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
          <Select v-model:value="editForm.type" show-search>
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

<style scoped>
/* 行点击高亮：同时覆盖普通态与 hover 态（穿透 antd 内部样式） */
:deep(.ant-table-tbody > tr.row-active) > td,
:deep(.ant-table-tbody > tr.row-active) > td.ant-table-cell-row-hover {
  background-color: #e6f4ff;
}
</style>

