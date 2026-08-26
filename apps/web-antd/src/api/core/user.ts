import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

/** 后端 /users/me 响应（ UserProfile 的关键字段子集） */
interface MyProfile {
  avatar_url: null | string;
  id: number;
  name: string;
  roles: { code: string; data_scope: number; id: number; name: string }[];
  username: string;
}

/**
 * 获取用户信息（映射为 vben UserInfo 协议）
 */
export async function getUserInfoApi(): Promise<UserInfo> {
  const raw = await requestClient.get<MyProfile>('/users/me');
  return {
    avatar: raw.avatar_url || '',
    realName: raw.name,
    roles: raw.roles.map((r) => r.code),
    userId: String(raw.id),
    username: raw.username,
  };
}
