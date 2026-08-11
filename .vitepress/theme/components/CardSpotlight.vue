<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { CardSpotlightRenderer } from '../lib/card-spotlight-renderer';

const spotlightSelector = [
  '.VPHome .home-post-categories',
  '.VPHome .blog-info .card',
  '.VPHome .home-tags-card',
  '.VPHome .gallery-info-card',
  '.VPHome .home-audio-panel',
].join(', ');

const maxFrameRate = 60;
const frameInterval = 1000 / maxFrameRate;

let activeCard: HTMLElement | null = null;
let layer: HTMLDivElement | null = null;
let renderer: CardSpotlightRenderer | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let animationFrame = 0;
let detachTimer = 0;
let animationStart = 0;
let lastFrame = 0;

function findCard(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>(spotlightSelector);
}

function resizeRenderer() {
  if (!activeCard || !renderer) {
    return;
  }

  const bounds = activeCard.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height);
}

function syncTheme() {
  renderer?.setMode(
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
}

function renderFrame(timestamp: number) {
  if (!activeCard || !renderer) {
    return;
  }

  if (timestamp - lastFrame >= frameInterval) {
    renderer.render((timestamp - animationStart) / 1000);
    lastFrame = timestamp;
  }

  animationFrame = requestAnimationFrame(renderFrame);
}

function attachLayer(card: HTMLElement) {
  if (!layer || !renderer || activeCard === card) {
    return;
  }

  window.clearTimeout(detachTimer);
  activeCard?.removeAttribute('data-card-spotlight-active');
  resizeObserver?.disconnect();

  activeCard = card;
  card.prepend(layer);
  card.dataset.cardSpotlightActive = '';
  syncTheme();
  resizeObserver?.observe(card);
  resizeRenderer();

  cancelAnimationFrame(animationFrame);
  animationStart = performance.now();
  lastFrame = animationStart - frameInterval;
  animationFrame = requestAnimationFrame(renderFrame);
}

function clearActiveCard() {
  if (!activeCard) {
    return;
  }

  const previousLayer = layer;
  activeCard.removeAttribute('data-card-spotlight-active');
  activeCard = null;
  resizeObserver?.disconnect();
  cancelAnimationFrame(animationFrame);

  window.clearTimeout(detachTimer);
  detachTimer = window.setTimeout(() => {
    if (!activeCard && previousLayer?.isConnected) {
      previousLayer.remove();
      renderer?.clear();
    }
  }, 300);
}

function updatePointer(card: HTMLElement, event: PointerEvent) {
  const bounds = card.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  card.style.setProperty('--card-spotlight-x', `${x}px`);
  card.style.setProperty('--card-spotlight-y', `${y}px`);
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    return;
  }

  const card = findCard(event.target);
  if (!card) {
    clearActiveCard();
    return;
  }

  attachLayer(card);
  updatePointer(card, event);
}

function handlePointerOut(event: PointerEvent) {
  if (!activeCard) {
    return;
  }

  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && activeCard.contains(nextTarget)) {
    return;
  }

  if (findCard(event.target) === activeCard) {
    clearActiveCard();
  }
}

onMounted(() => {
  try {
    renderer = new CardSpotlightRenderer();
    layer = document.createElement('div');
    layer.className = 'card-spotlight-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.append(renderer.canvas);

    const fade = document.createElement('span');
    fade.className = 'card-spotlight-fade';
    layer.append(fade);
  } catch (error) {
    console.warn('[CardSpotlight]', error);
    return;
  }

  resizeObserver = new ResizeObserver(resizeRenderer);
  themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, {
    attributeFilter: ['class'],
    attributes: true,
  });
  document.addEventListener('pointermove', handlePointerMove, {
    passive: true,
  });
  document.addEventListener('pointerout', handlePointerOut, { passive: true });
  window.addEventListener('blur', clearActiveCard);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', handlePointerMove);
  document.removeEventListener('pointerout', handlePointerOut);
  window.removeEventListener('blur', clearActiveCard);
  window.clearTimeout(detachTimer);
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  activeCard?.removeAttribute('data-card-spotlight-active');
  renderer?.destroy();
  layer?.remove();
});
</script>

<template>
  <span class="card-spotlight-controller" aria-hidden="true" />
</template>
