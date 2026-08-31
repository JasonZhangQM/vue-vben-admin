<script lang="ts" setup>
/** 客户管理：列表(data_scope 过滤)/ 新建(create-drawer)/ 详情抽屉。 */

import type { CustomerListItem } from '#/api/basic/customer';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Button, Card, Input, Table, Tag } from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';

import { getCustomerList } from '#/api/basic/customer';

import CreateDrawer from './create-drawer.vue';
import DetailDrawer from './detail-drawer.vue';

// 全局共享工具：行高亮 composable + 格式化函数(消除重复定义)
import { useRowHighlight } from '#/composables/useRowHighlight';
import { dash } from '#/utils/format';

// 全局字典 store(后端 dict 接口返回的枚举 label 是唯一真相源，禁止硬编码)
import { useDictStore } from '#/store';
const dictStore = useDictStore();

/** 五级分类颜色映射(后端 dict 暂未扩展 tag_color，本地临时映射) */
const classificationColor = (c: number) =>
  ({ 10: 'green', 20: 'blue', 30: 'orange', 40: 'red', 50: 'red' })[c] ?? 'default';

// ================= 列表 =================
const loading = ref(false);
const list = ref<CustomerListItem[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  page_size: 20,
  q: '',
  genre: undefined as number | undefined,
  // 布尔筛选用 1/0 表示(AntD Select value 不支持 boolean)，提交前转换
  is_core: undefined as number | undefined,
  is_acceptor: undefined as number | undefined,
  classification: undefined as number | undefined,
});

async function loadList() {
  loading.value = true;
  try {
    const data = await getCustomerList({
      ...query,
      is_core: query.is_core === undefined ? undefined : query.is_core === 1,
      is_acceptor:
        query.is_acceptor === undefined ? undefined : query.is_acceptor === 1,
    });
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

/** 重置：清空全部筛选条件并回到第 1 页重新查询 */
function resetQuery() {
  query.q = '';
  query.genre = undefined;
  query.classification = undefined;
  query.is_core = undefined;
  query.is_acceptor = undefined;
  query.page = 1;
  loadList();
}

// ================= 详情 =================
const detailOpen = ref(false);
const detailCustomerId = ref<null | number>(null);

function openDetail(row: any) {
  highlightRow(row); // 打开详情即高亮该行
  detailCustomerId.value = row.id;
  detailOpen.value = true;
}

// ================= 新建 =================
const createOpen = ref(false);
function openCreate() {
  createOpen.value = true;
}

// ================= 表格 =================
// 表格行点击高亮(useRowHighlight composable 全局共享)
const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

const columns: TableColumnType[] = [
  { title: '客户名称', dataIndex: 'name' }, // 详情入口链接列：不加 ellipsis
  { title: '简称', dataIndex: 'short_name', ellipsis: true },
  { title: '类型', dataIndex: 'genre', ellipsis: true },
  { title: '五级分类', dataIndex: 'classification', ellipsis: true },
  { title: '管护经理', dataIndex: 'managementor_name', ellipsis: true },
  { title: '风控专员', dataIndex: 'controler_name', ellipsis: true },
  { title: '授信额度', dataIndex: 'credit_amount', ellipsis: true },
  { title: '在保余额', dataIndex: 'amount', ellipsis: true },
  { title: '标记', key: 'flags', ellipsis: true },
  { title: '创建人', dataIndex: 'created_by_name', ellipsis: true },
];

onMounted(() => {
  loadList();
});
</script>

<template>
  <!-- 不传 title/description：不渲染页头 -->
  <Page>
    <!-- 筛选区：独立 Card -->
    <Card class="mb-3" size="small">
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model:value="query.q"
          allow-clear
          placeholder="客户名称 / 简称 / 信用代码"
          style="width: 220px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <SearchSelect
          v-model:value="query.genre"
          :options="dictStore.get('customer.genre')"
          allow-clear
          placeholder="类型"
          style="width: 100px"
        />
        <SearchSelect
          v-model:value="query.classification"
          :options="dictStore.get('customer.classification')"
          allow-clear
          placeholder="五级分类"
          style="width: 110px"
        />
        <SearchSelect
          v-model:value="query.is_core"
          :options="[
            { label: '核心企业', value: 1 },
            { label: '非核心', value: 0 },
          ]"
          allow-clear
          placeholder="核心企业"
          style="width: 120px"
        />
        <SearchSelect
          v-model:value="query.is_acceptor"
          :options="[
            { label: '承兑人', value: 1 },
            { label: '非承兑', value: 0 },
          ]"
          allow-clear
          placeholder="承兑人"
          style="width: 110px"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <div class="flex-1" />
        <AccessControl :codes="['customer:create']" type="code">
          <Button type="primary" @click="openCreate">新增客户</Button>
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
        :pagination="{
          current: query.page,
          pageSize: query.page_size,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number) => { query.page = p; loadList(); },
          onShowSizeChange: (_c: number, s: number) => { query.page = 1; query.page_size = s; loadList(); },
        }"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
            <!-- 名称列即详情入口(不加 ellipsis) -->
            <a @click="openDetail(record)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'short_name'">
            {{ dash(record.short_name) }}
          </template>
          <template v-else-if="column.dataIndex === 'genre'">
            {{ dictStore.labelOf('customer.genre', record.genre) }}
          </template>
          <template v-else-if="column.dataIndex === 'classification'">
            <Tag :color="classificationColor(record.classification)">
              {{ dictStore.labelOf('customer.classification', record.classification) }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'managementor_name'">
            {{ dash(record.managementor_name) }}
          </template>
          <template v-else-if="column.dataIndex === 'controler_name'">
            {{ dash(record.controler_name) }}
          </template>
          <template v-else-if="column.dataIndex === 'credit_amount'">
            {{ record.credit_amount?.toLocaleString() ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'amount'">
            {{ record.amount?.toLocaleString() ?? '—' }}
          </template>
          <template v-else-if="column.key === 'flags'">
            <Tag v-if="record.is_core" color="purple">核心</Tag>
            <Tag v-if="record.is_acceptor" color="cyan">承兑</Tag>
            <span v-if="!record.is_core && !record.is_acceptor">—</span>
          </template>
          <template v-else-if="column.dataIndex === 'created_by_name'">
            {{ dash(record.created_by_name) }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新增客户抽屉 -->
    <CreateDrawer v-model:open="createOpen" @created="loadList" />

    <!-- 客户详情抽屉 -->
    <DetailDrawer v-model:open="detailOpen" :customer-id="detailCustomerId" @updated="loadList" />
  </Page>
</template>
