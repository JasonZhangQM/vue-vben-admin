/** 基础数据：权证模块 API（主表 / 所有权人 / 出入库 / 评估 / 批量操作）。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface WarrantListItem {
  created_at: string;
  created_by_name: string;
  evaluate_value: null | number;
  id: number;
  warrant_num: string;
  warrant_state: number;
  warrant_type: number;
}

export interface HouseItem {
  house_app: number;
  house_area: number;
  house_build_year?: null | number;
  house_locate: string;
  house_name?: null | string;
  house_usage?: number;
}

export interface OwnerItem {
  id: number;
  owner_id: number;
  owner_name: string;
  ownership_num: string;
  share_ratio: null | number;
}

export interface StorageItem {
  id: number;
  storage_date: string;
  storage_explain: null | string;
  storage_type: number;
}

export interface EvaluateItem {
  evaluate_company: null | string;
  evaluate_date: string;
  evaluate_method: number;
  evaluate_value: number;
  id: number;
  recheck: null | { recheck_channel: string; recheck_value: number };
}

export interface DraftExtendItem {
  acceptor_id: number;
  acceptor_name: string;
  core_id: number;
  core_name: string;
  draft_amount: number;
  draft_num: string;
  due_date: string;
  id: number;
  issue_date: string;
}

export interface WarrantDetail {
  created_at: string;
  created_by_name: string;
  evaluate_method: null | number;
  evaluate_value: null | number;
  evaluates: EvaluateItem[];
  houses: HouseItem[];
  id: number;
  owners: OwnerItem[];
  storages: StorageItem[];
  warrant_num: string;
  warrant_state: number;
  warrant_type: number;
}

export interface WarrantListParams {
  auction_state?: number;
  evaluate_method?: number;
  owner_id?: number;
  page?: number;
  page_size?: number;
  q?: string;
  warrant_state?: number;
  warrant_type?: number;
}

export interface WarrantCreateParams {
  draft?: { denomination: number; draft_detail: string; draft_type: number };
  ground?: { ground_app: string; ground_area: number; ground_locate: string };
  houses?: HouseItem[];
  owners: { owner_id: number; ownership_num: string; share_ratio?: number }[];
  warrant_num: string;
  warrant_type: number;
}

/** 权证列表（data_scope 按 created_by 过滤） */
export function getWarrantList(params: WarrantListParams) {
  return requestClient.get<PageResult<WarrantListItem>>('/warrants', {
    params,
  });
}

/** 权证详情（聚合扩展 / 所有权人 / 出入库 / 评估） */
export function getWarrantDetail(id: number) {
  return requestClient.get<WarrantDetail>(`/warrants/${id}`);
}

/** 创建权证（主表 + 类型扩展 + 所有权人，单事务） */
export function createWarrant(data: WarrantCreateParams) {
  return requestClient.post<{ id: number }>('/warrants', data);
}

/** 修改主表字段（评估 / 状态 / 拍卖） */
export function updateWarrant(id: number, data: object) {
  return requestClient.request(`/warrants/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除权证（拦截：已入库 / 已流转走注销流程） */
export function deleteWarrant(id: number) {
  return requestClient.delete(`/warrants/${id}`);
}

/** 修改所有权人（OwnershipUpdate 自由字段，留空不序列化保持原值） */
export function updateWarrantOwner(
  id: number,
  ownerRowId: number,
  data: { ownership_num?: string; share_ratio?: number },
) {
  return requestClient.request(`/warrants/${id}/owners/${ownerRowId}`, {
    data,
    method: 'PATCH',
  });
}

// ===== 出入库 / 评估 =====

export function addStorage(
  id: number,
  data: { storage_date: string; storage_explain?: string; storage_type: number },
) {
  return requestClient.post(`/warrants/${id}/storages`, data);
}

export function addEvaluate(
  id: number,
  data: {
    evaluate_company?: string;
    evaluate_date: string;
    evaluate_method: number;
    evaluate_value: number;
  },
) {
  return requestClient.post(`/warrants/${id}/evaluates`, data);
}

// ===== 票据明细 =====

export function listDraftExtends(id: number) {
  return requestClient.get<DraftExtendItem[]>(`/warrants/${id}/draft-extends`);
}

export function addDraftExtend(
  id: number,
  data: {
    acceptor_id: number;
    core_id: number;
    draft_amount: number;
    draft_num: string;
    due_date: string;
    issue_date: string;
  },
) {
  return requestClient.post(`/warrants/${id}/draft-extends`, data);
}

// ===== 批量操作 =====

export function batchTransfer(data: { reason: string; to_conservator_id: number; warrant_ids: number[] }) {
  return requestClient.post<{ count: number }>('/warrants/batch/transfer', data);
}

export function batchStorage(data: {
  storage_date: string;
  storage_explain?: string;
  storage_type: number;
  warrant_ids: number[];
}) {
  return requestClient.post<{ count: number }>('/warrants/batch/storage', data);
}

export function batchCancel(data: { reason: string; warrant_ids: number[] }) {
  return requestClient.post<{ count: number }>('/warrants/batch/cancel', data);
}

/** 权证统计概览 */
export function getWarrantOverview() {
  return requestClient.get<{
    total_count: number;
    total_evaluate_value: number;
  }>('/warrants/stats/overview');
}
