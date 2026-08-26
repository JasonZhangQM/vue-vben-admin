/** 审批中心 API：我的申请 / 待我审批 / 审批动作 / 实例详情。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface ApprovalInstanceItem {
  biz_id: null | number;
  biz_type: string;
  current_step: number;
  current_task_id?: number; // 仅待办列表返回
  finished_at: null | string;
  flow_code: string;
  flow_name: string;
  id: number;
  status: number;
  status_display: string;
  submitted_at: string;
  submitted_by_name: string;
  summary: string;
}

export interface ApprovalTaskItem {
  acted_at: null | string;
  approver_name: string;
  id: number;
  node_name: string;
  opinion: null | string;
  status: number;
  status_display: string;
  step: number;
}

export interface ApprovalInstanceDetail extends ApprovalInstanceItem {
  payload: Record<string, any>;
  tasks: ApprovalTaskItem[];
}

/** 我的申请列表 */
export function getMySubmitted(params?: { page?: number; page_size?: number }) {
  return requestClient.get<PageResult<ApprovalInstanceItem>>(
    '/approvals/my-submitted',
    { params },
  );
}

/** 待我审批列表 */
export function getMyTasks(params?: { page?: number; page_size?: number }) {
  return requestClient.get<PageResult<ApprovalInstanceItem>>(
    '/approvals/my-tasks',
    { params },
  );
}

/** 审批动作（action：10 同意 / 20 驳回） */
export function actTask(taskId: number, action: number, opinion?: string) {
  return requestClient.post(`/approvals/tasks/${taskId}/act`, {
    action,
    opinion,
  });
}

/** 撤回申请（仅 pending 且本人提交） */
export function withdrawInstance(instanceId: number, reason?: string) {
  return requestClient.post(`/approvals/instances/${instanceId}/withdraw`, {
    reason,
  });
}

/** 实例详情（payload + 任务轨迹） */
export function getInstanceDetail(instanceId: number) {
  return requestClient.get<ApprovalInstanceDetail>(
    `/approvals/instances/${instanceId}`,
  );
}
