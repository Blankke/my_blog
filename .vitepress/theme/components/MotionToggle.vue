<!--
用法示例：<MotionToggle />
说明：首页动画总开关；首次操作前跟随系统，操作后使用持久化状态。
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useMotionPreference } from '../lib/motion-preference';

const { motionEnabled, preferenceSource, toggleMotion } = useMotionPreference();

const stateLabel = computed(() => (motionEnabled.value ? '已开启' : '已关闭'));
const sourceLabel = computed(() =>
  preferenceSource.value === 'system' ? '跟随系统' : '手动设置',
);
const controlLabel = computed(
  () =>
    `动画${stateLabel.value}，当前${sourceLabel.value}。点击${
      motionEnabled.value ? '关闭' : '开启'
    }动画`,
);
</script>

<template>
  <button
    class="motion-toggle"
    :class="{ 'motion-toggle--night': !motionEnabled }"
    type="button"
    role="switch"
    :aria-checked="motionEnabled"
    :aria-label="controlLabel"
    :title="controlLabel"
    @click="toggleMotion"
  >
    <span class="motion-toggle__container" aria-hidden="true">
      <span class="motion-toggle__clouds" />
      <span class="motion-toggle__stars">
        <svg viewBox="0 0 72 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6 14c2.7-.2 4.8-2.4 5-5 .2 2.6 2.3 4.8 5 5-2.7.2-4.8 2.4-5 5-.2-2.6-2.3-4.8-5-5Zm23-7c1.9-.1 3.4-1.6 3.5-3.5C32.6 5.4 34.1 6.9 36 7c-1.9.1-3.4 1.6-3.5 3.5C32.4 8.6 30.9 7.1 29 7Zm22 12c2.2-.1 3.9-1.9 4-4 .1 2.1 1.8 3.9 4 4-2.2.1-3.9 1.9-4 4-.1-2.1-1.8-3.9-4-4Zm-28 4.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm25-14a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span class="motion-toggle__orbit">
        <span class="motion-toggle__sun-moon">
          <span class="motion-toggle__moon">
            <span class="motion-toggle__spot" />
            <span class="motion-toggle__spot" />
            <span class="motion-toggle__spot" />
          </span>
        </span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.motion-toggle {
  --toggle-size: 8.8px;
  --toggle-width: 40px;
  --toggle-height: 22px;
  --toggle-radius: 6.25em;
  --toggle-orbit-size: 3.375em;
  --toggle-body-size: 2.125em;
  --toggle-orbit-offset: calc(
    (var(--toggle-orbit-size) - var(--toggle-height)) / -2
  );
  --toggle-travel: calc(var(--toggle-width) - var(--toggle-height));
  --toggle-day-bg: #3d7eae;
  --toggle-night-bg: #1d1f2c;
  --toggle-sun: #ecca2f;
  --toggle-moon: #c4c9d1;
  --toggle-moon-spot: #6f7789;
  --toggle-cloud: #f3fdff;
  --toggle-cloud-back: #aacadf;
  --toggle-transition: 560ms cubic-bezier(0.22, 1, 0.36, 1);
  --toggle-orbit-transition: 680ms cubic-bezier(0.22, 1, 0.36, 1);
  display: block;
  width: var(--toggle-width);
  height: var(--toggle-height);
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: var(--toggle-radius);
  background: transparent;
  cursor: pointer;
  font-size: var(--toggle-size);
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}

.motion-toggle,
.motion-toggle *,
.motion-toggle *::before,
.motion-toggle *::after {
  box-sizing: border-box;
}

.motion-toggle:focus-visible {
  outline: none;
}

.motion-toggle:focus-visible .motion-toggle__container {
  outline: 3px solid color-mix(in srgb, var(--vp-c-brand-1) 72%, white);
  outline-offset: 3px;
}

.motion-toggle__container {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--toggle-radius);
  background: var(--toggle-day-bg);
  box-shadow: 0 -0.062em 0.062em rgba(0, 0, 0, 0.25),
    0 0.062em 0.125em rgba(255, 255, 255, 0.82),
    inset 0 0.05em 0.187em rgba(0, 0, 0, 0.3);
  transition: background-color var(--toggle-transition),
    box-shadow var(--toggle-transition) !important;
  will-change: background-color;
}

.motion-toggle:active .motion-toggle__container {
  box-shadow: 0 -0.062em 0.062em rgba(0, 0, 0, 0.2),
    0 0.031em 0.062em rgba(255, 255, 255, 0.62),
    inset 0 0.1em 0.25em rgba(0, 0, 0, 0.38);
}

.motion-toggle__orbit {
  position: absolute;
  top: var(--toggle-orbit-offset);
  left: var(--toggle-orbit-offset);
  z-index: 2;
  display: flex;
  width: var(--toggle-orbit-size);
  height: var(--toggle-orbit-size);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 0 var(--toggle-orbit-size) rgba(255, 255, 255, 0.08),
    0 0 0 0.625em rgba(255, 255, 255, 0.1),
    0 0 0 1.25em rgba(255, 255, 255, 0.08);
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  transition: transform var(--toggle-orbit-transition) !important;
  will-change: transform;
}

.motion-toggle__sun-moon {
  position: relative;
  width: var(--toggle-body-size);
  height: var(--toggle-body-size);
  margin: auto;
  overflow: hidden;
  border-radius: 50%;
  background: var(--toggle-sun);
  box-shadow: inset 0.062em 0.062em 0.062em rgba(254, 255, 239, 0.61),
    inset 0 -0.062em 0.062em #a1872a;
  filter: drop-shadow(0.062em 0.125em 0.125em rgba(0, 0, 0, 0.3));
  transform: rotate(0deg);
  transition: transform var(--toggle-orbit-transition),
    background-color var(--toggle-transition), filter 220ms ease !important;
  will-change: transform;
}

.motion-toggle:hover .motion-toggle__sun-moon {
  filter: brightness(1.06)
    drop-shadow(0.062em 0.125em 0.125em rgba(0, 0, 0, 0.3));
}

.motion-toggle__moon {
  position: relative;
  isolation: isolate;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--toggle-moon);
  box-shadow: inset 0.062em 0.062em 0.062em rgba(254, 255, 239, 0.61),
    inset 0 -0.062em 0.062em #969696;
  opacity: 0;
  transform: translate3d(105%, -8%, 0) rotate(-90deg);
  transition: opacity 260ms ease,
    transform var(--toggle-transition) !important;
  will-change: opacity, transform;
}

.motion-toggle__spot {
  position: absolute;
  z-index: 1;
  display: block;
  top: 0.75em;
  left: 0.312em;
  width: 0.75em;
  height: 0.75em;
  border-radius: 50%;
  background: var(--toggle-moon-spot);
  box-shadow: inset 0 0.031em 0.062em rgba(0, 0, 0, 0.34),
    0 0.025em 0.04em rgba(255, 255, 255, 0.24);
}

.motion-toggle__spot:nth-child(2) {
  top: 0.937em;
  left: 1.375em;
  width: 0.375em;
  height: 0.375em;
}

.motion-toggle__spot:nth-child(3) {
  top: 0.312em;
  left: 0.812em;
  width: 0.25em;
  height: 0.25em;
}

.motion-toggle__clouds {
  position: absolute;
  bottom: -0.625em;
  left: 0.312em;
  width: 1.25em;
  height: 1.25em;
  border-radius: 50%;
  background: var(--toggle-cloud);
  box-shadow: 0.937em 0.312em var(--toggle-cloud),
    -0.312em -0.312em var(--toggle-cloud-back),
    1.437em 0.375em var(--toggle-cloud),
    0.5em -0.125em var(--toggle-cloud-back),
    2.187em 0 var(--toggle-cloud),
    1.25em -0.062em var(--toggle-cloud-back),
    2.937em 0.312em var(--toggle-cloud),
    2em -0.312em var(--toggle-cloud-back),
    3.625em -0.062em var(--toggle-cloud),
    2.625em 0 var(--toggle-cloud-back),
    4.5em -0.312em var(--toggle-cloud),
    3.375em -0.437em var(--toggle-cloud-back),
    4.625em -1.75em 0 0.437em var(--toggle-cloud),
    4em -0.625em var(--toggle-cloud-back),
    4.125em -2.125em 0 0.437em var(--toggle-cloud-back);
  opacity: 1;
  transform: translate3d(0, 0, 0);
  transition: opacity 320ms ease,
    transform var(--toggle-transition) !important;
  will-change: opacity, transform;
}

.motion-toggle__stars {
  position: absolute;
  top: 50%;
  left: 0.312em;
  width: 2.75em;
  height: auto;
  color: white;
  opacity: 0;
  transform: translate3d(0, -145%, 0) scale(0.72) rotate(-8deg);
  transition: opacity 360ms ease,
    transform var(--toggle-transition) !important;
  will-change: opacity, transform;
}

.motion-toggle__stars svg {
  display: block;
  width: 100%;
  height: auto;
}

.motion-toggle--night .motion-toggle__container {
  background: var(--toggle-night-bg);
}

.motion-toggle--night .motion-toggle__orbit {
  transform: translate3d(var(--toggle-travel), 0, 0);
}

.motion-toggle--night .motion-toggle__sun-moon {
  transform: rotate(360deg);
}

.motion-toggle--night .motion-toggle__moon {
  opacity: 1;
  transform: translate3d(0, 0, 0) rotate(0deg);
}

.motion-toggle--night .motion-toggle__clouds {
  opacity: 0;
  transform: translate3d(0, 3.5em, 0);
}

.motion-toggle--night .motion-toggle__stars {
  opacity: 1;
  transform: translate3d(0, -50%, 0) scale(1) rotate(0deg);
}

</style>
