/**
 * 通用格式化工具函数（全项目共享）
 *
 * 抽取自多处业务页面的重复逻辑：dash / opt / toTreeData / filterOption
 * 新增页面直接从本文件 import，禁止就地重复实现。
 */

/** 空值文案兜底：null/undefined/空字符串 → '—'，否则转字符串 */
export function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

/**
 * 表单留空转 undefined：后端 PATCH Update schema 用 exclude_unset 保持原值
 * 空字符串 / 全空格 → undefined；否则 trim 后返回
 */
export function opt(v: string | undefined | null): string | undefined {
  if (!v || v.trim() === '') return undefined;
  return v.trim();
}

/**
 * 扁平化金额展示：Number / null / undefined → 千分位字符串或 '—'
 */
export function formatAmount(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString();
}

/**
 * 后端树节点 → AntD TreeSelect treeData（递归）
 * 后端节点需提供 { id, name, children? } 结构
 */
export function toTreeData(
  nodes: any[],
  options?: {
    idKey?: string;
    labelKey?: string;
    childrenKey?: string;
  },
): any[] {
  const { idKey = 'id', labelKey = 'name', childrenKey = 'children' } = options ?? {};
  return (nodes ?? []).map((n) => ({
    key: n[idKey],
    title: n[labelKey],
    value: n[idKey],
    children: toTreeData(n[childrenKey] ?? [], options),
  }));
}

/**
 * AntD TreeSelect 本地搜索过滤函数：按 title/label 包含匹配
 * 用法：`:filter-tree-node="filterOption"`
 */
export function filterTreeOption(input: string, node: any): boolean {
  const title = String(node?.title ?? node?.label ?? '').toLowerCase();
  return title.includes(input.toLowerCase());
}

/**
 * 从后端字典选项列表中按 value 取 label（找不到返回 value 本身或 fallback）
 */
export function findLabel(
  options: { label: string; value: number | string }[] | undefined,
  value: number | string | undefined,
  fallback?: string,
): string {
  if (!options || value === undefined || value === null) return fallback ?? '—';
  const found = options.find((o) => o.value === value);
  return found?.label ?? fallback ?? String(value);
}
