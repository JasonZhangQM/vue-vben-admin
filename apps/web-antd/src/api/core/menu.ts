import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * 获取用户所有菜单（后端 vben 路由协议树）
 */
export async function getAllMenusApi() {
  return requestClient.get<RouteRecordStringComponent[]>('/users/me/menus');
}
