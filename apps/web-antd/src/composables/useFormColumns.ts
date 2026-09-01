import { computed } from 'vue';

import { breakpointsAntDesign, useBreakpoints } from '@vueuse/core';

/**
 * 表单响应式列数(AntD 断点口径，与 useDetailColumns 对齐)。
 *
 * 断点说明(AntD)：sm=576  md=768  lg=992  xl=1200  xxl=1600
 *   ≥1200px (xl) → 4 列
 *   ≥768px  (md) → 3 列
 *   ≥576px  (sm) → 2 列
 *   更窄         → 1 列
 *
 * 注意：必须用完整字符串返回（如 'grid-cols-4'），
 * 不能用模板字符串拼接（`grid-cols-${n}`），否则 Tailwind JIT 扫描不到。
 *
 * @param maxCols 上限列数，默认 4；如某页希望宽屏也不超过 3 列可传 3
 * @returns cols            — 纯数字列数(供需要 span 数值的场景使用)
 * @returns gridColsClass   — 栅格容器使用的 Tailwind 类(如 'grid-cols-4')
 * @returns fullSpanClass   — 需要占满整行的 FormItem 使用的 Tailwind 类(如 'col-span-4')
 */
export function useFormColumns(maxCols = 4) {
  const breakpoints = useBreakpoints(breakpointsAntDesign);

  const cols = computed(() => {
    let n;
    if (breakpoints.greaterOrEqual('xl').value) n = 4;
    else if (breakpoints.greaterOrEqual('md').value) n = 3;
    else if (breakpoints.greaterOrEqual('sm').value) n = 2;
    else n = 1;
    return Math.min(n, maxCols);
  });

  // 返回完整字符串（Tailwind JIT 能识别），不做拼接
  const gridColsClass = computed(() => {
    if (cols.value === 4) return 'grid-cols-4';
    if (cols.value === 3) return 'grid-cols-3';
    if (cols.value === 2) return 'grid-cols-2';
    return 'grid-cols-1';
  });

  const fullSpanClass = computed(() => {
    if (cols.value === 4) return 'col-span-4';
    if (cols.value === 3) return 'col-span-3';
    if (cols.value === 2) return 'col-span-2';
    return 'col-span-1';
  });

  return { cols, gridColsClass, fullSpanClass };
}
