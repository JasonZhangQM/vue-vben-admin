<script lang="ts" setup>
import type { ArticleListItem } from '#/api/basic/article';
import type { TableColumnType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useRowHighlight } from '#/composables/useRowHighlight';
import { dash } from '#/utils/format';

import DetailDrawer from './detail-drawer.vue';

import {
  createArticle,
  getArticleList,
  updateArticle,
} from '#/api/basic/article';
import {
  getArticleDict,
  getArticleProductsDict,
  getEmployeeDict,
} from '#/api/basic/dict';

// ============ 字典 ============
const articleStateOpts = ref<{ label: string; value: number }[]>([]);
const repayMethodOpts = ref<{ label: string; value: number }[]>([]);
const productOpts = ref<{ label: string; value: number }[]>([]);
const pmOptions = ref<{ label: string; value: number }[]>([]);
const controlOptions = ref<{ label: string; value: number }[]>([]);
const employeeOptions = ref<{ label: string; value: number }[]>([]);

onMounted(async () => {
  const [dict, products] = await Promise.all([
    getArticleDict(),
    getArticleProductsDict(),
  ]);
  articleStateOpts.value = dict.article_state;
  repayMethodOpts.value = dict.repay_method;
  productOpts.value = products.map((p) => ({ label: p.name, value: p.id }));
  const [pms, controllers, emps] = await Promise.all([
    getEmployeeDict({ role: 'pm' }),
    getEmployeeDict({ role: 'controler' }),
    getEmployeeDict(),
  ]);
  pmOptions.value = pms.map((u) => ({ label: u.name, value: u.id }));
  controlOptions.value = controllers.map((u) => ({ label: u.name, value: u.id }));
  employeeOptions.value = emps.map((u) => ({ label: u.name, value: u.id }));
});

// ============ 列表 ============
const { highlight, clearHighlight, rowClassName, customRow } = useRowHighlight();

const list = ref<ArticleListItem[]>([]);
const total = ref(0);
const loading = ref(false);

// warrant 模式：query 里 undefined 字段后端忽略
const query = reactive({
  page: 1,
  page_size: 20,
  keyword: '',
  article_state: undefined as number | undefined,
  product_id: undefined as number | undefined,
  director_id: undefined as number | undefined,
});

async function loadList() {
  loading.value = true;
  try {
    const data = await getArticleList(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function onQuery() {
  query.page = 1;
  loadList();
}

function onReset() {
  query.keyword = '';
  query.article_state = undefined;
  query.product_id = undefined;
  query.director_id = undefined;
  query.page = 1;
  loadList();
}

const columns = computed<TableColumnType[]>(() => [
  { title: '项目编号', dataIndex: 'article_num', width: 160 },
  { title: '状态', dataIndex: 'article_state', width: 100 },
  { title: '客户名称', dataIndex: 'customer_name' },
  { title: '产品', dataIndex: 'product_name', width: 120 },
  { title: '授信额(万)', dataIndex: 'renewal', width: 110, align: 'right' },
  { title: '项目经理', dataIndex: 'director_name', width: 110 },
  { title: '风控经理', dataIndex: 'control_name', width: 110 },
  { title: '余额', dataIndex: 'balance', width: 100, align: 'right' },
  { title: '签批日期', dataIndex: 'sign_date', width: 120 },
  { title: '创建时间', dataIndex: 'created_at', width: 170 },
  { title: '创建人', dataIndex: 'created_by_name', width: 100, fixed: 'right' },
]);

function stateColor(state: number) {
  const map: Record<number, string> = {
    10: 'default', 20: 'blue', 30: 'orange', 40: 'cyan',
    50: 'green', 51: 'geekblue', 55: 'purple', 61: 'gold', 99: 'red',
  };
  return map[state] || 'default';
}

// ============ 详情抽屉 ============
const detailOpen = ref(false);
const detailId = ref<number | null>(null);
/** 详情抽屉当前项在列表中的索引，用于删除后定位相邻项 */
const currentDetailIndex = ref(-1);

function openDetail(row: ArticleListItem) {
  const idx = list.value.findIndex((r) => r.id === row.id);
  currentDetailIndex.value = idx;
  highlight(row.id);
  detailId.value = row.id;
  detailOpen.value = true;
}

// ============ 创建 / 编辑 ============
const createOpen = ref(false);
const createLoading = ref(false);
const editingId = ref<number | null>(null);

const form = reactive({
  article_state: 10,
  customer_id: undefined as number | undefined,
  product_id: undefined as number | undefined,
  renewal: undefined as number | undefined,
  augment: undefined as number | undefined,
  credit_term: undefined as number | undefined,
  director_id: undefined as number | undefined,
  assistant_id: undefined as number | undefined,
  control_id: undefined as number | undefined,
  repay_method: undefined as number | undefined,
});

async function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    article_state: 10, customer_id: undefined, product_id: undefined,
    renewal: undefined, augment: undefined, credit_term: undefined,
    director_id: undefined, assistant_id: undefined, control_id: undefined,
    repay_method: undefined,
  });
  createOpen.value = true;
}

async function onSubmit() {
  if (!form.customer_id || !form.product_id) {
    message.warning('客户和产品为必填');
    return;
  }
  if (form.renewal == null || form.augment == null) {
    message.warning('请填写授信金额');
    return;
  }
  createLoading.value = true;
  try {
    if (editingId.value) {
      await updateArticle(editingId.value, form);
      message.success('修改成功');
    } else {
      await createArticle(form);
      message.success('创建成功');
    }
    createOpen.value = false;
    await loadList();
  } catch {
    // requestClient 已 toast
  } finally {
    createLoading.value = false;
  }
}

// ============ 详情抽屉透传事件 ============
/** 详情抽屉：编辑保存成功，列表可能有字段更新，刷新即可 */
function onDetailSaved(_id: number) {
  loadList();
}

/** 详情抽屉：删除成功，刷新列表后自动打开相邻一条保持浏览连续性 */
async function onDetailDeleted(_deletedId: number) {
  // 记住被删项的原索引；loadList 后该位置就是下一条
  const fallbackIdx = currentDetailIndex.value;
  detailOpen.value = false; // 先确保 Drawer 完全关闭（组件 destroyOnClose）
  detailId.value = null;
  currentDetailIndex.value = -1;

  await loadList();

  if (list.value.length === 0) {
    // 删空了，停在列表
    clearHighlight();
    return;
  }

  // 优先打开同索引位置（删后自动成为下一条），超出则开最后一条
  const nextIdx = Math.min(fallbackIdx, list.value.length - 1);
  const nextRow = list.value[nextIdx];
  if (!nextRow) return; // 防御：极端情况列表已被清空
  highlight(nextRow.id);
  detailId.value = nextRow.id;
  detailOpen.value = true;
  currentDetailIndex.value = nextIdx;
}

onMounted(loadList);
</script>

<template>
  <Page>
    <!-- === 筛选卡 === -->
    <Card size="small" class="mb-3">
      <Form layout="inline" :model="query" class="flex-wrap gap-y-2">
        <FormItem label="项目编号">
          <Input
            v-model:value="query.keyword"
            placeholder="输入项目编号搜索"
            allow-clear
            style="width: 200px"
            @pressEnter="onQuery"
          />
        </FormItem>
        <FormItem label="状态">
          <SearchSelect
            v-model:value="query.article_state"
            :options="articleStateOpts"
            placeholder="全部"
            style="width: 160px"
            allow-clear
          />
        </FormItem>
        <FormItem label="产品">
          <SearchSelect
            v-model:value="query.product_id"
            :options="productOpts"
            placeholder="全部"
            style="width: 160px"
            allow-clear
          />
        </FormItem>
        <FormItem label="项目经理">
          <SearchSelect
            v-model:value="query.director_id"
            placeholder="输入名字搜索"
            style="width: 200px"
            allow-clear
            :options="pmOptions"
          />
        </FormItem>
        <FormItem>
          <Space>
            <Button type="primary" @click="onQuery">查询</Button>
            <Button @click="onReset">重置</Button>
          </Space>
        </FormItem>
      </Form>
    </Card>

    <!-- === 表格 === -->
    <Card size="small">
      <template #extra>
        <AccessControl :codes="['article:create']" type="code">
          <Button type="primary" @click="openCreate">新建项目</Button>
        </AccessControl>
      </template>

      <Table
        size="small"
        row-key="id"
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number, ps: number) => {
            query.page = p;
            query.page_size = ps;
            loadList();
          },
        }"
        :custom-row="customRow"
        :row-class-name="rowClassName"
        :scroll="{ x: 1300 }"
      >
        <template #bodyCell="{ column, record }">
          <!-- 项目编号：可点击打开详情 + 行高亮 -->
          <template v-if="column.dataIndex === 'article_num'">
            <a class="text-blue-500 hover:underline" @click="openDetail(record as ArticleListItem)">
              {{ (record as ArticleListItem).article_num }}
            </a>
          </template>
          <!-- 状态标签 -->
          <template v-else-if="column.dataIndex === 'article_state'">
            <Tag :color="stateColor((record as ArticleListItem).article_state)">
              {{ (record as ArticleListItem).article_state_display || '-' }}
            </Tag>
          </template>
          <!-- 授信额 -->
          <template v-else-if="column.dataIndex === 'renewal'">
            {{ ((record as ArticleListItem).renewal + (record as ArticleListItem).augment).toFixed(2) }}
          </template>
          <!-- 余额 -->
          <template v-else-if="column.dataIndex === 'balance'">
            {{ (record as ArticleListItem).balance?.toFixed(2) ?? '-' }}
          </template>
          <!-- 需要 dash 兜底的文本列 -->
          <template v-else-if="['customer_name','product_name','director_name','control_name','sign_date','created_at','created_by_name'].includes(column.dataIndex as string)">
            {{ dash((record as ArticleListItem)[column.dataIndex as keyof ArticleListItem] as string) }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- === 详情抽屉（内嵌编辑/删除，事件分离：saved=编辑/刷新列表，deleted=删除/自动定位下一条）=== -->
    <DetailDrawer
      v-model:open="detailOpen"
      :article-id="detailId"
      @saved="onDetailSaved"
      @deleted="onDetailDeleted"
    />

    <!-- === 创建 / 编辑 Drawer === -->
    <Drawer
      v-model:open="createOpen"
      :title="editingId ? '编辑项目' : '新建项目'"
      width="66%"
      :destroy-on-close="true"
    >
      <Form
        :label-col="{ span: 8 }"
        :wrapper-col="{ span: 16 }"
        :model="form"
        class="grid grid-cols-2 gap-x-6"
      >
        <FormItem label="客户" required>
          <SearchSelect
            v-model:value="form.customer_id"
            placeholder="输入客户名搜索"
            style="width: 100%"
            :options="employeeOptions"
          />
        </FormItem>
        <FormItem label="产品" required>
          <SearchSelect
            v-model:value="form.product_id"
            :options="productOpts"
            placeholder="选择产品"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="授信额(万)" required>
          <InputNumber v-model:value="form.renewal" :min="0" :precision="2" style="width: 100%" />
        </FormItem>
        <FormItem label="追加额(万)">
          <InputNumber v-model:value="form.augment" :min="0" :precision="2" style="width: 100%" />
        </FormItem>
        <FormItem label="期限(月)">
          <InputNumber v-model:value="form.credit_term" :min="1" style="width: 100%" />
        </FormItem>
        <FormItem label="还款方式">
          <SearchSelect
            v-model:value="form.repay_method"
            :options="repayMethodOpts"
            placeholder="选择"
            style="width: 100%"
            allow-clear
          />
        </FormItem>
        <FormItem label="项目经理">
          <SearchSelect
            v-model:value="form.director_id"
            placeholder="输入名字搜索"
            style="width: 100%"
            allow-clear
            :options="pmOptions"
          />
        </FormItem>
        <FormItem label="风控经理">
          <SearchSelect
            v-model:value="form.control_id"
            placeholder="输入名字搜索"
            style="width: 100%"
            allow-clear
            :options="controlOptions"
          />
        </FormItem>
        <FormItem label="助理">
          <SearchSelect
            v-model:value="form.assistant_id"
            placeholder="输入名字搜索"
            style="width: 100%"
            allow-clear
            :options="employeeOptions"
          />
        </FormItem>
      </Form>

      <template #extra>
        <Space>
          <Button @click="createOpen = false">取消</Button>
          <Button type="primary" :loading="createLoading" @click="onSubmit">确定</Button>
        </Space>
      </template>
    </Drawer>
  </Page>
</template>
