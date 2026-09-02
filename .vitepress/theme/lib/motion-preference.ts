/**
 * 用法示例：
 * const { motionEnabled } = useMotionPreference();
 * const { motionEnabled } = useMotionPreferenceController(); // 仅在根布局调用一次
 *
 * 说明：
 * 用户未设置时跟随系统的“减少动态效果”偏好；用户操作开关后，
 * 使用本地持久化的明确状态，并同步到 html[data-motion] 供 CSS 使用。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const storageKey = 'blog-motion-preference';

type MotionPreferenceSource = 'system' | 'user';

function readSystemPreference() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function readUserPreference() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'enabled') {
      return true;
    }
    if (stored === 'disabled') {
      return false;
    }
  } catch {
    // 存储不可用时仍可在当前页面使用系统偏好。
  }

  return null;
}

const systemPrefersReducedMotion = ref(readSystemPreference());
const userPreference = ref<boolean | null>(readUserPreference());

const motionEnabled = computed(
  () => userPreference.value ?? !systemPrefersReducedMotion.value,
);
const preferenceSource = computed<MotionPreferenceSource>(() =>
  userPreference.value === null ? 'system' : 'user',
);

let mediaQuery: MediaQueryList | undefined;

function syncDocumentState() {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.motion = motionEnabled.value
    ? 'enabled'
    : 'disabled';
  document.documentElement.dataset.motionSource = preferenceSource.value;
}

function handleSystemPreferenceChange(event: MediaQueryListEvent) {
  systemPrefersReducedMotion.value = event.matches;
  syncDocumentState();
}

function startPreferenceSync() {
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  systemPrefersReducedMotion.value = mediaQuery.matches;
  syncDocumentState();

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemPreferenceChange);
    return;
  }

  mediaQuery.addListener(handleSystemPreferenceChange);
}

function stopPreferenceSync() {
  if (!mediaQuery) {
    return;
  }

  if (typeof mediaQuery.removeEventListener === 'function') {
    mediaQuery.removeEventListener('change', handleSystemPreferenceChange);
  } else {
    mediaQuery.removeListener(handleSystemPreferenceChange);
  }

  mediaQuery = undefined;
}

function setMotionEnabled(enabled: boolean) {
  userPreference.value = enabled;

  try {
    window.localStorage.setItem(storageKey, enabled ? 'enabled' : 'disabled');
  } catch {
    // 当前页面中的状态仍然有效。
  }

  syncDocumentState();
}

function toggleMotion() {
  setMotionEnabled(!motionEnabled.value);
}

export function useMotionPreference() {
  return {
    motionEnabled,
    preferenceSource,
    setMotionEnabled,
    toggleMotion,
  };
}

export function useMotionPreferenceController() {
  onMounted(startPreferenceSync);
  onBeforeUnmount(stopPreferenceSync);

  return useMotionPreference();
}
