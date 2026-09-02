/**
 * 用法示例：
 * const { motionEnabled } = useMotionPreference();
 * const { canAnimateAppearance } = useAppearanceTransition(true, motionEnabled);
 * <Layout :class="{ 'blog-theme-layout': canAnimateAppearance }" />
 *
 * 说明：
 * 统一处理站点的深浅色切换。
 * 支持 View Transition 的环境使用整页扩散动画，
 * 不支持时退回到 VitePress 默认开关动画，避免 Windows 下出现“完全没动效”的体验。
 */
import { useData } from 'vitepress';
import {
  type Ref,
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
} from 'vue';

type ThemeToggleEvent = MouseEvent | undefined;

interface ViewTransitionController {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (
    update: () => Promise<void> | void,
  ) => ViewTransitionController;
};

function supportsViewTransition() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const transitionDocument = document as ViewTransitionDocument;
  return typeof transitionDocument.startViewTransition === 'function';
}

export function useAppearanceTransition(
  enableTransition: boolean,
  motionEnabled: Readonly<Ref<boolean>>,
) {
  const { isDark } = useData();
  const viewTransitionSupported = ref(false);
  const canAnimateAppearance = computed(
    () =>
      enableTransition && motionEnabled.value && viewTransitionSupported.value,
  );

  let appearanceTransition: ViewTransitionController | undefined;
  let revealAnimation: Animation | undefined;
  let transitionRunning = false;

  const syncAvailability = () => {
    viewTransitionSupported.value = supportsViewTransition();
  };

  provide('toggle-appearance', async (event: ThemeToggleEvent) => {
    syncAvailability();

    // 首次主题截图合成完成前忽略重复点击，避免重叠转场在末尾闪回旧主题。
    if (transitionRunning) {
      return;
    }

    if (!canAnimateAppearance.value) {
      isDark.value = !isDark.value;
      return;
    }

    const transitionDocument = document as ViewTransitionDocument;
    const nextIsDark = !isDark.value;
    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? window.innerHeight / 2;
    const endRadius =
      Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      ) + 2;
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ];

    transitionRunning = true;
    document.documentElement.dataset.appearanceTransition = 'running';

    try {
      appearanceTransition = transitionDocument.startViewTransition?.(
        async () => {
          isDark.value = nextIsDark;
          await nextTick();
        },
      );

      if (!appearanceTransition) {
        isDark.value = nextIsDark;
        return;
      }

      await appearanceTransition.ready;

      revealAnimation = document.documentElement.animate(
        {
          clipPath: nextIsDark ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 460,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
          // 保持末帧裁剪，直到 View Transition 移除截图，避免旧截图短暂恢复为全屏。
          fill: 'both',
          pseudoElement: `::view-transition-${nextIsDark ? 'old' : 'new'}(root)`,
        },
      );

      await revealAnimation.finished;
      await appearanceTransition.finished;
    } catch {
      // 页面失去可见性时浏览器可能中止转场，主题状态仍应落到用户请求的结果。
      isDark.value = nextIsDark;
    } finally {
      revealAnimation?.cancel();
      revealAnimation = undefined;
      appearanceTransition = undefined;
      transitionRunning = false;
      delete document.documentElement.dataset.appearanceTransition;
    }
  });

  onMounted(() => {
    syncAvailability();
  });

  onBeforeUnmount(() => {
    revealAnimation?.cancel();
    appearanceTransition?.skipTransition?.();
    delete document.documentElement.dataset.appearanceTransition;
  });

  return {
    canAnimateAppearance,
  };
}
