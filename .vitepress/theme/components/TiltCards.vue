<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

type TiltProfile = {
  tiltLimit: number;
  scale: number;
  perspective: number;
  liftY: number;
  liftZ: number;
};

type TiltTarget = {
  card: HTMLElement;
  sensor: HTMLElement;
  profile: TiltProfile;
};

const articleProfile: TiltProfile = {
  tiltLimit: 5,
  scale: 1.008,
  perspective: 1400,
  liftY: -1,
  liftZ: 10,
};

const galleryProfile: TiltProfile = {
  tiltLimit: 11,
  scale: 1.025,
  perspective: 1100,
  liftY: -3,
  liftZ: 20,
};

const direction = -1;
const liftDuration = 110;
const resetDuration = 280;

let activeTarget: TiltTarget | null = null;
let spotlight: HTMLDivElement | null = null;
let detachTimer = 0;
let liftTimer = 0;
let liftFrame = 0;
let pointerFrame = 0;
let pointerX = 0;
let pointerY = 0;
const resetTimers = new Map<HTMLElement, number>();

function findTarget(target: EventTarget | null): TiltTarget | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const articleSensor = target.closest<HTMLElement>(
    '.VPHome .home-feed-list-item',
  );
  const articleCard =
    articleSensor?.querySelector<HTMLElement>('.home-feed-card');
  if (articleSensor && articleCard) {
    return {
      card: articleCard,
      sensor: articleSensor,
      profile: articleProfile,
    };
  }

  const gallerySensor = target.closest<HTMLElement>(
    '.VPHome .gallery-feed-grid-item',
  );
  const galleryCard = gallerySensor?.querySelector<HTMLElement>(
    '.gallery-card-media',
  );
  if (gallerySensor && galleryCard) {
    return {
      card: galleryCard,
      sensor: gallerySensor,
      profile: galleryProfile,
    };
  }

  return null;
}

function buildTransform(
  profile: TiltProfile,
  rotateX = 0,
  rotateY = 0,
  lifted = true,
) {
  const liftY = lifted ? profile.liftY : 0;
  const liftZ = lifted ? profile.liftZ : 0;
  const scale = lifted ? profile.scale : 1;

  return [
    `perspective(${profile.perspective}px)`,
    `translate3d(0, ${liftY}px, ${liftZ}px)`,
    `rotateX(${rotateX}deg)`,
    `rotateY(${rotateY}deg)`,
    `scale3d(${scale}, ${scale}, ${scale})`,
  ].join(' ');
}

function setTransform(card: HTMLElement, transform: string) {
  card.style.setProperty('transform', transform, 'important');
}

function resetCard(target: TiltTarget) {
  const { card, profile } = target;
  card.removeAttribute('data-tilt-card-active');
  card.dataset.tiltCardPhase = 'resetting';
  setTransform(card, buildTransform(profile, 0, 0, false));

  const previousTimer = resetTimers.get(card);
  if (previousTimer) {
    window.clearTimeout(previousTimer);
  }

  const resetTimer = window.setTimeout(() => {
    if (card !== activeTarget?.card) {
      card.style.removeProperty('transform');
      card.removeAttribute('data-tilt-card-phase');
    }
    resetTimers.delete(card);
  }, resetDuration);
  resetTimers.set(card, resetTimer);
}

function updateSpotlightPosition(px: number, py: number) {
  const card = activeTarget?.card;
  if (!card) {
    return;
  }

  card.style.setProperty('--tilt-spotlight-x', `${px * 100}%`);
  card.style.setProperty('--tilt-spotlight-y', `${py * 100}%`);
}

function applyPointerPosition() {
  pointerFrame = 0;
  if (!activeTarget) {
    return;
  }

  const { card, sensor, profile } = activeTarget;
  const bounds = sensor.getBoundingClientRect();
  const px = Math.min(1, Math.max(0, (pointerX - bounds.left) / bounds.width));
  const py = Math.min(1, Math.max(0, (pointerY - bounds.top) / bounds.height));
  updateSpotlightPosition(px, py);

  if (card.dataset.tiltCardPhase === 'lifting') {
    return;
  }

  const rotateX = (py - 0.5) * (profile.tiltLimit * 2) * direction;
  const rotateY = (px - 0.5) * -(profile.tiltLimit * 2) * direction;
  setTransform(card, buildTransform(profile, rotateX, rotateY));
}

function queuePointerPosition() {
  if (!pointerFrame) {
    pointerFrame = requestAnimationFrame(applyPointerPosition);
  }
}

function attachSpotlight(target: TiltTarget) {
  if (!spotlight || activeTarget?.card === target.card) {
    return;
  }

  window.clearTimeout(detachTimer);
  window.clearTimeout(liftTimer);
  cancelAnimationFrame(liftFrame);

  if (activeTarget) {
    resetCard(activeTarget);
  }

  activeTarget = target;
  const { card, profile } = target;
  card.dataset.tiltCardReady = '';
  card.dataset.tiltCardActive = '';
  card.dataset.tiltCardPhase = 'lifting';
  card.append(spotlight);

  setTransform(card, buildTransform(profile, 0, 0, false));
  void card.offsetWidth;
  liftFrame = requestAnimationFrame(() => {
    if (activeTarget?.card === card) {
      setTransform(card, buildTransform(profile));
    }
  });

  liftTimer = window.setTimeout(() => {
    if (activeTarget?.card === card) {
      card.dataset.tiltCardPhase = 'tilting';
      applyPointerPosition();
    }
  }, liftDuration);
}

function clearActiveCard() {
  if (!activeTarget) {
    return;
  }

  const previousSpotlight = spotlight;
  const previousTarget = activeTarget;
  activeTarget = null;
  window.clearTimeout(liftTimer);
  cancelAnimationFrame(liftFrame);
  cancelAnimationFrame(pointerFrame);
  pointerFrame = 0;
  resetCard(previousTarget);

  window.clearTimeout(detachTimer);
  detachTimer = window.setTimeout(() => {
    if (!activeTarget && previousSpotlight?.isConnected) {
      previousSpotlight.remove();
    }
  }, 300);
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch') {
    return;
  }

  const target = findTarget(event.target);
  if (!target) {
    clearActiveCard();
    return;
  }

  pointerX = event.clientX;
  pointerY = event.clientY;
  attachSpotlight(target);
  queuePointerPosition();
}

onMounted(() => {
  spotlight = document.createElement('span');
  spotlight.className = 'tilt-card-spotlight';
  spotlight.setAttribute('aria-hidden', 'true');

  const glow = document.createElement('span');
  glow.className = 'tilt-card-spotlight-glow';
  spotlight.append(glow);

  document.addEventListener('pointermove', handlePointerMove, {
    passive: true,
  });
  document.documentElement.addEventListener('pointerleave', clearActiveCard);
  window.addEventListener('blur', clearActiveCard);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', handlePointerMove);
  document.documentElement.removeEventListener('pointerleave', clearActiveCard);
  window.removeEventListener('blur', clearActiveCard);
  window.clearTimeout(detachTimer);
  window.clearTimeout(liftTimer);
  cancelAnimationFrame(liftFrame);
  cancelAnimationFrame(pointerFrame);
  for (const resetTimer of resetTimers.values()) {
    window.clearTimeout(resetTimer);
  }
  resetTimers.clear();
  activeTarget?.card.style.removeProperty('transform');
  activeTarget?.card.removeAttribute('data-tilt-card-active');
  spotlight?.remove();
});
</script>

<template>
  <span class="tilt-cards-controller" aria-hidden="true" />
</template>
