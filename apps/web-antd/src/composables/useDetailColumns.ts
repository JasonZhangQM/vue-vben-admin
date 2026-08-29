import { computed } from 'vue';

import { breakpointsAntDesign, useBreakpoints } from '@vueuse/core';

/**
 * 详情页基本信息列数：随视口宽度自适应（AntD 断点口径）。
 * ≥1200px 4 列；≥768px 3 列；≥576px 2 列；更窄 1 列。
 * 长文本整行项将 span 绑定同一列数，即可在任意列数下占满整行。
 */
export function useDetailColumns() {
  const breakpoints = useBreakpoints(breakpointsAntDesign);
  const columns = computed(() => {
    if (breakpoints.greaterOrEqual('xl').value) return 4;
    if (breakpoints.greaterOrEqual('md').value) return 3;
    if (breakpoints.greaterOrEqual('sm').value) return 2;
    return 1;
  });
  return { columns };
}
