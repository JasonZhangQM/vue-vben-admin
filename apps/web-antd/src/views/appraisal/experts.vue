<script lang="ts" setup>
import type { ExpertItem } from '#/api/basic/appraisal';
import type { TableColumnType } from 'ant-design-vue';

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
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { createExpert, getExpertList } from '#/api/basic/appraisal';
import { useRowHighlight } from '#/composables/useRowHighlight';
import ExpertDetailDrawer from './expert-detail-drawer.vue';

const list = ref<ExpertItem[]>([]);
const loading = ref(false);
const submitting = ref(false);

const expertTypeOpts = [
  { label: '内部评委', value: 10 },
  { label: '外部评委', value: 20 },
  { label: '法律顾问', value: 30 },
];

const query = reactive({
  keyword: '' as string,
  expert_type: undefined as number | undefined,
});

// ========== 新建 Modal ==========
const open = ref(false);
const form = reactive({
  name: '',
  org_name: '',
  title: '',
  contact_numb: '',
  email: '',
  expert_type: 20,
  remark: '',
});

// ========== 详情抽屉 ==========
const detailOpen = ref(false);
const detailExpertId = ref<number | null>(null);

// ========== 行点击高亮（与其他列表页一致） ==========
const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

function openDetail(row: ExpertItem) {
  highlightRow(row);
  detailExpertId.value = row.id;
  detailOpen.value = true;
}

function onDetailSaved() {
  loadList();
}

function onDetailDeleted() {
  detailExpertId.value = null;
  loadList();
}

onMounted(loadList);

async function loadList() {
  loading.value = true;
  try {
    const data = await getExpertList({
      keyword: query.keyword || undefined,
      expert_type: query.expert_type,
    });
    list.value = data.items ?? [];
  }
  finally { loading.value = false; }
}

function onQuery() { loadList(); }
function onReset() {
  query.keyword = '';
  query.expert_type = undefined;
  loadList();
}

async function onSubmit() {
  if (!form.name) { message.warning('姓名必填'); return; }
  if (submitting.value) return;
  submitting.value = true;
  try {
    await createExpert({ ...form });
    message.success('新增成功');
    open.value = false;
    await loadList();
  } finally {
    submitting.value = false;
  }
}

function onAdd() {
  Object.assign(form, {
    name: '', org_name: '', title: '', contact_numb: '',
    email: '', expert_type: 20, remark: '',
  });
  open.value = true;
}

// 状态 → 标签颜色（对齐 system/users：启用=green，停用=red）
function statusColor(status: boolean) {
  return status ? 'green' : 'red';
}

const columns = computed<TableColumnType[]>(() => [
  { title: '姓名', dataIndex: 'name', width: 120 },
  { title: '类型', dataIndex: 'expert_type_display', width: 100 },
  { title: '单位', dataIndex: 'org_name' },
  { title: '职称', dataIndex: 'title', width: 120 },
  { title: '电话', dataIndex: 'contact_numb', width: 140 },
  { title: '邮箱', dataIndex: 'email', width: 180 },
  { title: '状态', dataIndex: 'status', width: 80 },
]);
</script>

<template>
  <Page>
    <Card size="small" class="mb-3">
      <Form layout="inline" :model="query" class="flex flex-wrap items-center gap-3">
        <FormItem label="关键字">
          <Input
            v-model:value="query.keyword"
            placeholder="姓名 / 单位"
            allow-clear
            style="width: 200px"
            @press-enter="onQuery"
          />
        </FormItem>
        <FormItem label="评委类型">
          <Select
            v-model:value="query.expert_type"
            :options="expertTypeOpts"
            placeholder="全部"
            allow-clear
            style="width: 140px"
          />
        </FormItem>
        <FormItem>
          <Space>
            <Button type="primary" @click="onQuery">查询</Button>
            <Button @click="onReset">重置</Button>
          </Space>
        </FormItem>
        <div class="flex-1" />
        <AccessControl :codes="['appraisal:expert_create']" type="code">
          <Button type="primary" @click="onAdd">新建</Button>
        </AccessControl>
      </Form>
    </Card>

    <Card size="small">
      <Table
        size="small"
        row-key="id"
        :custom-row="customRow"
        :row-class-name="rowClassName"
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'name'">
            <a @click="openDetail(record as ExpertItem)">{{ record.name }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="statusColor(record.status)">
              {{ record.status_display }}
            </Tag>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新增评委 Modal -->
    <Modal
      v-model:open="open"
      title="新建专家"
      :footer="null"
      :width="520"
      destroy-on-close
    >
      <Form
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 18 }"
        :model="form"
        class="grid gap-y-2"
      >
        <FormItem label="姓名" required>
          <Input v-model:value="form.name" placeholder="专家姓名" />
        </FormItem>
        <FormItem label="类型" required>
          <Select v-model:value="form.expert_type" :options="expertTypeOpts" style="width: 100%" />
        </FormItem>
        <FormItem label="单位">
          <Input v-model:value="form.org_name" placeholder="工作单位" />
        </FormItem>
        <FormItem label="职称">
          <Input v-model:value="form.title" placeholder="高级工程师 / 教授 ..." />
        </FormItem>
        <FormItem label="电话">
          <Input v-model:value="form.contact_numb" placeholder="联系电话" />
        </FormItem>
        <FormItem label="邮箱">
          <Input v-model:value="form.email" placeholder="邮箱" />
        </FormItem>
        <FormItem label="备注">
          <Input v-model:value="form.remark" placeholder="备注" />
        </FormItem>
      </Form>
      <div class="flex justify-end gap-2 mt-4">
        <Button @click="open = false">取消</Button>
        <Button type="primary" :loading="submitting" @click="onSubmit">确定</Button>
      </div>
    </Modal>

    <!-- 详情抽屉 -->
    <ExpertDetailDrawer
      v-model:open="detailOpen"
      :expert-id="detailExpertId"
      @saved="onDetailSaved"
      @deleted="onDetailDeleted"
    />
  </Page>
</template>
