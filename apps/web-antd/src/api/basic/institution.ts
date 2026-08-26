/** 基础数据：机构模块 API（机构主表 / 联系人 / 分支机构 / 授信协议）。 */

import type { PageResult } from '#/api/system/user';

import { requestClient } from '#/api/request';

export interface InstitutionListItem {
  active_agreement_count: number;
  id: number;
  institution_subtype: null | number;
  institution_type: number;
  legal_representative: null | string;
  name: string;
  short_name: null | string;
  status: number;
  used_flow: number;
  used_back: number;
}

export interface ContactItem {
  id: number;
  is_primary: boolean;
  name: string;
  phone: null | string;
}

export interface BranchItem {
  branch_addr: null | string;
  id: number;
  name: string;
  short_name: null | string;
}

export interface AgreementItem {
  agreement_type: number;
  back_credit: number;
  flow_credit: number;
  id: number;
  status: number;
  valid_begin_date: string;
  valid_end_date: string;
}

export interface InstitutionDetail {
  agreements: AgreementItem[];
  branches: BranchItem[];
  contacts: ContactItem[];
  institution: InstitutionListItem & {
    address: null | string;
    credit_line: number;
    description: null | string;
  };
}

export interface InstitutionCreateParams {
  contacts?: { is_primary?: boolean; name: string; phone?: string }[];
  institution_subtype?: number;
  institution_type: number;
  legal_representative?: string;
  name: string;
  short_name?: string;
}

export interface InstitutionListParams {
  has_active_agreement?: boolean;
  institution_subtype?: number;
  institution_type?: number;
  page?: number;
  page_size?: number;
  q?: string;
  status?: number;
}

/** 机构列表 */
export function getInstitutionList(params: InstitutionListParams) {
  return requestClient.get<PageResult<InstitutionListItem>>('/institutions', {
    params,
  });
}

/** 机构详情（聚合联系人 / 分支 / 协议） */
export function getInstitutionDetail(id: number) {
  return requestClient.get<InstitutionDetail>(`/institutions/${id}`);
}

/** 新建机构 */
export function createInstitution(data: InstitutionCreateParams) {
  return requestClient.post<{ id: number }>('/institutions', data);
}

/** 修改机构 */
export function updateInstitution(id: number, data: object) {
  return requestClient.request(`/institutions/${id}`, {
    data,
    method: 'PATCH',
  });
}

/** 机构状态变更（启用 / 停用 / 注销） */
export function changeInstitutionStatus(id: number, status: number) {
  return requestClient.request(`/institutions/${id}/status`, {
    data: { status },
    method: 'PATCH',
  });
}

/** 删除机构 */
export function deleteInstitution(id: number) {
  return requestClient.delete(`/institutions/${id}`);
}

// ===== 联系人 =====

export function listContacts(id: number) {
  return requestClient.get<ContactItem[]>(`/institutions/${id}/contacts`);
}

export function addContact(id: number, data: { name: string; phone?: string }) {
  return requestClient.post(`/institutions/${id}/contacts`, data);
}

export function deleteContact(id: number, contactId: number) {
  return requestClient.delete(`/institutions/${id}/contacts/${contactId}`);
}

// ===== 分支机构 =====

export function listBranches(id: number) {
  return requestClient.get<BranchItem[]>(`/institutions/${id}/branches`);
}

export function addBranch(
  id: number,
  data: { branch_addr?: string; name: string; short_name?: string },
) {
  return requestClient.post(`/institutions/${id}/branches`, data);
}

export function deleteBranch(id: number, branchId: number) {
  return requestClient.delete(`/institutions/${id}/branches/${branchId}`);
}

// ===== 授信协议 =====

export function listAgreements(id: number) {
  return requestClient.get<AgreementItem[]>(`/institutions/${id}/agreements`);
}

export function addAgreement(
  id: number,
  data: {
    agreement_type: number;
    back_credit: number;
    flow_credit: number;
    valid_begin_date: string;
    valid_end_date: string;
  },
) {
  return requestClient.post(`/institutions/${id}/agreements`, data);
}

export function deleteAgreement(id: number, agreementId: number) {
  return requestClient.delete(`/institutions/${id}/agreements/${agreementId}`);
}

/** 机构类型字典（类型 / 子类型 / 协议类型） */
export function getInstitutionTypesDict() {
  return requestClient.get<{
    agreement_type: { label: string; value: number }[];
    institution_subtype: { label: string; value: number }[];
    institution_type: { label: string; value: number }[];
  }>('/dicts/institution-types');
}
