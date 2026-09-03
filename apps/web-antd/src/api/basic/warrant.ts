/** 基础数据：权证模块 API(主表 / 所有权人 / 出入库 / 评估 / 批量操作)。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface WarrantListItem {
  created_at: string;
  created_by_name: string;
  id: number;
  owner_names?: string[];
  storage_latest?: null | {
    id: number;
    storage_type: number;
    storage_type_display: string;
    storage_explain: null | string;
    storage_date: string;
  };
  warrant_num: string;
  warrant_state: number;
  warrant_state_display?: string;
  warrant_type: number;
  warrant_type_display?: string;
}

export interface HouseItem {
  house_app: number;
  house_area: number;
  house_build_year?: null | number;
  house_locate: string;
  house_name?: null | string;
  house_usage?: number;
  id?: number;
  region_id: number;
  region_name?: null | string;
}

export interface GroundItem {
  ground_app?: null | string;
  ground_area: number;
  ground_locate: string;
  id?: number;
  region_id: number;
  region_name?: null | string;
}

export interface ConstructionItem {
  construct_app: string;
  construct_area: number;
  construct_locate: string;
  id?: number;
  region_id: number;
  region_name?: null | string;
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
  draft_type: number;
  draft_type_display: string;
  draft_state: number;
  draft_state_display: string;
  due_date: string;
  id: number;
  issue_date: string;
}

export interface WarrantDetail {
  chattel?: null | { chattel_type: number; chattel_type_display: string; chattel_detail: string };
  constructions?: ConstructionItem[];
  created_at: string;
  created_by_name: string;
  draft_extends?: DraftExtendItem[];
  evaluates: EvaluateItem[];
  grounds?: GroundItem[];
  houses: HouseItem[];
  id: number;
  other?: null | { other_type: number; other_type_display: string; cost: number; other_detail: string; patent?: any; software?: any };
  owners: OwnerItem[];
  owner_names?: string[];
  receive_units?: { id: number; receive_unit: string }[];
  remark?: null | string;
  stock?: null | { stock_type: number; stock_type_display: string; target: string; ratio: number; registered_capital: number; paid_capital: number; remark?: null | string };
  storages: StorageItem[];
  vehicle?: null | { frame_num: string; plate_num: string; vehicle_brand: string; remark?: null | string };
  warrant_num: string;
  warrant_state: number;
  warrant_state_display?: string;
  warrant_type: number;
  warrant_type_display?: string;
}

export interface WarrantListParams {
  owner_id?: number;
  page?: number;
  page_size?: number;
  q?: string;
  warrant_state?: number;
  warrant_type?: number;
}

export interface WarrantCreateParams {
  chattel?: { chattel_type: number; chattel_detail: string };
  constructions?: Array<{ construct_locate: string; construct_app: string; construct_area: number; region_id?: number }>;
  grounds?: Array<{ ground_app: string; ground_area: number; ground_locate: string; region_id?: number }>;
  houses?: HouseItem[];
  other?: { other_type: number; cost?: number; other_detail: string; patent?: any; software?: any };
  owners: { owner_id: number; ownership_num: string; share_ratio?: number }[];
  receive_units?: string[];
  stock?: {
    stock_type: number;
    target: string;
    ratio: number;
    registered_capital?: number;
    paid_capital?: number;
    remark?: string;
  };
  vehicle?: { frame_num: string; plate_num: string; vehicle_brand: string; remark?: string };
  warrant_num: string;
  warrant_type: number;
  remark?: string;
}

/** 权证列表(data_scope 按 created_by 过滤) */
export function getWarrantList(params: WarrantListParams) {
  return requestClient.get<PageResult<WarrantListItem>>('/warrants', {
    params,
  });
}

/** 权证详情(聚合扩展 / 所有权人 / 出入库 / 评估) */
export function getWarrantDetail(id: number) {
  return requestClient.get<WarrantDetail>(`/warrants/${id}`);
}

/** 创建权证(主表 + 类型扩展 + 所有权人，单事务) */
export function createWarrant(data: WarrantCreateParams) {
  return requestClient.post<{ id: number }>('/warrants', data);
}

/** 修改主表字段(评估 / 状态 / 拍卖) */
export function updateWarrant(id: number, data: object) {
  return requestClient.request(`/warrants/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除权证(拦截：已入库 / 已流转走注销流程) */
export function deleteWarrant(id: number) {
  return requestClient.delete(`/warrants/${id}`);
}

/** 修改所有权人(OwnershipUpdate 自由字段，留空不序列化保持原值) */
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

/** 添加所有权人 */
export function addWarrantOwner(
  id: number,
  data: { owner_id: number; ownership_num: string; share_ratio?: number },
) {
  return requestClient.post<{ id: number }>(`/warrants/${id}/owners`, data);
}

/** 删除所有权人 */
export function deleteWarrantOwner(id: number, ownerRowId: number) {
  return requestClient.delete(`/warrants/${id}/owners/${ownerRowId}`);
}

// ===== 房产 / 土地 / 在建工程 独立 CRUD =====

export function addWarrantHouse(id: number, data: Omit<HouseItem, 'id' | 'region_name'>) {
  return requestClient.post<{ id: number }>(`/warrants/${id}/houses`, data);
}
export function deleteWarrantHouse(id: number, houseId: number) {
  return requestClient.delete(`/warrants/${id}/houses/${houseId}`);
}

export function addWarrantGround(id: number, data: Omit<GroundItem, 'id' | 'region_name'>) {
  return requestClient.post<{ id: number }>(`/warrants/${id}/grounds`, data);
}
export function deleteWarrantGround(id: number, groundId: number) {
  return requestClient.delete(`/warrants/${id}/grounds/${groundId}`);
}

export function addWarrantConstruction(id: number, data: Omit<ConstructionItem, 'id' | 'region_name'>) {
  return requestClient.post<{ id: number }>(`/warrants/${id}/constructions`, data);
}
export function deleteWarrantConstruction(id: number, constructionId: number) {
  return requestClient.delete(`/warrants/${id}/constructions/${constructionId}`);
}

// ===== 应收单位明细 =====

export function addWarrantReceiveExtend(id: number, data: { receive_unit: string }) {
  return requestClient.post<{ id: number }>(`/warrants/${id}/receive-extends`, data);
}
export function deleteWarrantReceiveExtend(id: number, extendId: number) {
  return requestClient.delete(`/warrants/${id}/receive-extends/${extendId}`);
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
    draft_type: number;
    due_date: string;
    issue_date: string;
  },
) {
  return requestClient.post(`/warrants/${id}/draft-extends`, data);
}

export function deleteDraftExtend(id: number, extendId: number) {
  return requestClient.delete(`/warrants/${id}/draft-extends/${extendId}`);
}

// ===== 批量操作 =====

// 命名带 Warrant 后缀，避免与客户模块 batchTransfer 的桶导出冲突
export function batchTransferWarrants(data: { reason: string; to_conservator_id: number; warrant_ids: number[] }) {
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
