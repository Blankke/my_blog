<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';

type NavTarget = 'home' | 'articles' | 'gallery' | 'about' | null;

const props = defineProps<{
  activeTarget: NavTarget;
}>();

const targetIndexes: Record<Exclude<NavTarget, null>, number> = {
  home: 0,
  articles: 1,
  gallery: 2,
  about: 3,
};

let menu: HTMLElement | null = null;
let limelight: HTMLDivElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrame = 0;
let ready = false;

function getTopLevelItems() {
  if (!menu) {
    return [];
  }

  return Array.from(menu.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      (child.classList.contains('VPNavBarMenuLink') ||
        child.classList.contains('VPNavBarMenuGroup')),
  );
}

function positionLimelight() {
  const items = getTopLevelItems();
  for (const item of items) {
    item.removeAttribute('data-nav-current');
  }

  if (!menu || !limelight || !props.activeTarget) {
    limelight?.removeAttribute('data-visible');
    return;
  }

  const activeItem = items[targetIndexes[props.activeTarget]];
  if (!activeItem) {
    limelight.removeAttribute('data-visible');
    return;
  }

  activeItem.dataset.navCurrent = '';
  const left = activeItem.offsetLeft + activeItem.offsetWidth / 2;
  limelight.style.setProperty('--nav-limelight-x', `${left}px`);
  limelight.dataset.visible = '';

  if (!ready) {
    ready = true;
    requestAnimationFrame(() => {
      limelight?.setAttribute('data-ready', '');
    });
  }
}

function queuePosition() {
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(positionLimelight);
}

onMounted(async () => {
  await nextTick();

  menu = document.querySelector<HTMLElement>('.VPNavBarMenu');
  if (!menu) {
    return;
  }

  limelight = document.createElement('div');
  limelight.className = 'navbar-limelight';
  limelight.setAttribute('aria-hidden', 'true');
  menu.prepend(limelight);

  resizeObserver = new ResizeObserver(queuePosition);
  resizeObserver.observe(menu);
  for (const item of getTopLevelItems()) {
    resizeObserver.observe(item);
  }

  window.addEventListener('resize', queuePosition, { passive: true });
  queuePosition();

  document.fonts?.ready.then(queuePosition);
});

watch(
  () => props.activeTarget,
  async () => {
    await nextTick();
    queuePosition();
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);
  window.removeEventListener('resize', queuePosition);
  resizeObserver?.disconnect();
  for (const item of getTopLevelItems()) {
    item.removeAttribute('data-nav-current');
  }
  limelight?.remove();
});
</script>

<template>
  <!-- The light is mounted into VitePress' own nav element on the client. -->
  <span class="navbar-limelight-mount" aria-hidden="true" />
</template>
