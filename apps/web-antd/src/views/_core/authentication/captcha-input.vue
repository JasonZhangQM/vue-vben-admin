<!-- 图形验证码输入字段：vben form 自定义组件(modelValue 协议)，
     内部拉取验证码图片；captchaNonce 变化时刷新，captcha_id 经回调交给父级随表单提交 -->
<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';

import { Input } from 'ant-design-vue';

import { getCaptchaApi } from '#/api/core';

defineOptions({ name: 'CaptchaInput' });

const props = defineProps<{
  /** 刷新信号：父级递增即触发重新拉取 */
  captchaNonce?: number;
  /** 验证码图片加载成功后回传 captcha_id */
  onCaptchaLoaded?: (captchaId: string) => void;
  modelValue?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const image = ref('');
const loading = ref(false);

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const { captcha_id: captchaId, image: svg } = await getCaptchaApi();
    image.value = svg;
    props.onCaptchaLoaded?.(captchaId);
    // 换图后旧输入作废
    emit('update:modelValue', '');
  } catch {
    image.value = '';
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
watch(
  () => props.captchaNonce,
  (val, old) => {
    if (val !== old) refresh();
  },
);
</script>

<template>
  <div class="flex w-full items-center gap-2">
    <Input
      :value="props.modelValue"
      autocomplete="off"
      placeholder="请输入验证码"
      @update:value="(val: string) => emit('update:modelValue', val)"
    />
    <img
      v-if="image"
      :src="image"
      :class="{ 'pointer-events-none opacity-50': loading }"
      alt="验证码"
      class="h-8 w-28 shrink-0 cursor-pointer rounded-sm border border-gray-200"
      title="点击刷新"
      @click="refresh"
    />
    <span v-else class="w-28 shrink-0 text-center text-xs text-gray-400">
      加载中...
    </span>
  </div>
</template>
