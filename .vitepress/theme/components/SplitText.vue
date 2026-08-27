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
    falloff: 0.3,
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
  return Math.max(0, props.maxMove * (1 - distance * props.falloff));
}

function getScatter(index: number) {
  // A golden-angle distribution avoids obvious repeating directions while
  // remaining deterministic between renders of the same quote.
  const angle =
    ((index * 137.508 + props.transitionKey * 47.31) * Math.PI) / 180;
  const distance = 3.5 + ((index + props.transitionKey) % 4) * 0.9;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance * 1.55;
  const rotation = Math.sin(angle * 1.7) * 2.2;
  const delay = Math.min(index * 10, 190);

  return {
    '--split-enter-delay': `${delay}ms`,
    '--split-exit-delay': `${Math.min((characters.value.length - index) * 8, 170)}ms`,
    '--split-hover-offset': `${getOffset(index)}%`,
    '--split-hover-offset-negative': `${-getOffset(index)}%`,
    '--split-scatter-rotation': `${rotation.toFixed(2)}deg`,
    '--split-scatter-rotation-negative': `${(-rotation).toFixed(2)}deg`,
    '--split-scatter-x': `${x.toFixed(2)}px`,
    '--split-scatter-x-negative': `${(-x).toFixed(2)}px`,
    '--split-scatter-y': `${y.toFixed(2)}px`,
    '--split-scatter-y-negative': `${(-y).toFixed(2)}px`,
  };
}

function trackPointer(event: PointerEvent) {
  if (!props.interactive) {
    return;
  }

  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const cells = Array.from(
    container.querySelectorAll<HTMLElement>('.split-text__character'),
  );
  let closestIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  cells.forEach((cell, index) => {
    const bounds = cell.getBoundingClientRect();
    const dx =
      event.clientX < bounds.left
        ? bounds.left - event.clientX
        : event.clientX > bounds.right
          ? event.clientX - bounds.right
          : 0;
    const dy =
      event.clientY < bounds.top
        ? bounds.top - event.clientY
        : event.clientY > bounds.bottom
          ? event.clientY - bounds.bottom
          : 0;
    const distance = dx * dx + dy * dy;

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  if (closestIndex !== null) {
    hoverIndex.value = closestIndex;
  }
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
    <span
      aria-hidden="true"
      class="split-text__visual"
      @pointermove="trackPointer"
    >
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
  transition: opacity 420ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 460ms cubic-bezier(0.22, 1, 0.36, 1);
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
  transition: transform 300ms ease-in-out;
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
