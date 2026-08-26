<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed, ref } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { useAuthStore } from '#/store';

import CaptchaInput from './captcha-input.vue';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();

// 验证码状态：后端连续失败 3 次后返回 4014，此时才展示验证码字段
const captchaVisible = ref(false);
const captchaId = ref('');
const captchaNonce = ref(0);

const formSchema = computed((): VbenFormSchema[] => {
  const schemas: VbenFormSchema[] = [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
  ];
  // 依赖 captchaVisible / captchaNonce：显隐与刷新均触发 schema 重算
  if (captchaVisible.value) {
    schemas.push({
      component: CaptchaInput,
      componentProps: {
        captchaNonce: captchaNonce.value,
        onCaptchaLoaded: (id: string) => {
          captchaId.value = id;
        },
      },
      fieldName: 'captcha_code',
      label: '验证码',
      rules: z.string().min(1, { message: '请输入验证码' }),
    });
  }
  return schemas;
});

async function handleLogin(values: Record<string, any>) {
  try {
    await authStore.authLogin({
      captcha_code: values.captcha_code || undefined,
      captcha_id: captchaId.value || undefined,
      password: values.password,
      username: values.username,
    });
  } catch (error: any) {
    // 验证码错误/需要验证码：展示验证码字段并刷新图片，其余错误由全局拦截器提示
    const bizCode = error?.data?.code ?? error?.response?.data?.code;
    if (bizCode === 4014) {
      captchaVisible.value = true;
      captchaNonce.value += 1;
    }
  }
}
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    @submit="handleLogin"
  />
</template>
