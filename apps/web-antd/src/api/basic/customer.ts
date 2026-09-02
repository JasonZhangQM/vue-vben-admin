/** 基础数据：客户模块 API(创建/修改直接生效，无审批；子资源/核心额度/统计)。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface CustomerListItem {
  amount: number;
  classification: number;
  controler_name: string;
  credit_amount: number;
  credit_region_id: null | number;
  credit_region_name: null | string;
  day_space: number;
  genre: number;
  group_id: null | number;
  group_name: null | string;
  id: number;
  managementor_name: string;
  name: string;
  region_name: null | string;
  short_name: string;
  created_by_name: string;
}

export interface CustomerContact {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  addr: string | null;
  is_primary: boolean;
  remark: string | null;
  created_by_name: string;
}

export interface CustomerContactCreate {
  name: string;
  phone: string;
  email?: string;
  addr?: string;
  is_primary?: boolean;
  remark?: string;
}

export interface CustomerDetail extends CustomerListItem {
  classification_display: string;
  license_num: null | string;
  license_addr: null | string;
  company: null | Record<string, any>;
  core_info: null | {
    current_limit: null | {
      credit_amount: number;
      id: number;
      remaining_amount: number;
      status: number;
      used_amount: number;
      valid_begin_date: string;
      valid_end_date: string;
    };
    total_used_amount: number;
  };
  custom_accept: number;
  custom_back: number;
  custom_flow: number;
  director_count: number;
  extend_count: number;
  group: null | Record<string, any>;
  latest_extend: null | {
    data_date: string;
    id: number;
    people_engaged: number;
    sales_revenue: number;
    total_assets: number;
    typing: number;
  };
  personal: null | Record<string, any>;
  shareholder_count: number;
  tags: null | number[];
  entrusted_loan: number;
  // ---- 以下与后端 get_detail 实际响应逐字段对齐 ----
  contacts: CustomerContact[];
  industry_name: null | string;
  last_provide_date: null | string;
  last_review_date: null | string;
  last_synced_at: null | string;
  g_radio: number;
  v_radio: number;
  pending_requests: null | Record<string, any>[];
  created_at: string;
}

export interface CustomerCreateParams {
  company?: {
    capital?: number;
    custom_nature?: number;
    decisionor?: number;
    industry_c?: number;
    paid_capital?: number;
    representative?: string;
    typing?: number;
  };
  contacts?: CustomerContactCreate[];
  credit_region_id?: number;
  genre: number;
  group_id?: number;
  industry_id?: number;
  license_num?: string;
  license_addr?: string;
  managementor_id: number;
  name: string;
  personal?: {
    household_nature?: number;
    marital_status?: number;
    spouse_id?: number;
  };
  region_id?: number;
  short_name: string;
}

export interface CustomerListParams {
  classification?: number;
  genre?: number;
  page?: number;
  page_size?: number;
  q?: string;
}

/** 客户列表(data_scope 过滤) */
export function getCustomerList(params: CustomerListParams) {
  return requestClient.get<PageResult<CustomerListItem>>('/customers', {
    params,
  });
}

/** 客户详情 */
export function getCustomerDetail(id: number) {
  return requestClient.get<CustomerDetail>(`/customers/${id}`);
}

/** 添加客户(直接落库) */
export function createCustomer(data: CustomerCreateParams) {
  return requestClient.post<{ id: number }>('/customers', data);
}

/** 修改客户(所有字段直接生效) */
export function updateCustomer(id: number, data: object) {
  return requestClient.request(`/customers/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 批量管护移交(直接生效，≤200 个客户) */
export function batchTransfer(data: {
  customer_ids: number[];
  reason: string;
  to_managementor_id: number;
}) {
  return requestClient.post<{ count: number }>(
    '/customers/transfer-requests',
    data,
  );
}

// ===== 子资源 =====

export function listShareholders(id: number) {
  return requestClient.get<
    { id: number; invested_amount: number; shareholder_name: string; shareholding_ratio: number }[]
  >(`/customers/${id}/shareholders`);
}

export function addShareholder(
  id: number,
  data: { invested_amount: number; shareholder_name: string; shareholding_ratio: number },
) {
  return requestClient.post(`/customers/${id}/shareholders`, data);
}

export function deleteShareholder(id: number, shareholderId: number) {
  return requestClient.delete(`/customers/${id}/shareholders/${shareholderId}`);
}

export function listDirectors(id: number) {
  return requestClient.get<{ director_name: string; id: number }[]>(
    `/customers/${id}/directors`,
  );
}

export function addDirector(id: number, directorName: string) {
  return requestClient.post(`/customers/${id}/directors`, {
    director_name: directorName,
  });
}

export function deleteDirector(id: number, directorId: number) {
  return requestClient.delete(`/customers/${id}/directors/${directorId}`);
}

// ===== 联系人(CustomerContact) =====

export function listCustomerContacts(id: number) {
  return requestClient.get<CustomerContact[]>(`/customers/${id}/contacts`);
}

export function addCustomerContact(id: number, data: CustomerContactCreate) {
  return requestClient.post<{ id: number }>(`/customers/${id}/contacts`, data);
}

export function updateCustomerContact(
  id: number,
  contactId: number,
  data: Partial<CustomerContactCreate>,
) {
  return requestClient.request(`/customers/${id}/contacts/${contactId}`, {
    data,
    method: 'PATCH',
  });
}

export function deleteCustomerContact(id: number, contactId: number) {
  return requestClient.delete(`/customers/${id}/contacts/${contactId}`);
}

/** 经营快照 */
export interface ExtendItem {
  created_by_name: string;
  data_date: string;
  id: number;
  people_engaged: number | null;
  sales_revenue: number | null;
  total_assets: number | null;
  typing: number;
}

export function listExtends(id: number) {
  return requestClient.get<ExtendItem[]>(`/customers/${id}/extends`);
}

export function addExtend(
  id: number,
  data: {
    data_date: string;
    people_engaged: number;
    sales_revenue: number;
    total_assets: number;
  },
) {
  return requestClient.post(`/customers/${id}/extends`, data);
}

export function deleteExtend(id: number, extendId: number) {
  return requestClient.delete(`/customers/${id}/extends/${extendId}`);
}

/** 五级分类调整 */
export function changeClassification(id: number, classification: number, reason: string) {
  return requestClient.post(`/customers/${id}/classification`, {
    classification,
    reason,
  });
}

/** 更新标签 */
export function updateCustomerTags(id: number, tags: number[]) {
  return requestClient.request(`/customers/${id}/tags`, {
    data: { tags },
    method: 'PATCH',
  });
}

// ===== 核心企业额度 =====

export function listCoreLimits(id: number) {
  return requestClient.get<
    {
      credit_amount: number;
      id: number;
      remaining_amount: number;
      status: number;
      used_amount: number;
      valid_begin_date: string;
      valid_end_date: string;
    }[]
  >(`/customers/${id}/core-limits`);
}

export function addCoreLimit(
  id: number,
  data: {
    credit_amount: number;
    remark?: string;
    valid_begin_date: string;
    valid_end_date: string;
  },
) {
  return requestClient.post(`/customers/${id}/core-limits`, data);
}

// ===== 集团 =====

/** 集团树节点(成员数/在保汇均为合并口径：本集团 + 全部子集团) */
export interface GroupTreeNode {
  children: GroupTreeNode[];
  code: string;
  credit_amount: number;
  id: number;
  member_count: number;
  name: string;
  parent_customer_id: null | number;
  parent_customer_name: null | string;
  parent_id: null | number;
  total_insure_amount: number;
  created_by_name: string;
}

export interface GroupMemberItem {
  amount: number;
  classification: number;
  credit_amount: number;
  genre: number;
  id: number;
  managementor_name: string;
  name: string;
  short_name: string;
}

export interface GroupDetail extends GroupTreeNode {
  created_at: string;
  created_by_name: string;
  description: null | string;
  members: GroupMemberItem[];
}

export interface GroupCreateParams {
  code: string;
  credit_amount?: number;
  description?: string;
  name: string;
  parent_customer_id: number;
  parent_id?: number;
}

/** GroupUpdate：name/credit_amount/description 全字段提交，parent 两项可空表示不修改 */
export interface GroupUpdateParams {
  credit_amount: number;
  description?: string;
  name: string;
  parent_customer_id?: number;
  parent_id?: number;
}

/** 集团树(集团管理列表 / 新建客户表单 / 筛选用) */
export function getGroupTree() {
  return requestClient.get<GroupTreeNode[]>('/customer-groups');
}

/** 新建集团(必须指定母公司，母公司自动加入成员) */
export function createGroup(data: GroupCreateParams) {
  return requestClient.post<{ id: number }>('/customer-groups', data);
}

/** 集团详情(基本信息 + 直接成员 Top20 + 合并汇总) */
export function getGroupDetail(id: number) {
  return requestClient.get<GroupDetail>(`/customer-groups/${id}`);
}

/** 修改集团(可换父集团/换母公司，后端拦截成环与停用冲突) */
export function updateGroup(id: number, data: GroupUpdateParams) {
  return requestClient.request(`/customer-groups/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除集团(拦截：仍有成员或子集团) */
export function deleteGroup(id: number) {
  return requestClient.delete(`/customer-groups/${id}`);
}

/** 集团成员分页列表(直接成员，不含子集团) */
export function listGroupMembers(id: number, params: { page: number; page_size: number }) {
  return requestClient.get<PageResult<GroupMemberItem>>(
    `/customer-groups/${id}/members`,
    { params },
  );
}

/** 批量加入成员企业(拦截：非企业客户/已属其他集团) */
export function addGroupMembers(id: number, customerIds: number[]) {
  return requestClient.post<{ added: number }>(`/customer-groups/${id}/members`, {
    customer_ids: customerIds,
  });
}

/** 移除成员企业(母公司不可移除，后端拦截) */
export function removeGroupMember(id: number, customerId: number) {
  return requestClient.delete(`/customer-groups/${id}/members/${customerId}`);
}

// ===== 个人扩展 =====

/** 更新个人扩展信息（婚姻状态/户籍性质/配偶，三个字段一起编辑） */
export function updatePersonalProfile(
  customerId: number,
  data: {
    marital_status?: number;
    household_nature?: number;
    spouse_id?: number | null;
  },
) {
  return requestClient.request(`/customers/${customerId}/personal`, {
    data,
    method: 'PATCH',
  });
}

// ===== 统计 =====

export function getCustomerOverview() {
  return requestClient.get<{
    classification_distribution: Record<string, number>;
    total_amount: number;
    total_count: number;
    total_credit_amount: number;
  }>('/customers/stats/overview');
}

// ===== 标签(ExtraTag) =====

export interface ExtraTag {
  id: number;
  name: string;
  type: number;       // 10 行业标签 / 20 业务标签
  in_use: boolean;    // 是否已被客户引用
  created_by_name: string;
}

/** 标签类型枚举(与后端 customer 模型对齐) */
export const TAG_TYPE_OPTIONS = [
  { label: '行业标签', value: 10 },
  { label: '业务标签', value: 20 },
];

export function getTagList() {
  return requestClient.get<ExtraTag[]>('/dicts/tags');
}

/** 标签下的客户(详情抽屉 Tab 用) */
export interface TagCustomer {
  id: number;
  name: string;
  short_name: string;
  genre: number;            // 1 企业 / 2 个人
  classification: number;   // 五级分类
  managementor_name: string;
}

export function getTagCustomers(tagId: number) {
  return requestClient.get<TagCustomer[]>(`/dicts/tags/${tagId}/customers`);
}

/** 移除 标签↔客户 关联(标签详情抽屉操作列) */
export function removeTagCustomer(tagId: number, customerId: number) {
  return requestClient.delete(`/dicts/tags/${tagId}/customers/${customerId}`);
}

export function createTag(data: { name: string; type: number }) {
  return requestClient.post<{ id: number }>('/dicts/tags', data);
}

export function updateTag(tagId: number, data: { name?: string; type?: number }) {
  return requestClient.put(`/dicts/tags/${tagId}`, data);
}

export function deleteTag(tagId: number) {
  return requestClient.delete(`/dicts/tags/${tagId}`);
}
