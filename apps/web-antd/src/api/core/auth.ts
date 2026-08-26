import { useAccessStore } from '@vben/stores';

import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    captcha_code?: string;
    captcha_id?: string;
    password?: string;
    username?: string;
  }

  /** 图形验证码（SVG data-url，一次性，TTL 120s） */
  export interface CaptchaResult {
    captcha_id: string;
    image: string;
  }

  /** 登录接口返回值（后端 R.data 映射后） */
  export interface LoginResult {
    accessToken: string;
    mustChangePassword: boolean;
    refreshToken: string;
  }

  /** 刷新 token 返回值（后端原始字段） */
  export interface RefreshTokenResult {
    access_token: string;
    refresh_token: string;
  }
}

/** 后端统一响应体 */
interface ApiResult<T> {
  code: number;
  data: T;
  message: string;
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  // 后端返回 { tokens: {access_token, refresh_token}, must_change_password }
  const raw = await requestClient.post<{
    must_change_password: boolean;
    tokens: { access_token: string; refresh_token: string };
  }>('/auth/login', data);
  return {
    accessToken: raw.tokens.access_token,
    mustChangePassword: raw.must_change_password,
    refreshToken: raw.tokens.refresh_token,
  } satisfies AuthApi.LoginResult;
}

/**
 * 刷新 accessToken（旋转式：旧 refresh 作废，同时返回新 refresh）
 *
 * 注意：必须用 baseRequestClient（raw 响应 + 无认证拦截器），
 * 避免 refresh 自身 401 时触发刷新链造成递归。
 */
export async function refreshTokenApi() {
  const accessStore = useAccessStore();
  // baseRequestClient 未配置 responseReturn:'data'，返回的是完整响应，
  // 泛型按结构声明（request<T> 内部 response as T），不直接依赖 axios 包
  const resp = await baseRequestClient.post<{
    data: ApiResult<AuthApi.RefreshTokenResult>;
  }>('/auth/refresh', { refresh_token: accessStore.refreshToken });
  const body = resp.data;
  if (body.code !== 0 || !body.data) {
    throw new Error(body.message || 'refresh token 无效');
  }
  return body.data;
}

/**
 * 退出登录（手动带 Authorization，后端据此拉黑 access / 删 refresh）
 */
export async function logoutApi() {
  const accessStore = useAccessStore();
  return baseRequestClient.post('/auth/logout', undefined, {
    headers: accessStore.accessToken
      ? { Authorization: `Bearer ${accessStore.accessToken}` }
      : {},
  });
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}

/**
 * 获取图形验证码（连续登录失败 3 次后前端展示）
 */
export async function getCaptchaApi() {
  return requestClient.get<AuthApi.CaptchaResult>('/auth/captcha');
}

/**
 * 修改本人密码（改密后后端踢出全部会话，需重新登录）
 */
export async function changeMyPasswordApi(oldPassword: string, newPassword: string) {
  return requestClient.request('/users/me/password', {
    data: {
      new_password: newPassword,
      old_password: oldPassword,
    },
    method: 'PATCH',
  });
}
