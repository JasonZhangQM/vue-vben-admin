/** 基础数据：字典 API（区域 / 行业 / 标签 / 客户下拉 / 评估公司）。 */

import { requestClient } from '#/api/request';

/** 区域 / 行业树节点 */
export interface TreeNode {
  children: TreeNode[];
  code: string;
  id: number;
  name: string;
}

export interface TagItem {
  id: number;
  in_use: boolean;
  name: string;
  status: number;
  type: number;
}

/** 客户下拉字典项 */
export interface CustomerDictItem {
  custom_state: number;
  genre: number;
  id: number;
  is_acceptor: boolean;
  is_core: boolean;
  managementor_name: null | string;
  name: string;
  short_name: string;
}

export interface EvaluateCompanyItem {
  id: number;
  name: string;
}

/** 行政区域树（级联全量模式） */
export function getRegionTree() {
  return requestClient.get<TreeNode[]>('/dicts/regions/tree');
}

/** 行业分类树 */
export function getIndustryTree() {
  return requestClient.get<TreeNode[]>('/dicts/industries/tree');
}

/** 行业 / 业务标签字典 */
export function getTags() {
  return requestClient.get<TagItem[]>('/dicts/tags');
}

/** 新增标签 */
export function createTag(data: { name: string; type: number }) {
  return requestClient.post<{ id: number }>('/dicts/tags', data);
}

/** 删除标签 */
export function deleteTag(id: number) {
  return requestClient.delete(`/dicts/tags/${id}`);
}

/** 客户下拉字典（表单选择用） */
export function getCustomerDict(params?: {
  genre?: number;
  is_acceptor?: boolean;
  is_core?: boolean;
  managementor_id?: number;
}) {
  return requestClient.get<CustomerDictItem[]>('/dicts/customers', { params });
}

/** 授信区域树（下拉选择用） */
export function getCreditRegionTree() {
  return requestClient.get<TreeNode[]>('/dicts/credit-regions/tree');
}

/** 权证类型字典（含票据主类型 / 明细类型） */
export function getWarrantTypesDict() {
  return requestClient.get<{
    draft_detail_type: { label: string; value: number }[];
    draft_main_type: { label: string; value: number }[];
    warrant_type: { label: string; value: number }[];
  }>('/dicts/warrant-types');
}

/** 权证状态 + 出入库类型字典 */
export function getWarrantStatesDict() {
  return requestClient.get<{
    storage_type: { label: string; value: number }[];
    warrant_state: { label: string; value: number }[];
  }>('/dicts/warrant-states');
}

/** 评估方式字典 */
export function getEvaluateMethodsDict() {
  return requestClient.get<{
    evaluate_method: { label: string; value: number }[];
  }>('/dicts/evaluate-methods');
}

/** 房产用途树 */
export function getHouseApps() {
  return requestClient.get<TreeNode[]>('/dicts/house-apps');
}

/** 评估公司字典 */
export function getEvaluateCompanies() {
  return requestClient.get<EvaluateCompanyItem[]>('/dicts/evaluate-companies');
}
