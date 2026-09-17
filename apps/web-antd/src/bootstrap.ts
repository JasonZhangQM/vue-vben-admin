import { createApp, watchEffect } from 'vue';

import { Drawer, Modal } from 'ant-design-vue';

import { registerAccessDirective } from '@vben/access';
import { registerLoadingDirective } from '@vben/common-ui/es/loading';
import { preferences } from '@vben/preferences';
import { initStores } from '@vben/stores';
import '@vben/styles';
import '@vben/styles/antd';

import '#/styles/global.css';

import { useTitle } from '@vueuse/core';

import { $t, setupI18n } from '#/locales';

import { useDictStore } from '#/store';

import RegionTreeSelect from '#/components/RegionTreeSelect/index.vue';
import SearchSelect from '#/components/SearchSelect/index.vue';
import { initComponentAdapter } from './adapter/component';
import { initSetupVbenForm } from './adapter/form';
import App from './app.vue';
import { router } from './router';

// ------- Monkey patch AntD Drawer/Modal 默认 maskClosable=false -------
// 原因：ConfigProvider.drawerProps/modalProps 是 AntD Vue 5.x 才有，
// app.component() 包装也无效 — 页面在 <script setup> 里 import 原生 Drawer，
// 本地注册优先级 > 全局 app.component。
// 所以直接改 AntD 组件 props 定义里的 default 值，所有 import 的地方自动生效。
const patchDefaultMaskClosable = (comp: any, name: string) => {
  const beforeDefault = comp?.props?.maskClosable?.default;
  if (comp?.props && typeof comp.props === 'object' && comp.props.maskClosable) {
    comp.props.maskClosable.default = false;
    console.log(
      `[patch] ${name}.props.maskClosable.default: ${beforeDefault} → false ✅`,
    );
  } else {
    console.warn(
      `[patch] ${name}: props.maskClosable 不存在，patch 失败！comp.props =`,
      comp?.props,
      'comp.type =',
      typeof comp,
    );
  }
};
patchDefaultMaskClosable(Drawer, 'Drawer');
patchDefaultMaskClosable(Modal, 'Modal');

async function bootstrap(namespace: string) {
  // 初始化组件适配器
  await initComponentAdapter();

  // 初始化表单组件
  await initSetupVbenForm();

  // // 设置弹窗的默认配置
  // setDefaultModalProps({
  //   fullscreenButton: false,
  // });
  // // 设置抽屉的默认配置
  // setDefaultDrawerProps({
  //   zIndex: 1020,
  // });

  const app = createApp(App);

  // 注册v-loading指令
  registerLoadingDirective(app, {
    loading: 'loading', // 在这里可以自定义指令名称，也可以明确提供false表示不注册这个指令
    spinning: 'spinning',
  });

  // 国际化 i18n 配置
  await setupI18n(app);

  // 配置 pinia-tore
  await initStores(app, { namespace });

  // 全局注册业务通用组件(页面直接使用，无需 import)
  app.component('SearchSelect', SearchSelect);
  app.component('RegionTreeSelect', RegionTreeSelect);

  // 启动时预加载全部枚举字典(后端 GET /api/v1/dicts，公开接口无需登录)
  // 拉取失败不阻断启动，字典会在首次访问业务页面时按需再试
  const dictStore = useDictStore();
  dictStore.loadAll().catch(() => {
    console.warn('[dict] initial load failed, will retry on first access');
  });

  // 安装权限指令
  registerAccessDirective(app);

  // 初始化 tippy
  const { initTippy } = await import('@vben/common-ui/es/tippy');
  initTippy(app);

  // 配置路由及路由守卫
  app.use(router);

  // 配置Motion插件
  const { MotionPlugin } = await import('@vben/plugins/motion');
  app.use(MotionPlugin);

  // 动态更新标题
  watchEffect(() => {
    if (preferences.app.dynamicTitle) {
      const routeTitle = router.currentRoute.value.meta?.title;
      const pageTitle =
        (routeTitle ? `${$t(routeTitle)} - ` : '') + preferences.app.name;
      useTitle(pageTitle);
    }
  });

  app.mount('#app');
}

export { bootstrap };
