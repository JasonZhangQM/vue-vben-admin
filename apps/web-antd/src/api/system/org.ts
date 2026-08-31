/** 系统管理：部门 / 菜单 API。 */

import { requestClient } from '#/api/request';

export interface DeptNode {
  children?: DeptNode[];
  id: number;
  leader_user_id: null | number;
  member_count: number;
  name: string;
  ordery: number;
  parent_id: number;
  status: number;
  created_by_name: string;
}

export interface DeptCreateParams {
  description?: string;
  leader_user_id?: null | number;
  name: string;
  ordery?: number;
  parent_id: number;
  status?: number;
}

export interface MenuNode {
  children: MenuNode[];
  component: null | string;
  id: number;
  caption: string;
  icon: null | string;
  keep_alive: boolean;
  ordery: number;
  parent_id: number;
  path: null | string;
  permission_code: null | string;
  redirect: null | string;
  type: number;
  visible: boolean;
  created_by_name: string;
}

/** 部门树 */
export function getDeptTree() {
  return requestClient.get<DeptNode[]>('/departments');
}

/** 新增部门 */
export function createDept(data: DeptCreateParams) {
  return requestClient.post<{ id: number }>('/departments', data);
}

/** 修改部门 */
export function updateDept(id: number, data: Partial<DeptCreateParams>) {
  // RequestClient 未内置 patch 方法，经通用 request 发送(packages 层视为只读)
  return requestClient.request(`/departments/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除部门(无成员/无子部门才允许) */
export function deleteDept(id: number) {
  return requestClient.delete(`/departments/${id}`);
}

/** 全部菜单树(配置页) */
export function getMenuList() {
  return requestClient.get<MenuNode[]>('/menus');
}

/** 新增菜单 */
export function createMenu(data: Record<string, unknown>) {
  return requestClient.post<{ id: number }>('/menus', data);
}

/** 修改菜单 */
export function updateMenu(id: number, data: Record<string, unknown>) {
  return requestClient.request(`/menus/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 删除菜单 */
export function deleteMenu(id: number) {
  return requestClient.delete(`/menus/${id}`);
}

// 行政区划接口统一收敛在 api/basic/dict.ts(与 RegionTreeSelect 共用，避免桶导出重名冲突)
