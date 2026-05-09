<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vitepress';

const STORAGE_LEFT = 'blog-doc-left-sidebar-width';
const STORAGE_RIGHT = 'blog-doc-right-aside-width';
const DEFAULT_LEFT = 272;
const DEFAULT_RIGHT = 256;

const leftHandle = ref<HTMLElement | null>(null);
const rightHandle = ref<HTMLElement | null>(null);
const showLeftHandle = ref(false);
const showRightHandle = ref(false);

const route = useRoute();
let cleanupDrag: (() => void) | undefined;
let resizeObserver: ResizeObserver | undefined;
let raf = 0;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredWidth(key: string, fallback: number) {
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setWidthVar(name: string, value: number) {
  document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

function applyStoredWidths() {
  const viewport = window.innerWidth;
  const leftMax = Math.min(420, Math.floor(viewport * 0.36));
  const rightMax = Math.min(420, Math.floor(viewport * 0.3));

  setWidthVar('--vp-sidebar-width', clamp(readStoredWidth(STORAGE_LEFT, DEFAULT_LEFT), 220, leftMax));
  setWidthVar('--doc-aside-width', clamp(readStoredWidth(STORAGE_RIGHT, DEFAULT_RIGHT), 208, rightMax));
}

function schedulePositionHandles() {
  window.cancelAnimationFrame(raf);
  raf = window.requestAnimationFrame(positionHandles);
}

function positionHandles() {
  const isDesktop = window.matchMedia('(min-width: 960px)').matches;
  const isWideDesktop = window.matchMedia('(min-width: 1280px)').matches;
  const isHome = !!document.querySelector('.VPContent.is-home');
  const sidebar = document.querySelector<HTMLElement>('.VPSidebar');
  const docAside = document.querySelector<HTMLElement>('.VPDoc .aside');

  showLeftHandle.value = isDesktop && !isHome && !!sidebar;
  showRightHandle.value = isWideDesktop && !isHome && !!docAside && docAside.offsetParent !== null;

  if (showLeftHandle.value && leftHandle.value && sidebar) {
    const rect = sidebar.getBoundingClientRect();
    leftHandle.value.style.left = `${Math.round(rect.right - 3)}px`;
  }

  if (showRightHandle.value && rightHandle.value && docAside) {
    const rect = docAside.getBoundingClientRect();
    rightHandle.value.style.left = `${Math.round(rect.left - 4)}px`;
  }
}

function beginDrag(
  event: PointerEvent,
  side: 'left' | 'right',
) {
  event.preventDefault();
  const viewport = window.innerWidth;
  const startX = event.clientX;
  const rootStyle = getComputedStyle(document.documentElement);
  const startWidth = Number.parseFloat(
    rootStyle.getPropertyValue(side === 'left' ? '--vp-sidebar-width' : '--doc-aside-width'),
  ) || (side === 'left' ? DEFAULT_LEFT : DEFAULT_RIGHT);
  const min = side === 'left' ? 220 : 208;
  const max = side === 'left'
    ? Math.min(420, Math.floor(viewport * 0.36))
    : Math.min(420, Math.floor(viewport * 0.3));

  document.body.classList.add('doc-sidebar-resizing');

  function handleMove(moveEvent: PointerEvent) {
    const delta = moveEvent.clientX - startX;
    const nextWidth = side === 'left'
      ? startWidth + delta
      : startWidth - delta;
    const width = clamp(nextWidth, min, max);

    setWidthVar(side === 'left' ? '--vp-sidebar-width' : '--doc-aside-width', width);
    window.localStorage.setItem(side === 'left' ? STORAGE_LEFT : STORAGE_RIGHT, `${Math.round(width)}`);
    schedulePositionHandles();
  }

  function handleUp() {
    document.body.classList.remove('doc-sidebar-resizing');
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    cleanupDrag = undefined;
    schedulePositionHandles();
  }

  cleanupDrag = handleUp;
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleUp);
}

function resetWidth(side: 'left' | 'right') {
  window.localStorage.removeItem(side === 'left' ? STORAGE_LEFT : STORAGE_RIGHT);
  setWidthVar(side === 'left' ? '--vp-sidebar-width' : '--doc-aside-width', side === 'left' ? DEFAULT_LEFT : DEFAULT_RIGHT);
  schedulePositionHandles();
}

onMounted(() => {
  applyStoredWidths();
  nextTick(schedulePositionHandles);

  resizeObserver = new ResizeObserver(() => {
    applyStoredWidths();
    schedulePositionHandles();
  });
  resizeObserver.observe(document.documentElement);

  window.addEventListener('scroll', schedulePositionHandles, { passive: true });
});

onBeforeUnmount(() => {
  window.cancelAnimationFrame(raf);
  resizeObserver?.disconnect();
  cleanupDrag?.();
  window.removeEventListener('scroll', schedulePositionHandles);
});

watch(
  () => route.path,
  () => {
    nextTick(() => {
      applyStoredWidths();
      schedulePositionHandles();
    });
  },
);
</script>

<template>
  <div
    v-show="showLeftHandle"
    ref="leftHandle"
    class="doc-sidebar-resizer doc-sidebar-resizer-left"
    role="separator"
    aria-label="调整相关文章宽度"
    aria-orientation="vertical"
    title="拖拽调整相关文章宽度，双击恢复默认"
    @pointerdown="beginDrag($event, 'left')"
    @dblclick="resetWidth('left')"
  />
  <div
    v-show="showRightHandle"
    ref="rightHandle"
    class="doc-sidebar-resizer doc-sidebar-resizer-right"
    role="separator"
    aria-label="调整目录宽度"
    aria-orientation="vertical"
    title="拖拽调整目录宽度，双击恢复默认"
    @pointerdown="beginDrag($event, 'right')"
    @dblclick="resetWidth('right')"
  />
</template>
