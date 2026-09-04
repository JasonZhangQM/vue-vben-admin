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
import { getExpertCategoriesDict } from '#/api/basic/dict';

const list = ref<ExpertItem[]>([]);
const loading = ref(false);
const categoryOpts = ref<{ label: string; value: number }[]>([]);

const open = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  name: '',
  category_id: undefined as number | undefined,
  org_name: '',
  title: '',
  contact_numb: '',
  email: '',
  expert_type: 20, // 默认外部专家
});

onMounted(async () => {
  const cats = await getExpertCategoriesDict();
  categoryOpts.value = cats.map((c) => ({ label: c.name, value: c.id }));
  await loadList();
});

async function loadList() {
  loading.value = true;
  try { list.value = await getExpertList(); }
  finally { loading.value = false; }
}

async function onSubmit() {
  if (!form.name) { message.warning('姓名必填'); return; }
  if (editingId.value) {
    await updateExpert(editingId.value, form);
    message.success('修改成功');
  } else {
    await createExpert(form);
    message.success('新增成功');
  }
  open.value = false;
  await loadList();
}

function onAdd() {
  editingId.value = null;
  Object.assign(form, { name: '', category_id: undefined, org_name: '', title: '', contact_numb: '', email: '', expert_type: 20 });
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
  { title: '类别', dataIndex: 'category_name', width: 120 },
  { title: '单位', dataIndex: 'org_name' },
  { title: '职称', dataIndex: 'title', width: 120 },
  { title: '电话', dataIndex: 'contact_numb', width: 140 },
  { title: '邮箱', dataIndex: 'email', width: 180 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
]);
</script>

<template>
  <Page>
    <Card size="small">
      <template #extra>
        <AccessControl :codes="['appraisal:expert_create']" type="code">
          <Button type="primary" @click="onAdd">新增专家</Button>
        </AccessControl>
      </template>
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
      :title="editingId ? '编辑专家' : '新增专家'"
      :footer="null"
      :width="560"
      destroy-on-close
    >
      <Form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }" :model="form" class="grid grid-cols-2 gap-x-4">
        <FormItem label="姓名" required>
          <Input v-model:value="form.name" placeholder="专家姓名" />
        </FormItem>
        <FormItem label="类别">
          <Select
            v-model:value="form.category_id"
            :options="categoryOpts"
            placeholder="选择"
            allow-clear
            style="width: 100%"
          />
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
      </Form>
      <div class="flex justify-end gap-2 mt-4">
        <Button @click="open = false">取消</Button>
        <Button type="primary" @click="onSubmit">确定</Button>
      </div>
    </Modal>
  </Page>
</template>
