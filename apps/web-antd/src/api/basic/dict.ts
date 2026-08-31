/** 基础数据：字典 API(区域 / 行业 / 标签 / 客户下拉 / 评估公司)。 */

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

/** 行政区域树节点(懒加载接口返回，has_children 供前端渲染展开箭头；
 *  children 仅前端懒加载填充，接口不返回) */
export interface RegionTreeNode {
  children?: RegionTreeNode[];
  code: string;
  has_children: boolean;
  id: number;
  level: number;
  level_display?: string;
  name: string;
  parent_id: number;
  status: number;
}

/** 行政区域树(级联全量模式，约 4.5 万条，仅用于级联选择器全量场景) */
export function getRegionTree() {
  return requestClient.get<TreeNode[]>('/regions/tree');
}

/** 行政区域懒加载：顶层省级列表(34 条，TreeSelect 首屏) */
export function getRegionRoots() {
  return requestClient.get<RegionTreeNode[]>('/regions/roots');
}

/** 行政区域懒加载：指定节点直接下级 */
export function getRegionChildren(parentId: number) {
  return requestClient.get<RegionTreeNode[]>(`/regions/${parentId}/children`);
}

/** 行政区域搜索(远程搜索，返回平铺结果带完整路径) */
export function searchRegions(q: string) {
  return requestClient.get<(RegionTreeNode & { path: string })[]>('/regions/search', { params: { q } });
}

/** 行政区域单节点详情(带完整路径，编辑回显用) */
export function getRegionDetail(id: number) {
  return requestClient.get<RegionTreeNode & { path: string }>(`/regions/${id}`);
}

/** 行业分类树 */
export function getIndustryTree() {
  return requestClient.get<TreeNode[]>('/dicts/industries/tree');
}

/** 行业 / 业务标签字典 */
export function getTags() {
  return requestClient.get<TagItem[]>('/dicts/tags');
}

// createTag/deleteTag 统一在 api/basic/customer.ts(标签管理页引用，避免桶导出重名冲突)

/** 客户下拉字典(表单选择用) */
export function getCustomerDict(params?: {
  genre?: number;
  is_acceptor?: boolean;
  is_core?: boolean;
  managementor_id?: number;
}) {
  return requestClient.get<CustomerDictItem[]>('/dicts/customers', { params });
}

/** 授信区域树(下拉选择用) */
export function getCreditRegionTree() {
  return requestClient.get<TreeNode[]>('/dicts/credit-regions/tree');
}

/** 权证类型字典(含票据主类型 / 明细类型) */
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

/** 员工下拉字典(轻量接口，仅要求登录，按部门/职务/角色 code 筛选) */
export interface EmployeeDictItem {
  dept_name: null | string;
  id: number;
  name: string;
  position: null | string;
  username: string;
}

export function getEmployeeDict(params?: {
  dept_id?: number;
  position?: string;
  /** 角色 code(如 pm/controler) */
  role?: string;
}) {
  return requestClient.get<EmployeeDictItem[]>('/dicts/users', { params });
}
