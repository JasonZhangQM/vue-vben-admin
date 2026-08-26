<script setup lang="ts">
import type { VbenFormSchema } from '#/adapter/form';

import { computed, ref } from 'vue';

import { ProfilePasswordSetting, z } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { changeMyPasswordApi } from '#/api/core';

const submitting = ref(false);

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      fieldName: 'oldPassword',
      label: '旧密码',
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: '请输入旧密码',
      },
    },
    {
      fieldName: 'newPassword',
      label: '新密码',
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: '至少10位，含大小写字母与数字',
      },
    },
    {
      fieldName: 'confirmPassword',
      label: '确认密码',
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: '请再次输入新密码',
      },
      dependencies: {
        rules(values) {
          const { newPassword } = values;
          return z
            .string({ error: '请再次输入新密码' })
            .min(1, { message: '请再次输入新密码' })
            .refine((value) => value === newPassword, {
              message: '两次输入的密码不一致',
            });
        },
        triggerFields: ['newPassword'],
      },
    },
  ];
});

async function handleSubmit(values: Record<string, any>) {
  // 后端策略：≥10 位、含大小写字母与数字；前端先做同口径校验，减少无效请求
  const policy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;
  if (!policy.test(values.newPassword ?? '')) {
    message.error('新密码至少10位，且需包含大小写字母与数字');
    return;
  }
  submitting.value = true;
  try {
    await changeMyPasswordApi(values.oldPassword, values.newPassword);
    // 改密成功：后端已吊销全部会话，提示后回登录页
    message.success('密码修改成功，请使用新密码重新登录');
    setTimeout(() => {
      window.location.href = '/auth/login';
    }, 1500);
  } finally {
    submitting.value = false;
  }
}
</script>
<template>
  <ProfilePasswordSetting
    class="w-1/3"
    :form-schema="formSchema"
    @submit="handleSubmit"
  />
</template>
