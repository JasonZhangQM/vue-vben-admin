<script lang="ts" setup>
/** 部门管理：树形表格，部门名称列为详情入口；编辑/启停/删除/加子部门收纳在详情抽屉。 */

import type { DeptNode } from '#/api/system/org';
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
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useRowHighlight } from '#/composables/useRowHighlight';

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

/** 在树中按 id 查找节点（含子孙） */
function findNode(nodes: DeptNode[], id: number): DeptNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children ?? [], id);
    if (hit) return hit;
  }
  return undefined;
}

// ================= 详情抽屉 =================
const detailOpen = ref(false);
const detailNode = ref<null | DeptNode>(null);

const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

function openDetail(row: any) {
  highlightRow(row); // 打开详情即高亮该行
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

/** 上级部门名称（详情展示用） */
function parentName(node: DeptNode): string {
  if (!node.parent_id) return '（顶级）';
  const parent = findNode(tree.value, node.parent_id);
  return parent?.name ?? '—';
}

// ================= 新建 / 编辑（编辑入口在详情抽屉） =================
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
function flattenForParent(
  nodes: DeptNode[],
  excludeId: number,
  prefix = '',
): { label: string; value: number }[] {
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

function openEdit() {
  if (!detailNode.value) return;
  editMode.value = 'edit';
  Object.assign(editForm, {
    id: detailNode.value.id,
    parent_id: detailNode.value.parent_id,
    name: detailNode.value.name,
    ordery: detailNode.value.ordery,
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
    await refresh();
  } finally {
    editLoading.value = false;
  }
}

// ================= 启停 / 删除 / 加子部门（收纳在详情抽屉） =================
async function onToggleStatus(checked: boolean) {
  if (!detailNode.value) return;
  await updateDept(detailNode.value.id, { status: checked ? 10 : 20 });
  message.success(checked ? '已启用' : '已停用');
  await refresh();
}

async function onDelete() {
  if (!detailNode.value) return;
  await deleteDept(detailNode.value.id);
  message.success('已删除');
  detailOpen.value = false;
  await loadTree();
}

const columns: TableColumnType[] = [
  { title: '部门名称', dataIndex: 'name' }, // 详情入口链接列：不加 ellipsis
  { title: '排序', dataIndex: 'ordery', ellipsis: true },
  { title: '人数', dataIndex: 'member_count', ellipsis: true },
  { title: '状态', dataIndex: 'status', ellipsis: true },
];

onMounted(loadTree);
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <!-- 筛选区：独立 Card（部门树无筛选字段，仅放新增入口） -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex-1" />
        <AccessControl :codes="['dept:create']" type="code">
          <Button type="primary" @click="openCreate()">新增一级部门</Button>
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
          <template v-if="column.dataIndex === 'name'">
            <!-- 部门名称列即详情入口 -->
            <a @click="openDetail(record)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="record.status === 10 ? 'green' : 'red'">
              {{ record.status === 10 ? '启用' : '停用' }}
            </Tag>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 部门详情抽屉：操作收纳在 #extra -->
    <Drawer
      v-model:open="detailOpen"
      :title="detailNode ? `部门 ${detailNode.name}` : '部门详情'"
      width="66%"
    >
      <div v-if="detailNode">
        <Card size="small" title="基本信息">
          <template #extra>
            <Space :size="8">
              <!-- 编辑按钮：必备，置于首位 -->
              <AccessControl :codes="['dept:update']" type="code">
                <Button size="small" type="primary" @click="openEdit">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['dept:create']" type="code">
                <Button size="small" @click="openCreate(detailNode)">加子部门</Button>
              </AccessControl>
              <AccessControl :codes="['dept:update']" type="code">
                <Switch
                  :checked="detailNode.status === 10"
                  checked-children="启用"
                  un-checked-children="停用"
                  @change="(checked: any) => onToggleStatus(!!checked)"
                />
              </AccessControl>
              <AccessControl :codes="['dept:delete']" type="code">
                <Popconfirm title="确认删除该部门？" @confirm="onDelete">
                  <Button danger size="small">删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
          <Descriptions :column="2" size="small">
            <DescriptionsItem label="部门名称">{{ detailNode.name }}</DescriptionsItem>
            <DescriptionsItem label="上级部门">{{ parentName(detailNode) }}</DescriptionsItem>
            <DescriptionsItem label="排序">{{ detailNode.ordery }}</DescriptionsItem>
            <DescriptionsItem label="人数">{{ detailNode.member_count }}</DescriptionsItem>
            <DescriptionsItem label="状态">
              <Tag :color="detailNode.status === 10 ? 'green' : 'red'">
                {{ detailNode.status === 10 ? '启用' : '停用' }}
              </Tag>
            </DescriptionsItem>
          </Descriptions>
        </Card>
      </div>
    </Drawer>

    <!-- 新建 / 编辑部门弹窗 -->
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
          <SearchSelect
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

