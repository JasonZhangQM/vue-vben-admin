<script lang="ts" setup>
/** 客户详情抽屉：基本信息 / 企业扩展 / 股东 / 董事 / 核心企业额度。 */

import type { CustomerDetail } from '#/api/basic/customer';

import { reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Drawer,
  Descriptions,
  DescriptionsItem,
  message,
  Input,
  InputNumber,
  Popconfirm,
  Table,
  Tabs,
  TabPane,
  Tag,
} from 'ant-design-vue';

import {
  addCoreLimit,
  addDirector,
  addShareholder,
  deleteDirector,
  deleteShareholder,
  getCustomerDetail,
} from '#/api/basic/customer';

const props = defineProps<{ customerId: null | number }>();
const emit = defineEmits<{ updated: [] }>();

const open = defineModel<boolean>('open', { default: false });
const detail = ref<null | CustomerDetail>(null);
const loading = ref(false);

const classificationColor = (c: number) =>
  ({ 10: 'green', 20: 'blue', 30: 'orange', 40: 'red', 50: 'red' })[c] ?? 'default';

async function load() {
  if (!props.customerId) return;
  loading.value = true;
  try {
    detail.value = await getCustomerDetail(props.customerId);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [open.value, props.customerId],
  ([visible]) => {
    if (visible) load();
  },
);

// ===== 股东 / 董事快速添加 =====
const shareholderForm = reactive({
  shareholder_name: '',
  invested_amount: 0,
  shareholding_ratio: 0,
});
const directorName = ref('');

async function submitShareholder() {
  if (!detail.value || !shareholderForm.shareholder_name) return;
  await addShareholder(detail.value.id, { ...shareholderForm });
  Object.assign(shareholderForm, { shareholder_name: '', invested_amount: 0, shareholding_ratio: 0 });
  message.success('股东已添加');
  await load();
  emit('updated');
}

async function submitDirector() {
  if (!detail.value || !directorName.value) return;
  await addDirector(detail.value.id, directorName.value);
  directorName.value = '';
  message.success('董事已添加');
  await load();
}

// ===== 核心企业额度 =====
const limitForm = reactive({
  credit_amount: 0,
  valid_begin_date: '',
  valid_end_date: '',
});

async function submitLimit() {
  if (!detail.value || !limitForm.credit_amount || !limitForm.valid_begin_date || !limitForm.valid_end_date) {
    message.warning('请填写额度与有效期');
    return;
  }
  await addCoreLimit(detail.value.id, { ...limitForm });
  Object.assign(limitForm, { credit_amount: 0, valid_begin_date: '', valid_end_date: '' });
  message.success('额度已创建（旧额度自动失效）');
  await load();
}
</script>

<template>
  <Drawer v-model:open="open" :title="detail?.name ?? '客户详情'" width="760">
    <div v-if="detail" class="space-y-4">
      <!-- 待审批横幅 -->
      <Alert
        v-if="detail.pending_requests?.length"
        :message="`存在 ${detail.pending_requests.length} 条待审批变更`"
        type="warning"
        show-icon
      >
        <template #description>
          <div v-for="r in detail.pending_requests" :key="r.id">{{ r.summary }}</div>
        </template>
      </Alert>

      <Card size="small" title="基本信息">
        <Descriptions :column="2" size="small">
          <DescriptionsItem label="客户名称">{{ detail.name }}</DescriptionsItem>
          <DescriptionsItem label="简称">{{ detail.short_name }}</DescriptionsItem>
          <DescriptionsItem label="类型">{{ detail.genre === 1 ? '企业' : '个人' }}</DescriptionsItem>
          <DescriptionsItem label="五级分类">
            <Tag :color="classificationColor(detail.classification)">
              {{ detail.classification_display }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="管护经理">{{ detail.managementor_name }}</DescriptionsItem>
          <DescriptionsItem label="风控专员">{{ detail.controler_name }}</DescriptionsItem>
          <DescriptionsItem label="授信额度">{{ detail.credit_amount.toLocaleString() }}</DescriptionsItem>
          <DescriptionsItem label="在保余额">{{ detail.amount.toLocaleString() }}</DescriptionsItem>
          <DescriptionsItem label="所属集团">{{ detail.group_name || '—' }}</DescriptionsItem>
          <DescriptionsItem label="授信区域">{{ detail.credit_region_name || '—' }}</DescriptionsItem>
          <DescriptionsItem v-if="detail.is_core" label="核心企业">
            <Tag color="purple">是</Tag>
          </DescriptionsItem>
          <DescriptionsItem v-if="detail.is_acceptor" label="承兑人">
            <Tag color="cyan">是</Tag>
          </DescriptionsItem>
        </Descriptions>
      </Card>

      <Tabs>
        <!-- 企业扩展 -->
        <TabPane v-if="detail.company" key="company" tab="企业信息">
          <Descriptions :column="2" size="small">
            <DescriptionsItem label="统一社会信用代码">{{ detail.company.credit_code }}</DescriptionsItem>
            <DescriptionsItem label="法定代表人">{{ detail.company.representative }}</DescriptionsItem>
            <DescriptionsItem label="注册资本">{{ detail.company.capital?.toLocaleString() }}</DescriptionsItem>
            <DescriptionsItem label="实收资本">{{ detail.company.paid_capital?.toLocaleString() }}</DescriptionsItem>
            <DescriptionsItem label="注册地址" :span="2">{{ detail.company.registered_addr }}</DescriptionsItem>
          </Descriptions>
          <div v-if="detail.latest_extend" class="mt-3">
            <Card size="small" title="最新经营快照">
              <Descriptions :column="3" size="small">
                <DescriptionsItem label="营业收入">{{ detail.latest_extend.sales_revenue.toLocaleString() }}</DescriptionsItem>
                <DescriptionsItem label="总资产">{{ detail.latest_extend.total_assets.toLocaleString() }}</DescriptionsItem>
                <DescriptionsItem label="从业人数">{{ detail.latest_extend.people_engaged }}</DescriptionsItem>
              </Descriptions>
            </Card>
          </div>
        </TabPane>

        <!-- 个人扩展 -->
        <TabPane v-if="detail.personal" key="personal" tab="个人信息">
          <Descriptions :column="2" size="small">
            <DescriptionsItem label="证件号码">{{ detail.personal.license_num }}</DescriptionsItem>
            <DescriptionsItem label="户籍地址">{{ detail.personal.license_addr }}</DescriptionsItem>
          </Descriptions>
        </TabPane>

        <!-- 股东 -->
        <TabPane v-if="detail.genre === 1" key="shareholders" :tab="`股东（${detail.shareholder_count}）`">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <Input v-model:value="shareholderForm.shareholder_name" placeholder="股东名称" style="width: 140px" />
            <InputNumber v-model:value="shareholderForm.invested_amount" placeholder="投资额" style="width: 120px" />
            <InputNumber v-model:value="shareholderForm.shareholding_ratio" placeholder="持股% (≤100)" style="width: 120px" />
            <Button size="small" type="primary" @click="submitShareholder">添加</Button>
          </div>
          <Table
            :columns="[
              { title: '股东名称', dataIndex: 'shareholder_name' },
              { title: '投资额', dataIndex: 'invested_amount' },
              { title: '持股比例(%)', dataIndex: 'shareholding_ratio' },
              { title: '操作', key: 'op', width: 70 },
            ]"
            :data-source="(detail as any).shareholders ?? []"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'op'">
                <Popconfirm @confirm="async () => {
                  await deleteShareholder(detail!.id, record.id);
                  await load();
                  emit('updated');
                }">
                  <Button danger size="small" type="link">删除</Button>
                </Popconfirm>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 董事 -->
        <TabPane v-if="detail.genre === 1" key="directors" :tab="`董事（${detail.director_count}）`">
          <div class="mb-2 flex items-center gap-2">
            <Input v-model:value="directorName" placeholder="董事姓名" style="width: 160px" />
            <Button size="small" type="primary" @click="submitDirector">添加</Button>
          </div>
          <Table
            :columns="[
              { title: '姓名', dataIndex: 'director_name' },
              { title: '操作', key: 'op', width: 70 },
            ]"
            :data-source="(detail as any).directors ?? []"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'op'">
                <Popconfirm @confirm="async () => {
                  await deleteDirector(detail!.id, record.id);
                  await load();
                }">
                  <Button danger size="small" type="link">删除</Button>
                </Popconfirm>
              </template>
            </template>
          </Table>
        </TabPane>

        <!-- 核心企业额度 -->
        <TabPane v-if="detail.is_core" key="core-limits" tab="核心企业额度">
          <div v-if="detail.core_info" class="mb-3">
            <Descriptions :column="3" size="small">
              <DescriptionsItem label="核心占比">{{ detail.core_info.core_rate ?? '—' }}%</DescriptionsItem>
              <DescriptionsItem label="累计已用">{{ detail.core_info.total_used_amount.toLocaleString() }}</DescriptionsItem>
            </Descriptions>
          </div>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <InputNumber v-model:value="limitForm.credit_amount" placeholder="额度" style="width: 130px" />
            <Input v-model:value="limitForm.valid_begin_date" placeholder="生效日 2026-01-01" style="width: 140px" />
            <Input v-model:value="limitForm.valid_end_date" placeholder="到期日 2027-12-31" style="width: 140px" />
            <Button size="small" type="primary" @click="submitLimit">新增额度</Button>
          </div>
          <Table
            :columns="[
              { title: '额度', dataIndex: 'credit_amount' },
              { title: '已用', dataIndex: 'used_amount' },
              { title: '剩余', dataIndex: 'remaining_amount' },
              { title: '有效期', key: 'valid' },
              { title: '状态', dataIndex: 'status' },
            ]"
            :data-source="(detail as any).core_limits ?? []"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'valid'">
                {{ record.valid_begin_date }} ~ {{ record.valid_end_date }}
              </template>
              <template v-else-if="column.dataIndex === 'status'">
                <Tag :color="record.status === 10 ? 'green' : 'default'">
                  {{ record.status === 10 ? '生效' : '失效' }}
                </Tag>
              </template>
            </template>
          </Table>
        </TabPane>
      </Tabs>
    </div>
  </Drawer>
</template>
