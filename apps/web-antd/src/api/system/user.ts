/** 系统管理：用户模块 API。 */

import { requestClient } from '#/api/request';

/** 分页数据结构 */
export interface PageResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface UserListItem {
  created_at: string;
  dept_id: null | number;
  dept_name: string;
  email: string;
  gender: number;
  id: number;
  last_login_at: null | string;
  name: string;
  phone: null | string;
  position: null | string;
  role_names: string[];
  status: number;
  username: string;
}

export interface UserDetail extends UserListItem {
  data_scope: number;
  roles: { code: string; data_scope: number; id: number; name: string }[];
}

export interface UserCreateParams {
  dept_id?: null | number;
  email: string;
  gender?: number;
  name: string;
  phone?: string;
  position?: string;
  role_ids: number[];
  username: string;
}

export interface UserUpdateParams {
  dept_id?: null | number;
  email?: string;
  gender?: number;
  name?: string;
  phone?: null | string;
  position?: null | string;
}

export interface UserListParams {
  dept_id?: number;
  page?: number;
  page_size?: number;
  position?: string;
  q?: string;
  status?: number;
}

/** 用户列表 */
export function getUserList(params: UserListParams) {
  return requestClient.get<PageResult<UserListItem>>('/users', { params });
}

/** 用户详情 */
export function getUserDetail(id: number) {
  return requestClient.get<UserDetail>(`/users/${id}`);
}

/** 新增用户（返回初始密码） */
export function createUser(data: UserCreateParams) {
  return requestClient.post<{ initial_password: string }>('/users', data);
}

/** 修改用户 */
export function updateUser(id: number, data: UserUpdateParams) {
  return requestClient.request(`/users/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除用户（逻辑删除） */
export function deleteUser(id: number) {
  return requestClient.delete(`/users/${id}`);
}

/** 启用/停用/离职 */
export function changeUserStatus(id: number, status: number) {
  return requestClient.request(`/users/${id}/status`, {
    data: { status },
    method: 'PATCH',
  });
}

/** 重置密码（new_password 为空则后端生成） */
export function resetUserPassword(id: number, newPassword?: string) {
  return requestClient.post<{ initial_password: string }>(
    `/users/${id}/password`,
    { new_password: newPassword ?? null },
  );
}

/** 分配角色（全量替换） */
export function assignUserRoles(id: number, roleIds: number[]) {
  return requestClient.put(`/users/${id}/roles`, { role_ids: roleIds });
}
