import { useRoute } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export type HomeViewMode = 'articles' | 'gallery';

function resolveHomeView(search: string) {
  const searchParams = new URLSearchParams(search);
  return searchParams.get('view') === 'gallery' ? 'gallery' : 'articles';
}

export function useHomeView() {
  const route = useRoute();
  const currentView = ref<HomeViewMode>('articles');

  const isHomeRoute = computed(() => {
    return route.path === '/' || route.path === '/index.html';
  });

  function syncViewFromLocation() {
    if (!isHomeRoute.value || typeof window === 'undefined') {
      currentView.value = 'articles';
      return;
    }

    currentView.value = resolveHomeView(window.location.search);
  }

  function setView(nextView: HomeViewMode) {
    if (!isHomeRoute.value || typeof window === 'undefined') {
      return;
    }

    if (currentView.value === nextView) {
      return;
    }

    const nextUrl = nextView === 'gallery' ? '/?view=gallery' : '/';

    currentView.value = nextView;
    window.history.pushState(window.history.state, '', nextUrl);
  }

  function handlePopState() {
    syncViewFromLocation();
  }

  onMounted(() => {
    syncViewFromLocation();
    window.addEventListener('popstate', handlePopState);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('popstate', handlePopState);
  });

  watch(
    () => route.path,
    () => {
      syncViewFromLocation();
    },
    { immediate: true },
  );

  const view = computed<HomeViewMode>(() => currentView.value);

  const isGalleryView = computed(() => {
    return view.value === 'gallery';
  });

  return {
    isGalleryView,
    isHomeRoute,
    setView,
    view,
  };
}
