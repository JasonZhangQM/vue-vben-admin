/** 系统管理：日志 / 字典 API。 */

import { requestClient } from '#/api/request';

import type { PageResult } from './user';

export interface OperationLogItem {
  action: string;
  created_at: string;
  id: number;
  ip: null | string;
  message: null | string;
  module: string;
  path: null | string;
  status: number;
  target_id: null | string;
  target_type: null | string;
  user_id: null | number;
  user_name: null | string;
  username: null | string;
}

export interface LoginLogItem {
  created_at: string;
  id: number;
  ip: null | string;
  message: null | string;
  status: number;
  user_id: null | number;
  username: null | string;
}

export interface LogQueryParams {
  end_time?: string;
  module?: string;
  page?: number;
  page_size?: number;
  start_time?: string;
  username?: string;
}

/** 操作日志列表 */
export function getOperationLogs(params: LogQueryParams) {
  return requestClient.get<PageResult<OperationLogItem>>('/operation-logs', {
    params,
  });
}

/** 登录日志列表 */
export function getLoginLogs(params: {
  page?: number;
  page_size?: number;
  username?: string;
}) {
  return requestClient.get<PageResult<LoginLogItem>>('/login-logs', { params });
}

/** 字典项 */
export interface DictOption {
  label: string;
  value: number;
}

/** 性别字典 */
export function getGenderDict() {
  return requestClient.get<DictOption[]>('/dicts/genders');
}

/** 用户状态字典 */
export function getUserStatusDict() {
  return requestClient.get<DictOption[]>('/dicts/user-statuses');
}

/** 数据范围字典 */
export function getDataScopeDict() {
  return requestClient.get<DictOption[]>('/dicts/data-scopes');
}

/** 在职员工下拉 */
export function getUserOptions(params?: { dept_id?: number }) {
  return requestClient.get<
    { id: number; name: string; username: string }[]
  >('/dicts/users', { params });
}
