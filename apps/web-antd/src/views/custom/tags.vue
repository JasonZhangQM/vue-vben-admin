<script lang="ts" setup>
import type { ExtraTag, TagCustomer } from '#/api/basic/customer';
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
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { useRowHighlight } from '#/composables/useRowHighlight';
import { dash } from '#/utils/format';

import {
  createTag,
  deleteTag,
  getTagCustomers,
  getTagList,
  removeTagCustomer,
  TAG_TYPE_OPTIONS,
  updateTag,
} from '#/api/basic/customer';

// 客户枚举 label 镜像（与后端 customer/enums.py 对齐，仅本页展示用）
const GENRE_LABELS: Record<number, string> = { 1: '企业', 2: '个人' };
const CUSTOM_STATE_LABELS: Record<number, string> = {
  10: '正常', 20: '反担保', 30: '小贷', 90: '注销',
};
const CLASSIFICATION_LABELS: Record<number, string> = {
  10: '正常', 20: '关注', 30: '次级', 40: '可疑', 50: '损失',
};
const CLASSIFICATION_COLORS: Record<number, string> = {
  10: 'green', 20: 'blue', 30: 'orange', 40: 'red', 50: 'red',
};

// ============ 列表 ============
const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

// 详情基本信息响应式列数（视口越宽列越多）
const { columns: detailColumns } = useDetailColumns();
const loading = ref(false);
const allTags = ref<ExtraTag[]>([]);

const query = reactive({
  page: 1,
  page_size: 20,
  q: '',
  type: undefined as number | undefined,
});

/** 过滤快照：仅点击"查询/重置"或回车时从 query 拷贝，避免输入即过滤 */
const applied = reactive({
  q: '',
  type: undefined as number | undefined,
});

/** 提交筛选（查询按钮 / 回车 / 重置时调用） */
function applyQuery() {
  applied.q = query.q.trim();
  applied.type = query.type;
  query.page = 1;
}

/** 前端过滤 + 分页（后端返回全量数组，基于 applied 快照） */
const filteredList = computed(() => {
  let arr = allTags.value;
  if (applied.q) {
    const kw = applied.q.toLowerCase();
    arr = arr.filter((t) => t.name.toLowerCase().includes(kw));
  }
  if (applied.type !== undefined) arr = arr.filter((t) => t.type === applied.type);
  return arr;
});
const pagedList = computed(() => {
  const start = (query.page - 1) * query.page_size;
  return filteredList.value.slice(start, start + query.page_size);
});
const total = computed(() => filteredList.value.length);

async function loadList() {
  loading.value = true;
  try {
    allTags.value = await getTagList();
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  query.q = '';
  query.type = undefined;
  applyQuery();
}

const typeLabel = (v: number) => TAG_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? dash(v);

const columns: TableColumnType[] = [
  { title: '标签名称', dataIndex: 'name' },
  { title: '类型', dataIndex: 'type', width: 110, ellipsis: true },
  { title: '使用中', dataIndex: 'in_use', width: 100, ellipsis: true },
  { title: '创建人', dataIndex: 'created_by_name', ellipsis: true },
];

// ============ 详情抽屉 ============
const drawerOpen = ref(false);
const detail = ref<ExtraTag | null>(null);
/** 客户 Tab 数据（打开抽屉即加载） */
const tagCustomers = ref<TagCustomer[]>([]);
const customersLoading = ref(false);

async function openDetail(record: ExtraTag) {
  highlightRow(record);
  drawerOpen.value = true;
  detail.value = record;
  tagCustomers.value = [];
  customersLoading.value = true;
  try {
    tagCustomers.value = await getTagCustomers(record.id);
  } catch {
    // 拉取失败自动关闭抽屉并提示
    drawerOpen.value = false;
    detail.value = null;
    message.error('标签详情加载失败');
  } finally {
    customersLoading.value = false;
  }
}

/** 抽屉内操作完成后同步刷新：列表 + 抽屉内数据 */
async function refreshDrawer() {
  if (!detail.value) return;
  const fresh = allTags.value.find((t) => t.id === detail.value?.id);
  if (fresh) detail.value = { ...fresh };
  customersLoading.value = true;
  try {
    tagCustomers.value = await getTagCustomers(detail.value.id);
  } finally {
    customersLoading.value = false;
  }
}

// 抽屉内删除
async function onDelete() {
  if (!detail.value) return;
  try {
    await deleteTag(detail.value.id);
    message.success('标签已删除');
    drawerOpen.value = false;
    detail.value = null;
    await loadList();
  } catch {
    // 已被引用时后端拦截
  }
}

const customerColumns: TableColumnType[] = [
  { title: '客户名称', dataIndex: 'name' },
  { title: '简称', dataIndex: 'short_name', ellipsis: true },
  { title: '类型', dataIndex: 'genre', width: 90, ellipsis: true },
  { title: '客户状态', dataIndex: 'custom_state', width: 100, ellipsis: true },
  { title: '五级分类', dataIndex: 'classification', width: 100, ellipsis: true },
  { title: '管护经理', dataIndex: 'managementor_name', width: 120, ellipsis: true },
  { title: '操作', key: 'op', width: 80, fixed: 'right' },
];

// 移除 标签↔客户 关联（操作列）
async function onRemoveRelation(record: TagCustomer) {
  if (!detail.value) return;
  try {
    await removeTagCustomer(detail.value.id, record.id);
    message.success('已移除该客户的标签关联');
    await loadList();
    await refreshDrawer();
  } catch {
    // 后端拦截（关联不存在等）
  }
}

// ============ 新建 ============
const createVisible = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  name: '',
  type: 10 as number,
});

function openCreate() {
  Object.assign(createForm, { name: '', type: 10 });
  createVisible.value = true;
}

async function submitCreate() {
  if (!createForm.name.trim()) {
    message.warning('请填写标签名称');
    return;
  }
  createLoading.value = true;
  try {
    await createTag({ name: createForm.name.trim(), type: createForm.type });
    message.success('标签创建成功');
    createVisible.value = false;
    await loadList();
  } finally {
    createLoading.value = false;
  }
}

// ============ 编辑（抽屉 #extra 编辑按钮） ============
const editVisible = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  id: 0,
  name: '',
  type: 10 as number,
});

function openEdit() {
  if (!detail.value) return;
  Object.assign(editForm, {
    id: detail.value.id,
    name: detail.value.name,
    type: detail.value.type,
  });
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.name.trim()) {
    message.warning('请填写标签名称');
    return;
  }
  editLoading.value = true;
  try {
    await updateTag(editForm.id, { name: editForm.name.trim(), type: editForm.type });
    message.success('标签已更新');
    editVisible.value = false;
    await loadList();
    await refreshDrawer();
  } finally {
    editLoading.value = false;
  }
}

onMounted(loadList);
</script>

<template>
  <Page>
    <!-- 筛选区 -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.q"
          allow-clear
          placeholder="标签名称"
          style="width: 200px"
          @press-enter="applyQuery"
        />
        <SearchSelect
          v-model:value="query.type"
          :options="TAG_TYPE_OPTIONS"
          allow-clear
          placeholder="类型"
          style="width: 120px"
        />
        <Button type="primary" @click="applyQuery">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <div class="flex-1" />
        <AccessControl :codes="['customer:create']" type="code">
          <Button type="primary" @click="openCreate">新增标签</Button>
        </AccessControl>
      </div>
    </Card>

    <!-- 表格区（名称列链接化为唯一详情入口，无行内操作列） -->
    <Card size="small">
      <Table
        :columns="columns"
        :custom-row="customRow"
        :data-source="pagedList"
        :loading="loading"
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number) => { query.page = p; },
          onShowSizeChange: (_c: number, s: number) => { query.page = 1; query.page_size = s; },
        }"
        :row-class-name="rowClassName"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
            <a @click="openDetail(record as ExtraTag)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'type'">
            {{ typeLabel(record.type) }}
          </template>
          <template v-else-if="column.dataIndex === 'in_use'">
            <Tag :color="record.in_use ? 'green' : 'default'">
              {{ record.in_use ? '使用中' : '未使用' }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'created_by_name'">
            {{ dash(record.created_by_name) }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 详情抽屉 -->
    <Drawer
      v-model:open="drawerOpen"
      :title="detail?.name ?? '标签详情'"
      width="66%"
      @close="detail = null"
    >
      <template v-if="detail">
        <Card size="small">
          <template #title>基本信息</template>
          <template #extra>
            <Space size="small">
              <AccessControl :codes="['customer:update']" type="code">
                <Button type="primary" @click="openEdit">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['customer:update']" type="code">
                <Popconfirm
                  :disabled="detail.in_use"
                  :title="detail.in_use ? '标签已被客户使用，不可删除' : '确认删除该标签？'"
                  @confirm="onDelete"
                >
                  <Button danger :disabled="detail.in_use">删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="标签名称">
              {{ dash(detail.name) }}
            </DescriptionsItem>
            <DescriptionsItem label="标签类型">
              {{ typeLabel(detail.type) }}
            </DescriptionsItem>
            <DescriptionsItem label="使用中">
              <Tag :color="detail.in_use ? 'green' : 'default'">
                {{ detail.in_use ? '使用中' : '未使用' }}
              </Tag>
            </DescriptionsItem>
          </Descriptions>
        </Card>

        <!-- 关联数据：客户 Tab -->
        <Tabs class="mt-3" size="small">
          <TabPane :tab="`客户（${tagCustomers.length}）`" key="customers">
            <Table
              :columns="customerColumns"
              :data-source="tagCustomers"
              :loading="customersLoading"
              :pagination="false"
              :scroll="{ x: 'max-content' }"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'name'">
                  {{ record.name }}
                </template>
                <template v-else-if="column.dataIndex === 'genre'">
                  {{ GENRE_LABELS[record.genre] ?? dash(record.genre) }}
                </template>
                <template v-else-if="column.dataIndex === 'custom_state'">
                  {{ CUSTOM_STATE_LABELS[record.custom_state] ?? dash(record.custom_state) }}
                </template>
                <template v-else-if="column.dataIndex === 'classification'">
                  <Tag :color="CLASSIFICATION_COLORS[record.classification] ?? 'default'">
                    {{ CLASSIFICATION_LABELS[record.classification] ?? dash(record.classification) }}
                  </Tag>
                </template>
                <template v-else-if="column.dataIndex === 'managementor_name'">
                  {{ dash(record.managementor_name) }}
                </template>
                <template v-else-if="column.key === 'op'">
                  <AccessControl :codes="['customer:update']" type="code">
                    <Popconfirm
                      :title="`确认移除 ${record.name} 与该标签的关联？`"
                      @confirm="onRemoveRelation(record as TagCustomer)"
                    >
                      <Button danger size="small" type="link">移除</Button>
                    </Popconfirm>
                  </AccessControl>
                </template>
              </template>
            </Table>
          </TabPane>
        </Tabs>
      </template>
    </Drawer>

    <!-- 新建标签 -->
    <Modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      title="新增标签"
      @ok="submitCreate"
    >
      <Form :label-col="{ span: 5 }" :model="createForm" :wrapper-col="{ span: 17 }">
        <FormItem label="标签名称" required>
          <Input v-model:value="createForm.name" placeholder="如：高新技术企业" />
        </FormItem>
        <FormItem label="标签类型" required>
          <SearchSelect v-model:value="createForm.type" :options="TAG_TYPE_OPTIONS" />
        </FormItem>
      </Form>
    </Modal>

    <!-- 编辑标签 -->
    <Modal
      v-model:open="editVisible"
      :confirm-loading="editLoading"
      title="编辑标签"
      @ok="submitEdit"
    >
      <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <FormItem label="标签名称" required>
          <Input v-model:value="editForm.name" />
        </FormItem>
        <FormItem label="标签类型" required>
          <SearchSelect v-model:value="editForm.type" :options="TAG_TYPE_OPTIONS" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
