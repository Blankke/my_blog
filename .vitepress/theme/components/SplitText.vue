<script setup lang="ts">
import { computed, ref } from 'vue';

type SplitTextPhase = 'entering' | 'exiting' | 'idle';

const props = withDefaults(
  defineProps<{
    falloff?: number;
    interactive?: boolean;
    maxMove?: number;
    phase?: SplitTextPhase;
    text: string;
    transitionKey?: number;
  }>(),
  {
    falloff: 0.5,
    interactive: true,
    maxMove: 50,
    phase: 'idle',
    transitionKey: 0,
  },
);

const hoverIndex = ref<number | null>(null);
const characters = computed(() => Array.from(props.text));

function getOffset(index: number) {
  if (!props.interactive || hoverIndex.value === null) {
    return 0;
  }

  const distance = Math.abs(index - hoverIndex.value);
  const influence = Math.exp(-distance * Math.max(0.01, props.falloff));
  return influence < 0.02 ? 0 : props.maxMove * influence;
}

function getScatter(index: number) {
  // 黄金角分布可以避免散开方向出现明显重复，同时让同一句格言的轨迹保持稳定。
  const angle =
    ((index * 137.508 + props.transitionKey * 47.31) * Math.PI) / 180;
  const distance = 7 + ((index + props.transitionKey) % 4) * 1.1;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance * 1.15;
  const rotation = Math.sin(angle * 1.7) * 1.6;
  const delay = Math.min(index * 7, 126);
  const hoverOffset = getOffset(index);

  return {
    '--split-enter-delay': `${delay}ms`,
    '--split-exit-delay': `${Math.min((characters.value.length - index) * 6, 108)}ms`,
    '--split-hover-offset': `${hoverOffset}%`,
    '--split-hover-offset-negative': `${-hoverOffset}%`,
    '--split-scatter-rotation': `${rotation.toFixed(2)}deg`,
    '--split-scatter-rotation-negative': `${(-rotation).toFixed(2)}deg`,
    '--split-scatter-x': `${x.toFixed(2)}px`,
    '--split-scatter-x-negative': `${(-x).toFixed(2)}px`,
    '--split-scatter-y': `${y.toFixed(2)}px`,
    '--split-scatter-y-negative': `${(-y).toFixed(2)}px`,
  };
}

function setHoverIndex(index: number) {
  if (props.interactive) {
    hoverIndex.value = index;
  }
}

function clearHover() {
  hoverIndex.value = null;
}
</script>

<template>
  <span
    class="split-text"
    :class="`split-text--${phase}`"
    :aria-label="text"
    @pointerleave="clearHover"
  >
    <span aria-hidden="true" class="split-text__visual">
      <span
        v-for="(character, index) in characters"
        :key="`${transitionKey}-${index}-${character}`"
        class="split-text__character"
        :style="getScatter(index)"
        @pointerenter="setHoverIndex(index)"
      >
        <span class="split-text__glyph">
          <span class="split-text__half split-text__half--top">
            {{ character === ' ' ? '\u00a0' : character }}
          </span>
          <span class="split-text__half split-text__half--bottom">
            <span class="split-text__bottom-content">
              {{ character === ' ' ? '\u00a0' : character }}
            </span>
          </span>
        </span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.split-text {
  position: relative;
  display: block;
  width: 100%;
}

.split-text__visual {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

.split-text__character {
  position: relative;
  display: inline-flex;
  height: 1em;
  width: auto;
  margin-top: 0.35em;
  margin-bottom: 0.35em;
  line-height: 1;
  perspective: 500px;
}

.split-text__glyph {
  position: relative;
  display: flex;
  height: 1em;
  flex-direction: column;
  opacity: 1;
  transform: translate3d(0, 0, 0) rotate(0) scale(1);
  transform-origin: 50% 55%;
  backface-visibility: hidden;
  transition: opacity 460ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--split-enter-delay);
  will-change: opacity, transform;
}

.split-text--entering .split-text__glyph {
  opacity: 0;
  transform: translate3d(
      var(--split-scatter-x-negative),
      var(--split-scatter-y-negative),
      0
    )
    rotate(var(--split-scatter-rotation-negative)) scale(0.965);
  transition: none;
}

.split-text--exiting .split-text__glyph {
  opacity: 0;
  transform: translate3d(
      var(--split-scatter-x),
      var(--split-scatter-y),
      0
    )
    rotate(var(--split-scatter-rotation)) scale(0.965);
  transition-delay: var(--split-exit-delay);
}

.split-text__half {
  display: block;
  height: 50%;
  flex: 0 0 50%;
  overflow: hidden;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  transition: transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.split-text__half--top {
  transform: translate3d(0, var(--split-hover-offset-negative), 0);
}

.split-text__half--bottom {
  transform: translate3d(0, var(--split-hover-offset), 0);
}

.split-text__bottom-content {
  display: block;
  transform: translateY(-50%);
}

</style>
