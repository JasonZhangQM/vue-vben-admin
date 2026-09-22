<script lang="ts" setup>
/** 评委详情抽屉：查看 + 内嵌编辑 Modal + 删除。 */
import type { ExpertItem } from '#/api/basic/appraisal';

import { computed, reactive, ref, watch } from 'vue';

import { AccessControl } from '@vben/access';
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
  Select,
  Space,
  Spin,
  Switch,
  Tag,
} from 'ant-design-vue';

import { deleteExpert, getExpert, toggleExpertStatus, updateExpert } from '#/api/basic/appraisal';
import { useDetailColumns } from '#/composables/useDetailColumns';
import { dash } from '#/utils/format';

const props = defineProps<{ expertId: null | number }>();

const open = defineModel<boolean>('open', { default: false });

const emit = defineEmits<{
  saved: [id: number];
  deleted: [id: number];
}>();

// ========== 详情 ==========
const detail = ref<null | ExpertItem>(null);
const loading = ref(false);
const { columns: detailColumns } = useDetailColumns();

async function loadExpert() {
  if (!props.expertId) return;
  loading.value = true;
  try {
    detail.value = await getExpert(props.expertId);
  } finally {
    loading.value = false;
  }
}

// ========== 编辑 Modal ==========
const editVisible = ref(false);
const editLoading = ref(false);
const editForm = reactive({
  name: '',
  org_name: '',
  title: '',
  expert_type: 20,
  contact_numb: '',
  email: '',
  remark: '',
});

const expertTypeOpts = [
  { label: '内部专家', value: 10 },
  { label: '外部专家', value: 20 },
];

function startEdit() {
  if (!detail.value) return;
  Object.assign(editForm, {
    name: detail.value.name,
    org_name: detail.value.org_name ?? '',
    title: detail.value.title ?? '',
    expert_type: detail.value.expert_type,
    contact_numb: detail.value.contact_numb ?? '',
    email: detail.value.email ?? '',
    remark: detail.value.remark ?? '',
  });
  editVisible.value = true;
}

async function saveEdit() {
  if (!props.expertId) return;
  if (!editForm.name) { message.warning('姓名必填'); return; }
  editLoading.value = true;
  try {
    await updateExpert(props.expertId, editForm);
    message.success('保存成功');
    editVisible.value = false;
    await loadExpert();
    emit('saved', props.expertId);
  } catch {
    // requestClient 已 toast
  } finally {
    editLoading.value = false;
  }
}

async function onToggleStatus(checked: boolean) {
  if (!props.expertId) return;
  await toggleExpertStatus(props.expertId);
  message.success(checked ? '已启用' : '已停用');
  await loadExpert();
  emit('saved', props.expertId);
}

function deleteItem() {
  if (!props.expertId || !detail.value) return;
  const deletedId = props.expertId;
  Modal.confirm({
    title: `确认删除评委 ${detail.value.name}？`,
    content: '删除后不可恢复（已有评审意见引用时将停用）',
    async onOk() {
      await deleteExpert(deletedId);
      message.success('已删除');
      open.value = false;
      emit('deleted', deletedId);
    },
  });
}

// ========== 状态 Tag ==========
function statusTag(status?: boolean) {
  return status
    ? { text: '启用', color: 'success' as const }
    : { text: '停用', color: 'default' as const };
}

// ========== 打开抽屉生命周期 ==========
watch(
  () => open.value,
  (val) => {
    if (val) {
      loadExpert();
    } else {
      detail.value = null;
      editVisible.value = false;
    }
  },
);
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="detail ? detail.name : '评委详情'"
    width="66%"
    :destroyOnClose="true"
  >
    <Spin :spinning="loading">
      <template v-if="detail">
        <Card size="small" title="基本信息">
          <template #extra>
            <Space :size="8">
              <AccessControl :codes="['appraisal:expert_update']" type="code">
                <Button size="small" type="primary" @click="startEdit">修改</Button>
              </AccessControl>
              <AccessControl :codes="['appraisal:expert_update']" type="code">
                <Switch
                  :checked="detail.status"
                  checked-children="启用"
                  un-checked-children="停用"
                  @change="(checked: boolean) => onToggleStatus(checked)"
                />
              </AccessControl>
              <AccessControl :codes="['appraisal:expert_delete']" type="code">
                <Button size="small" danger @click="deleteItem">删除</Button>
              </AccessControl>
            </Space>
          </template>

          <Descriptions :column="detailColumns" size="small">
            <DescriptionsItem label="姓名">{{ detail.name }}</DescriptionsItem>
            <DescriptionsItem label="类型">{{ dash(detail.expert_type_display) }}</DescriptionsItem>
            <DescriptionsItem label="单位">{{ dash(detail.org_name) }}</DescriptionsItem>
            <DescriptionsItem label="职称">{{ dash(detail.title) }}</DescriptionsItem>
            <DescriptionsItem label="电话">{{ dash(detail.contact_numb) }}</DescriptionsItem>
            <DescriptionsItem label="邮箱">{{ dash(detail.email) }}</DescriptionsItem>
            <DescriptionsItem label="状态">
              <Tag :color="statusTag(detail.status).color" size="small">
                {{ statusTag(detail.status).text }}
              </Tag>
            </DescriptionsItem>
            <DescriptionsItem label="备注">{{ dash(detail.remark) }}</DescriptionsItem>
            <DescriptionsItem label="登记人">{{ dash(detail.created_by_name) }}</DescriptionsItem>
            <DescriptionsItem label="登记时间">{{ dash(detail.created_at) }}</DescriptionsItem>
          </Descriptions>
        </Card>
      </template>
    </Spin>

    <!-- ===== 编辑 Modal ===== -->
    <Modal
      v-model:open="editVisible"
      title="编辑评委"
      :confirm-loading="editLoading"
      :footer="null"
      :width="520"
      destroy-on-close
    >
      <Form
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 18 }"
        :model="editForm"
        class="grid gap-y-2"
      >
        <FormItem label="姓名" required>
          <Input v-model:value="editForm.name" placeholder="专家姓名" />
        </FormItem>
        <FormItem label="类型" required>
          <Select v-model:value="editForm.expert_type" :options="expertTypeOpts" style="width: 100%" />
        </FormItem>
        <FormItem label="单位">
          <Input v-model:value="editForm.org_name" placeholder="工作单位" />
        </FormItem>
        <FormItem label="职称">
          <Input v-model:value="editForm.title" placeholder="高级工程师 / 教授 ..." />
        </FormItem>
        <FormItem label="电话">
          <Input v-model:value="editForm.contact_numb" placeholder="联系电话" />
        </FormItem>
        <FormItem label="邮箱">
          <Input v-model:value="editForm.email" placeholder="邮箱" />
        </FormItem>
        <FormItem label="备注">
          <Input v-model:value="editForm.remark" placeholder="备注" />
        </FormItem>
      </Form>
      <div class="flex justify-end gap-2 mt-4">
        <Button @click="editVisible = false">取消</Button>
        <Button type="primary" :loading="editLoading" @click="saveEdit">确定</Button>
      </div>
    </Modal>
  </Drawer>
</template>
