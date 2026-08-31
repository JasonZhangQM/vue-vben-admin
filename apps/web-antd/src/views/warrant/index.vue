<script lang="ts" setup>
/** 权证管理：列表 / 批量操作 / 详情抽屉 / 新建抽屉(create-drawer.vue)。 */

import type { WarrantListItem } from '#/api/basic/warrant';
import type { TableColumnType } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  DatePicker,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Table,
  Tag,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useRowHighlight } from '#/composables/useRowHighlight';
import { useDictStore } from '#/store/dict';
import { dash } from '#/utils/format';

import { warrantStateColor, STORAGE_TYPE_COLOR } from './constants';

import { getUserList } from '#/api/system/user';
import { getCustomerList } from '#/api/basic/customer';
import {
  batchCancel,
  batchStorage,
  batchTransferWarrants,
  getWarrantList,
} from '#/api/basic/warrant';

import CreateDrawer from './create-drawer.vue';
import DetailDrawer from './detail-drawer.vue';

// dict store(label 真相源，禁止硬编码 OPTIONS)
const dictStore = useDictStore();

// ================= 列表 =================
const loading = ref(false);
const list = ref<WarrantListItem[]>([]);
const total = ref(0);
const query = reactive({
  page: 1,
  page_size: 20,
  q: '',
  warrant_type: undefined as number | undefined,
  warrant_state: undefined as number | undefined,
  auction_state: undefined as number | undefined,
  evaluate_method: undefined as number | undefined,
  owner_id: undefined as number | undefined,
});

// 表格勾选(批量操作用)
const selectedRowKeys = ref<number[]>([]);
const selectedRows = ref<WarrantListItem[]>([]);
// AntD rowSelection 的 key 类型为 string | number(Key)，row-key 是数字 id，安全转回 number
const onSelectChange = (keys: (string | number)[], rows: WarrantListItem[]) => {
  selectedRowKeys.value = keys.map(Number);
  selectedRows.value = rows;
};

async function loadList() {
  loading.value = true;
  try {
    const data = await getWarrantList(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

/** 重置：清空全部筛选条件并回到第 1 页重新查询 */
function resetQuery() {
  query.q = '';
  query.warrant_type = undefined;
  query.warrant_state = undefined;
  query.auction_state = undefined;
  query.evaluate_method = undefined;
  query.owner_id = undefined;
  ownerOptions.value = []; // 清远程搜索下拉缓存
  query.page = 1;
  loadList();
}

// 所有权人远程搜索(对接后端 list_warrants 的 owner_id 筛选)
const ownerOptions = ref<{ label: string; value: number }[]>([]);
const ownerLoading = ref(false);
async function onSearchOwner(keyword: string) {
  if (!keyword) {
    ownerOptions.value = [];
    return;
  }
  ownerLoading.value = true;
  try {
    const data = await getCustomerList({ page: 1, page_size: 30, q: keyword });
    ownerOptions.value = data.items.map((c) => ({
      label: `${c.name}(${c.genre === 1 ? '企业' : '个人'})`,
      value: c.id,
    }));
  } finally {
    ownerLoading.value = false;
  }
}

// ================= 详情 =================
const detailOpen = ref(false);
const detailWarrantId = ref<null | number>(null);

// 表格行点击高亮(useRowHighlight composable 全局共享)
const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

function openDetail(row: any) {
  highlightRow(row); // 打开详情即高亮该行
  detailWarrantId.value = row.id;
  detailOpen.value = true;
}

// ================= 新建(独立抽屉组件 create-drawer.vue) =================
const createOpen = ref(false);

const columns: TableColumnType[] = [
  { title: '权证号', dataIndex: 'warrant_num' }, // 详情入口链接列：不加 ellipsis
  { title: '类型', dataIndex: 'warrant_type', width: 90 },
  { title: '状态', dataIndex: 'warrant_state', width: 90 },
  { title: '所有权人', dataIndex: 'owner_names', ellipsis: true },
  { title: '评估值', dataIndex: 'evaluate_value', width: 100 },
  { title: '最近出入库', dataIndex: 'storage_latest', width: 140 },
  { title: '登记时间', dataIndex: 'created_at', ellipsis: true },
  { title: '登记人', dataIndex: 'created_by_name', ellipsis: true },
];

// ================= 批量操作 =================
const batchStorageVisible = ref(false);
const batchTransferVisible = ref(false);
const batchCancelVisible = ref(false);
const batchLoading = ref(false);
const batchStorageForm = reactive({
  storage_type: 10,
  storage_date: '',
  storage_explain: '',
});
const batchTransferForm = reactive({
  to_conservator_id: undefined as number | undefined,
  reason: '',
});
const batchCancelForm = reactive({ reason: '' });
const userOptions = ref<{ label: string; value: number }[]>([]);
const userLoading = ref(false);
async function onSearchUser(keyword: string) {
  userLoading.value = true;
  try {
    const res = await getUserList({ page: 1, page_size: 30, q: keyword });
    userOptions.value = res.items.map((u) => ({ label: `${u.name || u.username}(${u.username})`, value: u.id }));
  } finally {
    userLoading.value = false;
  }
}

async function submitBatchStorage() {
  if (!batchStorageForm.storage_date) {
    message.warning('请选择出入库日期');
    return;
  }
  batchLoading.value = true;
  try {
    const data = await batchStorage({
      warrant_ids: selectedRowKeys.value,
      storage_type: batchStorageForm.storage_type,
      storage_date: batchStorageForm.storage_date,
      storage_explain: batchStorageForm.storage_explain || undefined,
    });
    message.success(`已批量出入库 ${data.count} 个权证`);
    batchStorageVisible.value = false;
    selectedRowKeys.value = [];
    await loadList();
  } finally {
    batchLoading.value = false;
  }
}

async function submitBatchTransfer() {
  if (!batchTransferForm.to_conservator_id || !batchTransferForm.reason) {
    message.warning('请选择接收人并填写移交原因');
    return;
  }
  batchLoading.value = true;
  try {
    const data = await batchTransferWarrants({
      warrant_ids: selectedRowKeys.value,
      to_conservator_id: batchTransferForm.to_conservator_id,
      reason: batchTransferForm.reason,
    });
    message.success(`已批量移交 ${data.count} 个权证`);
    batchTransferVisible.value = false;
    selectedRowKeys.value = [];
    await loadList();
  } finally {
    batchLoading.value = false;
  }
}

async function submitBatchCancel() {
  if (!batchCancelForm.reason) {
    message.warning('请填写注销原因');
    return;
  }
  batchLoading.value = true;
  try {
    const data = await batchCancel({
      warrant_ids: selectedRowKeys.value,
      reason: batchCancelForm.reason,
    });
    message.success(`已批量注销 ${data.count} 个权证`);
    batchCancelVisible.value = false;
    selectedRowKeys.value = [];
    await loadList();
  } finally {
    batchLoading.value = false;
  }
}

function openBatchStorage() {
  batchStorageForm.storage_type = 10;
  batchStorageForm.storage_date = '';
  batchStorageForm.storage_explain = '';
  batchStorageVisible.value = true;
}
function openBatchTransfer() {
  batchTransferForm.to_conservator_id = undefined;
  batchTransferForm.reason = '';
  batchTransferVisible.value = true;
}
function openBatchCancel() {
  batchCancelForm.reason = '';
  batchCancelVisible.value = true;
}

onMounted(() => {
  dictStore.loadAll(); // 枚举字典优先加载
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
          placeholder="权证号"
          style="width: 200px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <SearchSelect
          v-model:value="query.warrant_type"
          :options="dictStore.get('warrant.warrant_type')"
          allow-clear
          placeholder="类型"
          style="width: 120px"
        />
        <SearchSelect
          v-model:value="query.warrant_state"
          :options="dictStore.get('warrant.warrant_state')"
          allow-clear
          placeholder="状态"
          style="width: 120px"
        />
        <SearchSelect
          v-model:value="query.auction_state"
          :options="dictStore.get('warrant.auction_state')"
          allow-clear
          placeholder="拍卖状态"
          style="width: 120px"
        />
        <SearchSelect
          v-model:value="query.evaluate_method"
          :options="dictStore.get('warrant.evaluate_method')"
          allow-clear
          placeholder="评估方式"
          style="width: 120px"
        />
        <SearchSelect
          v-model:value="query.owner_id"
          :options="ownerOptions"
          :loading="ownerLoading"
          allow-clear
          placeholder="所有权人"
          remote
          style="width: 180px"
          @search="onSearchOwner"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <div class="flex-1" />
        <template v-if="selectedRowKeys.length > 0">
          <span class="text-xs text-gray-500">已选 {{ selectedRowKeys.length }} 条</span>
          <AccessControl :codes="['warrant:storage']" type="code">
            <Button size="small" @click="openBatchStorage">批量出入库</Button>
            <Button size="small" @click="openBatchTransfer">批量移交</Button>
          </AccessControl>
          <AccessControl :codes="['warrant:update']" type="code">
            <Button size="small" danger @click="openBatchCancel">批量注销</Button>
          </AccessControl>
        </template>
        <AccessControl :codes="['warrant:create']" type="code">
          <Button type="primary" @click="createOpen = true">新增权证</Button>
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
        :row-key="(r) => r.id"
        :row-selection="{
          selectedRowKeys,
          onChange: onSelectChange,
          columnWidth: 36,
        }"
        :row-class-name="rowClassName"
        :scroll="{ x: 'max-content' }"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'warrant_num'">
            <!-- 权证号列即详情入口(不加 ellipsis) -->
            <a @click="openDetail(record)">{{ record.warrant_num }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'warrant_type'">
            {{ dictStore.labelOf('warrant.warrant_type', record.warrant_type) }}
          </template>
          <template v-else-if="column.dataIndex === 'warrant_state'">
            <Tag :color="warrantStateColor(record.warrant_state)">
              {{ dictStore.labelOf('warrant.warrant_state', record.warrant_state) }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'owner_names'">
            {{ (record.owner_names as string[])?.join('、') || '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'evaluate_value'">
            {{ record.evaluate_value?.toLocaleString() ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'storage_latest'">
            <template v-if="record.storage_latest">
              <Tag size="small" :color="STORAGE_TYPE_COLOR[record.storage_latest.storage_type] ?? 'default'">
                {{ dictStore.labelOf('warrant.storage_type', record.storage_latest.storage_type) }}
              </Tag>
              <span class="text-xs text-gray-500 ml-1">{{ record.storage_latest.storage_date }}</span>
            </template>
            <template v-else>—</template>
          </template>
          <template v-else-if="column.dataIndex === 'created_by_name'">
            {{ dash(record.created_by_name) }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建权证抽屉(分区 Card + 可编辑表格 + 校验，见 create-drawer.vue) -->
    <CreateDrawer v-model:open="createOpen" @created="loadList" />

    <!-- 权证详情抽屉 -->
    <DetailDrawer v-model:open="detailOpen" :warrant-id="detailWarrantId" @updated="loadList" />
  <!-- 批量出入库 Modal -->
  <Modal v-model:open="batchStorageVisible" :confirm-loading="batchLoading" @ok="submitBatchStorage">
    <p>已选 {{ selectedRowKeys.length }} 个权证，统一执行出入库操作</p>
    <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
      <FormItem label="操作类型" required>
        <SearchSelect
          v-model:value="batchStorageForm.storage_type"
          :options="dictStore.get('warrant.storage_type')"
        />
      </FormItem>
      <FormItem label="操作日期" required>
        <DatePicker v-model:value="batchStorageForm.storage_date" value-format="YYYY-MM-DD" />
      </FormItem>
      <FormItem label="说明">
        <Input v-model:value="batchStorageForm.storage_explain" placeholder="可空" />
      </FormItem>
    </Form>
  </Modal>

  <!-- 批量移交 Modal -->
  <Modal v-model:open="batchTransferVisible" :confirm-loading="batchLoading" @ok="submitBatchTransfer">
    <p>已选 {{ selectedRowKeys.length }} 个权证，统一移交给新的保管人</p>
    <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
      <FormItem label="接收人" required>
        <SearchSelect
          v-model:value="batchTransferForm.to_conservator_id"
          :options="userOptions"
          :loading="userLoading"
          remote
          placeholder="输入姓名/账号搜索"
          @search="onSearchUser"
        />
      </FormItem>
      <FormItem label="移交原因" required>
        <Input.TextArea v-model:value="batchTransferForm.reason" :rows="3" placeholder="请填写移交原因" />
      </FormItem>
    </Form>
  </Modal>

  <!-- 批量注销 Modal -->
  <Modal v-model:open="batchCancelVisible" :confirm-loading="batchLoading" ok-text="确认注销" :ok-button-props="{ danger: true }" @ok="submitBatchCancel">
    <p class="text-red-500">已选 {{ selectedRowKeys.length }} 个权证，注销后不可恢复</p>
    <Form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
      <FormItem label="注销原因" required>
        <Input.TextArea v-model:value="batchCancelForm.reason" :rows="3" placeholder="请填写注销原因" />
      </FormItem>
    </Form>
  </Modal>
  </Page>
</template>

