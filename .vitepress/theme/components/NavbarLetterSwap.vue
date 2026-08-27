<script setup lang="ts">
import { useRoute } from 'vitepress';
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';

type SwapTarget = {
  animations: Set<Animation>;
  item: HTMLElement;
  label: HTMLElement;
  onFocus: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerMove: () => void;
  primaryLetters: HTMLElement[];
  run: number;
  secondaryLetters: HTMLElement[];
  text: string;
  hoverPlayed: boolean;
};

const route = useRoute();
const targets = new Map<HTMLElement, SwapTarget>();

const animationDuration = 920;
const staggerDuration = 24;
const swapDistance = '150%';
const springEasing = 'cubic-bezier(0.16, 1, 0.3, 1)';

let menu: HTMLElement | null = null;
let menuObserver: MutationObserver | null = null;
let decorateFrame = 0;

function shuffledIndexes(length: number) {
  const indexes = Array.from({ length }, (_, index) => index);

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }

  return indexes;
}

function resetTarget(target: SwapTarget) {
  target.run += 1;
  for (const animation of target.animations) {
    animation.cancel();
  }
  target.animations.clear();
  target.item.removeAttribute('data-letter-swap-running');
}

async function playSwap(target: SwapTarget) {
  if (target.item.hasAttribute('data-letter-swap-running')) {
    return;
  }

  target.item.dataset.letterSwapRunning = '';
  const run = target.run + 1;
  target.run = run;
  const order = shuffledIndexes(target.primaryLetters.length);
  const animations: Animation[] = [];

  order.forEach((letterIndex, sequenceIndex) => {
    const options: KeyframeAnimationOptions = {
      delay: sequenceIndex * staggerDuration,
      duration: animationDuration,
      easing: springEasing,
      fill: 'both',
    };

    animations.push(
      target.primaryLetters[letterIndex].animate(
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          {
            opacity: 0.18,
            transform: `translate3d(0, ${swapDistance}, 0)`,
            offset: 0.66,
          },
          {
            opacity: 0.18,
            transform: `translate3d(0, ${swapDistance}, 0)`,
          },
        ],
        options,
      ),
      target.secondaryLetters[letterIndex].animate(
        [
          {
            opacity: 0.18,
            transform: `translate3d(0, -${swapDistance}, 0)`,
          },
          {
            opacity: 1,
            transform: 'translate3d(0, 0, 0)',
            offset: 0.66,
          },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ],
        options,
      ),
    );
  });

  for (const animation of animations) {
    target.animations.add(animation);
  }

  await Promise.allSettled(animations.map((animation) => animation.finished));

  if (target.run !== run) {
    return;
  }

  // Both layers contain the same glyph. Cancelling once the secondary layer is
  // in place invisibly returns control to the original layer for the next run.
  resetTarget(target);
}

function createTextLayer(className: string, text: string, ariaHidden = true) {
  const layer = document.createElement('span');
  layer.className = className;
  if (ariaHidden) {
    layer.setAttribute('aria-hidden', 'true');
  }
  layer.textContent = text;
  return layer;
}

function findLabel(item: HTMLElement) {
  if (item.classList.contains('VPNavBarMenuLink')) {
    return item.querySelector<HTMLElement>(':scope > span');
  }

  return item.querySelector<HTMLElement>(
    ':scope > .button > .text > span:not(.text-icon)',
  );
}

function decorateItem(item: HTMLElement) {
  if (targets.has(item)) {
    return;
  }

  const label = findLabel(item);
  const text = label?.textContent ?? '';
  if (!label || !text || label.hasAttribute('data-navbar-letter-swap')) {
    return;
  }

  const accessibleText = createTextLayer(
    'navbar-letter-swap__accessible',
    text,
    false,
  );
  const measure = createTextLayer('navbar-letter-swap__measure', text);
  const visual = document.createElement('span');
  visual.className = 'navbar-letter-swap__visual';
  visual.setAttribute('aria-hidden', 'true');

  const primaryLetters: HTMLElement[] = [];
  const secondaryLetters: HTMLElement[] = [];

  for (const letter of Array.from(text)) {
    const cell = document.createElement('span');
    cell.className = 'navbar-letter-swap__cell';

    const primary = createTextLayer(
      'navbar-letter-swap__letter navbar-letter-swap__letter--primary',
      letter,
    );
    const secondary = createTextLayer(
      'navbar-letter-swap__letter navbar-letter-swap__letter--secondary',
      letter,
    );

    primaryLetters.push(primary);
    secondaryLetters.push(secondary);
    cell.append(primary, secondary);
    visual.append(cell);
  }

  label.textContent = '';
  label.classList.add('navbar-letter-swap');
  label.dataset.navbarLetterSwap = '';
  label.append(accessibleText, measure, visual);

  const target: SwapTarget = {
    animations: new Set(),
    hoverPlayed: false,
    item,
    label,
    onFocus: () => {
      target.hoverPlayed = true;
      void playSwap(target);
    },
    onPointerEnter: () => {
      if (!target.hoverPlayed) {
        target.hoverPlayed = true;
        void playSwap(target);
      }
    },
    onPointerLeave: () => {
      target.hoverPlayed = false;
    },
    // Covers the common refresh case where the pointer is already resting on
    // Home before this client-only enhancement attaches its enter listener.
    onPointerMove: () => {
      if (!target.hoverPlayed) {
        target.hoverPlayed = true;
        void playSwap(target);
      }
    },
    primaryLetters,
    run: 0,
    secondaryLetters,
    text,
  };

  item.addEventListener('focusin', target.onFocus);
  item.addEventListener('pointerenter', target.onPointerEnter);
  item.addEventListener('pointerleave', target.onPointerLeave);
  item.addEventListener('pointermove', target.onPointerMove, { passive: true });
  targets.set(item, target);
}

function decorateMenu() {
  decorateFrame = 0;
  if (!menu) {
    return;
  }

  for (const [item, target] of targets) {
    if (!item.isConnected || item.parentElement !== menu) {
      resetTarget(target);
      item.removeEventListener('focusin', target.onFocus);
      item.removeEventListener('pointerenter', target.onPointerEnter);
      item.removeEventListener('pointerleave', target.onPointerLeave);
      item.removeEventListener('pointermove', target.onPointerMove);
      targets.delete(item);
    }
  }

  for (const child of Array.from(menu.children)) {
    if (
      child instanceof HTMLElement &&
      (child.classList.contains('VPNavBarMenuLink') ||
        child.classList.contains('VPNavBarMenuGroup'))
    ) {
      decorateItem(child);
    }
  }
}

function queueDecoration() {
  if (!decorateFrame) {
    decorateFrame = requestAnimationFrame(decorateMenu);
  }
}

function resetAllTargets() {
  for (const target of targets.values()) {
    resetTarget(target);
  }
}

function restoreTargets() {
  for (const target of targets.values()) {
    resetTarget(target);
    target.item.removeEventListener('focusin', target.onFocus);
    target.item.removeEventListener('pointerenter', target.onPointerEnter);
    target.item.removeEventListener('pointerleave', target.onPointerLeave);
    target.item.removeEventListener('pointermove', target.onPointerMove);
    target.label.classList.remove('navbar-letter-swap');
    target.label.removeAttribute('data-navbar-letter-swap');
    target.label.textContent = target.text;
  }
  targets.clear();
}

onMounted(async () => {
  await nextTick();

  menu = document.querySelector<HTMLElement>('.VPNavBarMenu');
  if (!menu) {
    return;
  }

  menuObserver = new MutationObserver(queueDecoration);
  menuObserver.observe(menu, {
    childList: true,
  });

  decorateMenu();
});

watch(
  () => route.path,
  async () => {
    await nextTick();
    queueDecoration();
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  cancelAnimationFrame(decorateFrame);
  menuObserver?.disconnect();
  restoreTargets();
});
</script>

<template>
  <!-- VitePress owns the nav markup; this client mount progressively enhances it. -->
  <span class="navbar-letter-swap-mount" aria-hidden="true" />
</template>
