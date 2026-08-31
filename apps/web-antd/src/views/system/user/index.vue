<script lang="ts" setup>
import type { UserListItem } from '#/api/system/user';
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
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import SearchSelect from '#/components/SearchSelect/index.vue';
import { useRowHighlight } from '#/composables/useRowHighlight';

import {
  createUser,
  getUserList,
} from '#/api/system/user';
import { getUserStatusDict } from '#/api/system/log';
import { getDeptTree } from '#/api/system/org';
import { getRoleList } from '#/api/system/role';

import DetailDrawer from './detail-drawer.vue';

// ================= 列表状态 =================
const loading = ref(false);
const list = ref<UserListItem[]>([]);
const total = ref(0);
const query = reactive({ page: 1, page_size: 20, q: '', status: undefined as number | undefined });

const statusDict = ref<{ label: string; value: number }[]>([]);
const statusMap = computed(() => new Map(statusDict.value.map((d) => [d.value, d.label])));

async function loadList() {
  loading.value = true;
  try {
    const data = await getUserList(query);
    list.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

/** 重置：清空全部筛选条件并回到第 1 页重新查询 */
function resetQuery() {
  query.q = '';
  query.status = undefined;
  query.page = 1;
  loadList();
}

// 状态 → 标签颜色
function statusColor(status: number) {
  return { 10: 'green', 20: 'red', 30: 'default' }[status] ?? 'default';
}

// ================= 详情 =================
const detailOpen = ref(false);
const detailUserId = ref<null | number>(null);

const { customRow, rowClassName, highlight: highlightRow } = useRowHighlight();

function openDetail(row: any) {
  highlightRow(row); // 打开详情即高亮该行
  detailUserId.value = row.id;
  detailOpen.value = true;
}

// ================= 新建(编辑收纳在详情抽屉) =================
const createVisible = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  username: '',
  name: '',
  email: '',
  phone: '',
  gender: 0,
  dept_id: undefined as number | undefined,
  position: '',
  role_ids: [] as number[],
});

const deptOptions = ref<{ label: string; value: number }[]>([]);
const roleOptions = ref<{ label: string; value: number }[]>([]);

/** 部门树拍平成带缩进的下拉选项 */
function flattenDept(nodes: any[], prefix = ''): { label: string; value: number }[] {
  return nodes.flatMap((n) => [
    { label: prefix + n.name, value: n.id },
    ...flattenDept(n.children ?? [], prefix + '　'),
  ]);
}

async function openCreate() {
  const [depts, roles] = await Promise.all([getDeptTree(), getRoleList()]);
  deptOptions.value = flattenDept(depts);
  roleOptions.value = roles.map((r) => ({ label: r.name, value: r.id }));
  Object.assign(createForm, {
    username: '', name: '', email: '', phone: '', gender: 0,
    dept_id: undefined, position: '', role_ids: [],
  });
  createVisible.value = true;
}

async function submitCreate() {
  if (!createForm.username || !createForm.name || !createForm.email) {
    message.warning('请填写用户名、姓名与邮箱');
    return;
  }
  createLoading.value = true;
  try {
    const { initial_password } = await createUser({
      username: createForm.username,
      name: createForm.name,
      email: createForm.email,
      phone: createForm.phone || undefined,
      gender: createForm.gender,
      dept_id: createForm.dept_id ?? undefined,
      position: createForm.position || undefined,
      role_ids: createForm.role_ids,
    });
    createVisible.value = false;
    Modal.success({
      title: '用户创建成功',
      content: `初始密码：${initial_password}(用户首登将被要求修改)`,
    });
    await loadList();
  } finally {
    createLoading.value = false;
  }
}

// ================= 表格定义 =================
const columns: TableColumnType[] = [
  { title: '用户名', dataIndex: 'username' }, // 详情入口链接列：不加 ellipsis
  { title: '姓名', dataIndex: 'name', ellipsis: true },
  { title: '部门', dataIndex: 'dept_name', ellipsis: true },
  { title: '角色', dataIndex: 'role_names', ellipsis: true },
  { title: '状态', dataIndex: 'status', ellipsis: true },
  { title: '最近登录', dataIndex: 'last_login_at', ellipsis: true },
  { title: '创建人', dataIndex: 'created_by_name', ellipsis: true },
];

onMounted(async () => {
  const [dicts] = await Promise.all([getUserStatusDict()]);
  statusDict.value = dicts;
  await loadList();
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
          placeholder="用户名 / 姓名 / 邮箱"
          style="width: 220px"
          @press-enter="() => { query.page = 1; loadList(); }"
        />
        <SearchSelect
          v-model:value="query.status"
          :options="statusDict"
          allow-clear
          placeholder="状态"
          style="width: 120px"
        />
        <Button type="primary" @click="() => { query.page = 1; loadList(); }">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <div class="flex-1" />
        <AccessControl :codes="['user:create']" type="code">
          <Button type="primary" @click="openCreate">新增用户</Button>
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
          <template v-if="column.dataIndex === 'username'">
            <!-- 用户名列即详情入口 -->
            <a @click="openDetail(record)">{{ record.username }}</a>
          </template>
          <template v-else-if="column.dataIndex === 'dept_name'">
            {{ record.dept_name || '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'role_names'">
            {{ (record.role_names ?? []).join('、') || '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="statusColor(record.status)">
              {{ statusMap.get(record.status) ?? record.status }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'last_login_at'">
            {{ record.last_login_at ?? '—' }}
          </template>
          <template v-else-if="column.dataIndex === 'created_by_name'">
            {{ record.created_by_name || '—' }}
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建用户弹窗 -->
    <Modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      title="新增用户"
      width="560px"
      @ok="submitCreate"
    >
      <Form :label-col="{ span: 5 }" :model="createForm" :wrapper-col="{ span: 17 }">
        <FormItem label="用户名" required>
          <Input v-model:value="createForm.username" />
        </FormItem>
        <FormItem label="姓名" required>
          <Input v-model:value="createForm.name" />
        </FormItem>
        <FormItem label="邮箱" required>
          <Input v-model:value="createForm.email" />
        </FormItem>
        <FormItem label="手机号">
          <Input v-model:value="createForm.phone" />
        </FormItem>
        <FormItem label="性别">
          <SearchSelect
            v-model:value="createForm.gender"
            style="width: 100px"
            :options="[
              { label: '未知', value: 0 },
              { label: '男', value: 1 },
              { label: '女', value: 2 },
            ]"
          />
        </FormItem>
        <FormItem label="部门">
          <SearchSelect
            v-model:value="createForm.dept_id"
            :options="deptOptions"
            allow-clear
            placeholder="选择部门"
          />
        </FormItem>
        <FormItem label="职务">
          <Input v-model:value="createForm.position" />
        </FormItem>
        <FormItem label="角色">
          <SearchSelect
            v-model:value="createForm.role_ids"
            :options="roleOptions"
            mode="multiple"
            placeholder="选择角色(权限取并集)"
          />
        </FormItem>
        <FormItem label="说明">
          <Textarea
            :rows="2"
            disabled
            value="提交后系统生成初始密码，用户首次登录强制修改。"
          />
        </FormItem>
      </Form>
    </Modal>

    <!-- 用户详情抽屉 -->
    <DetailDrawer v-model:open="detailOpen" :user-id="detailUserId" @updated="loadList" />
  </Page>
</template>

