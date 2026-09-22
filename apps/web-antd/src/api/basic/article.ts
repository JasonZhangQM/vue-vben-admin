/** 项目管理 API：主表 / 子资源 / 审批对接。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface ArticleListItem {
  id: number;
  article_num: string;
  article_state: number;
  article_state_display?: string;
  customer_id: number;
  customer_name?: string;
  product_id: number;
  product_name?: string;
  renewal: number;
  augment: number;
  credit_term?: number;
  credit_term_unit?: number;
  credit_term_unit_display?: string;
  director_id?: number;
  director_name?: string;
  assistant_id?: number;
  assistant_name?: string;
  control_id?: number;
  control_name?: string;
  balance: number;
  notify_sum: number;
  provide_sum: number;
  repayment_sum: number;
  sign_date?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
}

export interface ArticleDetail extends ArticleListItem {
  summary_num?: string | null;
  summary?: string | null;
  opinion?: string | null;
  rcd_opinion?: string | null;
  convenor_opinion?: string | null;
  sign_detail?: string | null;
  sign_type?: number | null;
  review_date?: string | null;
  // 风控反馈聚合字段（后端 get_article LEFT JOIN 返回）
  feedback_propose?: number | null;
  feedback_analysis?: string | null;
  feedback_suggestion?: string | null;
  feedback_created_by_name?: string | null;
  feedback_created_at?: string | null;
}

// ============ 主管理 ============

export function getArticleList(params: {
  page?: number;
  page_size?: number;
  article_state?: number;
  customer_id?: number;
  product_id?: number;
  director_id?: number;
  keyword?: string;
}) {
  return requestClient.get<PageResult<ArticleListItem>>('/articles', { params });
}

/** 项目下拉字典（无 data_scope，表单选择用） */
export function getArticleDictList(params: {
  q?: string;
  page?: number;
  page_size?: number;
}) {
  return requestClient.get<{
    items: {
      id: number;
      article_num: string;
      customer_name: null | string;
    }[];
    total: number;
    page: number;
    page_size: number;
  }>('/dicts/articles', { params });
}

export function getArticleDetail(id: number) {
  return requestClient.get<ArticleDetail>(`/articles/${id}`);
}

export function createArticle(data: Record<string, unknown>) {
  return requestClient.post<{ id: number; article_num: string }>('/articles', data);
}

export function updateArticle(id: number, data: Record<string, unknown>) {
  return requestClient.put<void>(`/articles/${id}`, data);
}

export function deleteArticle(id: number) {
  return requestClient.delete<void>(`/articles/${id}`);
}

/** 分配风控经理（专项权限 article:control_assign） */
export function assignControl(articleId: number, controlId: number) {
  return requestClient.post<void>(`/articles/${articleId}/control-assign`, { control_id: controlId });
}

// ============ 子资源 ============

/** 风控反馈（upsert） */
export function submitFeedback(id: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${id}/feedback`, data);
}

/** 放款次序 */
export function addOrder(id: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${id}/orders`, data);
}

/** 放款次序 + 嵌套反担保措施（详情 Tab 用） */
export interface GuarantorItem {
  sure_id: number;
  id: number;
  name: string;
  genre: number;
  genre_display: string;
  address: string;
  contact_name: string;
  contact_phone: string;
}

export interface CollateralItem {
  sure_id: number;
  id: number;
  warrant_type: number;
  method_category: number;
  method_category_display: string;
  address: string;
  area: number | null;
  owners: string;
  ownership_num: string;
  description: string;
  house_app: number | null;
  house_app_display: string;
  house_usage: number | null;
  house_usage_display: string;
}

export interface SureItem {
  sure_id: number;
  ware_category: number;
  ware_category_display: string;
  method_category: number;
  method_category_display: string;
  remark: string | null;
  guarantors: GuarantorItem[];
  collaterals: CollateralItem[];
}

export interface ArticleOrderItem {
  id: number;
  seq: number;
  order_amount: number;
  state: number;
  remark: string | null;
  sures: SureItem[];
}

export function listOrders(id: number) {
  return requestClient.get<ArticleOrderItem[]>(`/articles/${id}/orders`);
}

export function updateOrder(
  articleId: number,
  orderId: number,
  data: Record<string, unknown>,
) {
  return requestClient.put<void>(
    `/articles/${articleId}/orders/${orderId}`,
    data,
  );
}

export function deleteOrder(articleId: number, orderId: number) {
  return requestClient.delete<void>(
    `/articles/${articleId}/orders/${orderId}`,
  );
}

/** 反担保措施 upsert */
export function upsertSure(id: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${id}/sures`, data);
}

/** 删除反担保单行（保证人 / 权证） */
export function deleteSureRow(
  articleId: number,
  sureId: number,
  rowType: 'customer' | 'warrant',
  rowId: number,
) {
  return requestClient.delete<void>(
    `/articles/${articleId}/sures/${sureId}/rows?row_type=${rowType}&row_id=${rowId}`,
  );
}

// ============ 审批 ============

/** 发起签批 */
export function submitSignRequest(id: number, data: Record<string, unknown>) {
  return requestClient.post<{ instance_id: number }>(`/articles/${id}/sign-requests`, data);
}

/** 发起变更 */
export function submitChangeRequest(id: number, data: Record<string, unknown>) {
  return requestClient.post<{ instance_id: number }>(`/articles/${id}/change-requests`, data);
}


// ============ 详情关联查询（供详情抽屉 Tab）============

export interface ArticleCommentItem {
  id: number;
  expert_name: string;
  comment: number;
  comment_display: string;
  score: number | null;
  detail: string | null;
  created_at: string | null;
}

export interface ArticleSupplyItem {
  id: number;
  supply_detail: string;
  is_resolved: boolean;
  resolve_reply: string | null;
  supplyor_name: string;
  created_at: string | null;
  resolved_at: string | null;
}

export interface ApprovalTaskItem {
  step: number;
  node_name: string;
  approver_name: string;
  status: number;
  status_display: string;
  action: string | null;
  opinion: string | null;
  acted_at: string | null;
}

export interface ApprovalInstanceItem {
  id: number;
  flow_code: string;
  flow_name: string;
  summary: string | null;
  status: number;
  status_display: string;
  submitter_name: string;
  submitted_at: string | null;
  tasks: ApprovalTaskItem[];
}

export function getArticleComments(id: number) {
  return requestClient.get<ArticleCommentItem[]>(`/articles/${id}/comments`);
}

export function getArticleSupplies(id: number) {
  return requestClient.get<ArticleSupplyItem[]>(`/articles/${id}/supplies`);
}

export function getArticleApprovalInstances(id: number) {
  return requestClient.get<ApprovalInstanceItem[]>(`/articles/${id}/approval-instances`);
}
