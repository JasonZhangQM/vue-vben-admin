/**
 * 表格行点击高亮 composable(全项目共享)
 *
 * 抽取自 institution/custom/warrant/system 等列表页的重复逻辑：
 * activeRowKey + customRow + rowClassName 三件套
 * 新页面直接调用 useRowHighlight() 即可，禁止就地重复实现。
 *
 * CSS 样式已在全局 style.css 中注册：
 *   .ant-table-tbody > tr.row-active > td,
 *   .ant-table-tbody > tr.row-active > td.ant-table-cell-row-hover { background-color: #e6f4ff; }
 */

import { ref } from 'vue';

export function useRowHighlight() {
  const activeRowKey = ref<number | string | undefined>();

  /** Table :custom-row 配置：点击行时记录 key 用于高亮 */
  const customRow = (record: any) => ({
    onClick: () => {
      activeRowKey.value = record.id;
    },
  });

  /** Table :row-class-name 配置：当前行匹配 activeRowKey 时加 row-active */
  const rowClassName = (record: any) =>
    record.id === activeRowKey.value ? 'row-active' : '';

  /** 主动设置高亮行(如打开详情时高亮该行) */
  function highlight(row: any) {
    activeRowKey.value = row?.id;
  }

  /** 清除高亮 */
  function clearHighlight() {
    activeRowKey.value = undefined;
  }

  return { activeRowKey, customRow, rowClassName, highlight, clearHighlight };
}
