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
  Popconfirm,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import {
  createExpert,
  deleteExpert,
  getExpertList,
  updateExpert,
} from '#/api/basic/appraisal';

const list = ref<ExpertItem[]>([]);
const loading = ref(false);

const expertTypeOpts = [
  { label: '内部评委', value: 10 },
  { label: '外部评委', value: 20 },
];

const query = reactive({
  keyword: '' as string,
  expert_type: undefined as number | undefined,
});

const open = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  name: '',
  org_name: '',
  title: '',
  contact_numb: '',
  email: '',
  expert_type: 20,
  remark: '',
});

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
  const payload: Record<string, unknown> = { ...form };
  if (editingId.value) {
    await updateExpert(editingId.value, payload);
    message.success('修改成功');
  } else {
    await createExpert(payload);
    message.success('新建成功');
  }
  open.value = false;
  await loadList();
}

function onAdd() {
  editingId.value = null;
  Object.assign(form, {
    name: '', org_name: '', title: '', contact_numb: '',
    email: '', expert_type: 20, remark: '',
  });
  open.value = true;
}

function onEdit(row: ExpertItem) {
  editingId.value = row.id;
  Object.assign(form, row);
  open.value = true;
}

async function onDelete(row: ExpertItem) {
  await deleteExpert(row.id);
  message.success('已删除');
  loadList();
}

const columns = computed<TableColumnType[]>(() => [
  { title: '姓名', dataIndex: 'name', width: 120 },
  { title: '类型', dataIndex: 'expert_type_display', width: 100 },
  { title: '单位', dataIndex: 'org_name' },
  { title: '职称', dataIndex: 'title', width: 120 },
  { title: '电话', dataIndex: 'contact_numb', width: 140 },
  { title: '邮箱', dataIndex: 'email', width: 180 },
  { title: '状态', dataIndex: 'status_display', width: 80 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
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
        <FormItem label="专家类型">
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
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <Space>
              <AccessControl :codes="['appraisal:expert_update']" type="code">
                <Button size="small" type="link" @click="onEdit(record as ExpertItem)">编辑</Button>
              </AccessControl>
              <AccessControl :codes="['appraisal:expert_delete']" type="code">
                <Popconfirm title="确认删除？" ok-text="删除" cancel-text="取消" @confirm="onDelete(record as ExpertItem)">
                  <Button size="small" type="link" danger>删除</Button>
                </Popconfirm>
              </AccessControl>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="open"
      :title="editingId ? '编辑专家' : '新建专家'"
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
        <Button type="primary" @click="onSubmit">确定</Button>
      </div>
    </Modal>
  </Page>
</template>
