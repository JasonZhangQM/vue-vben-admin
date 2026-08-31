/** 系统管理：角色 / 权限 API。 */

import { requestClient } from '#/api/request';

export interface RoleListItem {
  code: string;
  data_scope: number;
  description: null | string;
  id: number;
  is_builtin: boolean;
  name: string;
  permission_count: number;
  user_count: number;
  created_by_name: string;
}

export interface RoleDetail extends RoleListItem {
  permission_codes: string[];
  users: {
    dept_name: null | string;
    id: number;
    name: string;
    position: null | string;
    username: string;
  }[];
}

export interface PermissionItem {
  code: string;
  id: number;
  menu_id: null | number;
  module: string;
  name: string;
  type: number;
}

export interface RoleCreateParams {
  code: string;
  data_scope: number;
  description?: string;
  name: string;
}

export interface RoleUpdateParams {
  data_scope?: number;
  description?: null | string;
  name?: string;
}

/** 角色列表 */
export function getRoleList() {
  return requestClient.get<RoleListItem[]>('/roles');
}

/** 角色详情 */
export function getRoleDetail(id: number) {
  return requestClient.get<RoleDetail>(`/roles/${id}`);
}

/** 新增角色 */
export function createRole(data: RoleCreateParams) {
  return requestClient.post<{ id: number }>('/roles', data);
}

/** 修改角色 */
export function updateRole(id: number, data: RoleUpdateParams) {
  return requestClient.request(`/roles/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除角色(仅非内置且无用户绑定) */
export function deleteRole(id: number) {
  return requestClient.delete(`/roles/${id}`);
}

/** 全量替换角色权限 */
export function assignRolePermissions(id: number, permissionIds: number[]) {
  return requestClient.put(`/roles/${id}/permissions`, {
    permission_ids: permissionIds,
  });
}

/** 全部权限清单 */
export function getPermissionList() {
  return requestClient.get<PermissionItem[]>('/permissions');
}
