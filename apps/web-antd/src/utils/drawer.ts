/**
 * 嵌套详情抽屉宽度约定(全项目共享)
 *
 * 约定见 AGENTS.md §6.4:基础宽度 66%;宿主抽屉每多打开一层后代详情抽屉,
 * 自身加宽 4%(66 → 70 → 74 → 78 …),上限 90%,保证抽屉栈中每一层
 * 左侧都留出一条可见边条(否则中间层的加宽会被祖父边缘完全遮挡)。
 *
 * 宽度 = 66 + 4 × 已打开的后代层数,由各详情抽屉组件按
 * 「直接子抽屉 open ? 1 + 子抽屉 @deep-open 上报层数 : 0」聚合计算后传入。
 */
import { computed, type Ref } from 'vue';

/** 基础宽度(%) */
export const DRAWER_BASE_WIDTH = 66;
/** 每层嵌套加宽步长(%) */
export const DRAWER_WIDTH_STEP = 4;
/** 宽度上限(%) */
export const DRAWER_MAX_WIDTH = 90;

/** 按已打开的后代抽屉层数计算宽度字符串(0 = 无嵌套打开,返回 '66%') */
export function drawerWidth(openDescendantLevels: number): string {
  const w =
    DRAWER_BASE_WIDTH +
    DRAWER_WIDTH_STEP * Math.max(0, openDescendantLevels);
  return `${Math.min(w, DRAWER_MAX_WIDTH)}%`;
}

/**
 * 聚合「已打开的后代抽屉层数」:每个直接子抽屉贡献 1 层,
 * 再累加该子抽屉通过 @deep-open 上报的更深层数,取各分支最大值。
 *
 * 用法: const deepLevels = useDeepLevels([
 *   [customerDetailOpen],                    // 叶子子抽屉(不上报)
 *   [warrantDetailOpen, warrantDeep],        // 会继续嵌套的子抽屉
 * ]);
 */
export function useDeepLevels(
  children: ReadonlyArray<readonly [Ref<boolean>, Ref<number>?]>,
): Readonly<Ref<number>> {
  return computed(() =>
    Math.max(
      0,
      ...children.map(([open, deep]) =>
        open.value ? 1 + (deep?.value ?? 0) : 0,
      ),
    ),
  );
}
