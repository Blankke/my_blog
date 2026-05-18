/**
 * 用法示例：
 * const { canAnimateAppearance } = useAppearanceTransition(true);
 * <Layout :class="{ 'blog-theme-layout': canAnimateAppearance }" />
 *
 * 说明：
 * 统一处理站点的深浅色切换。
 * 支持 View Transition 的环境使用整页扩散动画，
 * 不支持时退回到 VitePress 默认开关动画，避免 Windows 下出现“完全没动效”的体验。
 */
import { useData } from 'vitepress';
import { nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue';

type ThemeToggleEvent = MouseEvent | undefined;

interface ViewTransitionController {
  ready: Promise<void>;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (
    update: () => Promise<void> | void,
  ) => ViewTransitionController;
};

function canUseViewTransition(enableTransition: boolean) {
  if (
    !enableTransition ||
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return false;
  }

  const transitionDocument = document as ViewTransitionDocument;
  return (
    typeof transitionDocument.startViewTransition === 'function' &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  );
}

export function useAppearanceTransition(enableTransition = true) {
  const { isDark } = useData();
  const canAnimateAppearance = ref(false);

  let mediaQuery: MediaQueryList | undefined;

  const syncAvailability = () => {
    canAnimateAppearance.value = canUseViewTransition(enableTransition);
  };

  provide('toggle-appearance', async (event: ThemeToggleEvent) => {
    syncAvailability();

    if (!canAnimateAppearance.value) {
      isDark.value = !isDark.value;
      return;
    }

    const transitionDocument = document as ViewTransitionDocument;
    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ];

    const transition = transitionDocument.startViewTransition?.(async () => {
      isDark.value = !isDark.value;
      await nextTick();
    });

    await transition?.ready;

    document.documentElement.animate(
      {
        clipPath: isDark.value ? [...clipPath].reverse() : clipPath,
      },
      {
        duration: 320,
        easing: 'ease-in',
        pseudoElement: `::view-transition-${isDark.value ? 'old' : 'new'}(root)`,
      },
    );
  });

  const handleMotionPreferenceChange = () => {
    syncAvailability();
  };

  onMounted(() => {
    syncAvailability();

    mediaQuery = window.matchMedia('(prefers-reduced-motion: no-preference)');

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMotionPreferenceChange);
      return;
    }

    mediaQuery.addListener(handleMotionPreferenceChange);
  });

  onBeforeUnmount(() => {
    if (!mediaQuery) {
      return;
    }

    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', handleMotionPreferenceChange);
      return;
    }

    mediaQuery.removeListener(handleMotionPreferenceChange);
  });

  return {
    canAnimateAppearance,
  };
}
