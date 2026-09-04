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
  repay_method?: number;
  repay_method_display?: string;
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

// ============ 子资源 ============

/** 风控反馈（upsert） */
export function submitFeedback(id: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${id}/feedback`, data);
}

/** 单项额度 upsert */
export function addSingleQuota(id: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${id}/single-quotas`, data);
}

/** 放款次序 */
export function addLendingOrder(id: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${id}/lending-orders`, data);
}

/** 反担保措施 upsert */
export function upsertSure(id: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${id}/sures`, data);
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
  comment_type: number;
  comment_type_display: string;
  score: number | null;
  concrete: string | null;
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
