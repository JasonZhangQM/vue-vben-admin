/** 评审管理 API：评审会 / 专家 / 评委意见 / 补调 / 纪要。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface AppraisalListItem {
  id: number;
  num: string;
  year: number;
  seq: number;
  review_model: number;
  review_model_display?: string;
  review_date?: string | null;
  meeting_state: number;
  meeting_state_display?: string;
  compere_id?: number;
  compere_name?: string;
  articles_count: number;
  created_at?: string;
  created_by_name?: string;
}

export interface ExpertItem {
  id: number;
  name: string;
  title?: string | null;
  org_name?: string | null;
  expert_type: number;
  expert_type_display?: string | null;
  contact_numb?: string | null;
  email?: string | null;
  remark?: string | null;
  sort: number;
  status: boolean;
  status_display?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// ============ 评审会 ============

export function getAppraisalList(params: {
  page?: number;
  page_size?: number;
  year?: number;
  review_model?: number;
  meeting_state?: number;
}) {
  return requestClient.get<PageResult<AppraisalListItem>>('/appraisals', { params });
}

export function createAppraisal(data: Record<string, unknown>) {
  return requestClient.post<{ id: number }>('/appraisals', data);
}

export function updateAppraisal(id: number, data: Record<string, unknown>) {
  return requestClient.put<void>(`/appraisals/${id}`, data);
}

export interface AppraisalArticleBrief {
  article_id: number;
  article_num: string;
  customer_name?: string | null;
  product_name?: string | null;
  renewal?: number;
  augment?: number;
  supplies?: { total: number; pending: number };
  comments_count?: number;
}

export interface AppraisalDetail {
  id: number;
  num: string;
  year: number;
  seq: number;
  review_model: number;
  review_model_display?: string;
  review_date?: string | null;
  compere_id?: number | null;
  compere_name?: string | null;
  meeting_state: number;
  meeting_state_display?: string;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  articles_count: number;
  articles: AppraisalArticleBrief[];
}

export function getAppraisal(id: number) {
  return requestClient.get<AppraisalDetail>(`/appraisals/${id}`);
}

export function deleteAppraisal(id: number) {
  return requestClient.delete<void>(`/appraisals/${id}`);
}

/** 排会（项目上会） */
export function arrangeArticles(appraisalId: number, articleIds: number[]) {
  return requestClient.post<void>(`/appraisals/${appraisalId}/articles`, { article_ids: articleIds });
}

/** 移出项目 */
export function removeArticle(appraisalId: number, articleId: number) {
  return requestClient.delete<void>(`/appraisals/${appraisalId}/articles/${articleId}`);
}

/** 会议完成 */
export function finishAppraisal(id: number, data?: { finish_date?: string }) {
  return requestClient.post<void>(`/appraisals/${id}/finish`, data ?? {});
}

// ============ 评委意见 / 补调 / 纪要（按项目维度） ============

/** 批量录入评委意见 */
export function batchUpsertComments(articleId: number, items: Record<string, unknown>[]) {
  return requestClient.post<{ count: number }>(
    `/articles/${articleId}/comments`,
    { items },
  );
}

/** 添加补调问题 */
export function addSupply(articleId: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/articles/${articleId}/supplies`, data);
}

/** 补调完成登记 */
export function resolveSupply(supplyId: number, data: Record<string, unknown>) {
  return requestClient.post<void>(`/supplies/${supplyId}/resolve`, data);
}

/** 纪要编辑 */
export function updateSummary(articleId: number, data: Record<string, unknown>) {
  return requestClient.put<void>(`/articles/${articleId}/summary`, data);
}

// ============ 评委库 ============

export function getExpertList(params?: {
  page?: number;
  page_size?: number;
  expert_type?: number;
  status?: boolean;
  keyword?: string;
}) {
  return requestClient.get<PageResult<ExpertItem>>('/review-experts', { params });
}

export function getExpert(id: number) {
  return requestClient.get<ExpertItem>(`/review-experts/${id}`);
}

export function createExpert(data: Record<string, unknown>) {
  return requestClient.post<{ id: number }>('/review-experts', data);
}

export function updateExpert(id: number, data: Record<string, unknown>) {
  return requestClient.put<void>(`/review-experts/${id}`, data);
}

export function toggleExpertStatus(id: number) {
  return requestClient.post<{ status: boolean }>(`/review-experts/${id}/toggle-status`);
}

export function deleteExpert(id: number) {
  return requestClient.delete<void>(`/review-experts/${id}`);
}


// ============ 评审会安排项目 ============

export interface AppraisalArticleItem {
  article_id: number;
  article_num: string;
  customer_name: string | null;
  product_name: string | null;
  renewal?: number;
  augment?: number;
  article_state?: number | null;
  article_state_display?: string | null;
  director_id?: number | null;
  director_name?: string | null;
  assistant_id?: number | null;
  assistant_name?: string | null;
  control_id?: number | null;
  control_name?: string | null;
  /** 上会建议（ArticleFeedback.propose：10 符合上会 / 20 暂不符合 / 30 建议终止） */
  propose?: number | null;
  propose_display?: string | null;
}

export function getAppraisalArticles(id: number) {
  return requestClient.get<AppraisalArticleItem[]>(`/appraisals/${id}/articles`);
}

export function arrangeAppraisalArticles(id: number, articleIds: number[]) {
  return requestClient.post<void>(`/appraisals/${id}/articles`, { article_ids: articleIds });
}

export function removeAppraisalArticle(id: number, articleId: number) {
  return requestClient.delete<void>(`/appraisals/${id}/articles/${articleId}`);
}
