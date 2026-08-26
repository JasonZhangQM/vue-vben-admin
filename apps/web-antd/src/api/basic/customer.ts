/** 基础数据：客户模块 API（审批三场景 / 子资源 / 核心额度 / 统计）。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface CustomerListItem {
  amount: number;
  classification: number;
  controler_name: string;
  credit_amount: number;
  credit_region_id: null | number;
  credit_region_name: null | string;
  custom_state: number;
  custom_typ: number;
  day_space: number;
  genre: number;
  group_id: null | number;
  group_name: null | string;
  id: number;
  is_acceptor: boolean;
  is_core: boolean;
  managementor_name: string;
  name: string;
  region_name: null | string;
  short_name: string;
}

export interface CustomerDetail extends CustomerListItem {
  classification_display: string;
  company: null | Record<string, any>;
  core_info: null | {
    core_rate: null | number;
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
  pending_requests: null | { id: number; summary: string }[];
  personal: null | Record<string, any>;
  shareholder_count: number;
  tags: null | number[];
  entrusted_loan: number;
}

export interface CustomerCreateParams {
  company?: {
    capital?: number;
    credit_code: string;
    custom_nature: number;
    decisionor: number;
    industry_c: number;
    paid_capital?: number;
    registered_addr: string;
    representative: string;
  };
  contact_addr: string;
  contact_num: string;
  controler_id: number;
  core_rate?: number;
  credit_region_id?: number;
  genre: number;
  group_id?: number;
  industry_id: number;
  is_acceptor?: boolean;
  is_core?: boolean;
  linkman: string;
  managementor_id: number;
  name: string;
  personal?: {
    household_nature: number;
    license_addr: string;
    license_num: string;
    marital_status: number;
  };
  region_id: number;
  short_name: string;
}

export interface CustomerListParams {
  classification?: number;
  genre?: number;
  is_acceptor?: boolean;
  is_core?: boolean;
  page?: number;
  page_size?: number;
  q?: string;
}

/** 客户列表（data_scope 过滤） */
export function getCustomerList(params: CustomerListParams) {
  return requestClient.get<PageResult<CustomerListItem>>('/customers', {
    params,
  });
}

/** 客户详情 */
export function getCustomerDetail(id: number) {
  return requestClient.get<CustomerDetail>(`/customers/${id}`);
}

/** 添加客户（发起 customer_create 审批，通过后落库） */
export function createCustomer(data: CustomerCreateParams) {
  return requestClient.post<{ instance_id: number }>('/customers', data);
}

/** 修改自由字段（免审批） */
export function updateCustomer(id: number, data: object) {
  return requestClient.request(`/customers/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除客户（逻辑注销） */
export function deleteCustomer(id: number) {
  return requestClient.delete(`/customers/${id}`);
}

/** 提交敏感字段修改申请（customer_update 审批，diff 应用） */
export function submitChangeRequest(id: number, values: object) {
  return requestClient.post<{ instance_id: number }>(
    `/customers/${id}/change-requests`,
    { values },
  );
}

/** 批量管护移交申请（customer_transfer 审批） */
export function submitTransfer(data: {
  customer_ids: number[];
  reason: string;
  to_managementor_id: number;
}) {
  return requestClient.post<{ instance_id: number }>(
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

/** 经营快照（同日覆盖） */
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

/** 集团树（新建客户表单 / 筛选用） */
export function getGroupTree() {
  return requestClient.get<
    { children: unknown[]; code: string; id: number; name: string }[]
  >('/customer-groups');
}

// ===== 统计 =====

export function getCustomerOverview() {
  return requestClient.get<{
    active_count: number;
    classification_distribution: Record<string, number>;
    core_count: number;
    total_amount: number;
    total_count: number;
    total_credit_amount: number;
  }>('/customers/stats/overview');
}
