<script setup lang="ts">
import audioLibrary from 'virtual:site-audio-library';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-vue-next';
import { useData } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface HomeAudioTrack {
  isStream?: boolean;
  label?: string;
  loop?: boolean;
  src: string;
}

interface HomeAudioLibraryTrack {
  filename: string;
  label: string;
  src: string;
}

interface HomeAudioConfig {
  defaultCollapsed?: boolean;
  enabled?: boolean;
  folder?: string;
  playlist?: HomeAudioTrack[];
  volume?: number;
}

const collapsedStorageKey = 'blankke-home-audio-collapsed-v2';
const trackStorageKey = 'blankke-home-audio-track-index';
const volumeStorageKey = 'blankke-home-audio-volume';
const muteStorageKey = 'blankke-home-audio-muted';
const defaultAudioFolder = '/audio/home/';

function normalizeTrackSrc(src: string) {
  if (!src) {
    return '';
  }

  const normalizedSrc = src.replace(/\\/g, '/');
  return normalizedSrc.startsWith('/') ? normalizedSrc : `/${normalizedSrc}`;
}

function normalizeTrackFolder(folder?: string) {
  const normalizedFolder = normalizeTrackSrc(
    folder || defaultAudioFolder,
  ).trim();
  return normalizedFolder.endsWith('/')
    ? normalizedFolder
    : `${normalizedFolder}/`;
}

function deriveTrackLabel(src: string) {
  const fileName = decodeURIComponent(src.split('/').pop() || src);
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const { frontmatter } = useData();
const blogConfig = computed(
  () => (frontmatter.value.blog || {}) as { audio?: HomeAudioConfig },
);
const audioConfig = computed<HomeAudioConfig>(
  () => blogConfig.value.audio || {},
);

const configuredFolder = computed(() => {
  return normalizeTrackFolder(audioConfig.value.folder || defaultAudioFolder);
});

const playlistOverrides = computed(() => {
  return new Map(
    (audioConfig.value.playlist || [])
      .filter((track) => !!track?.src)
      .map((track) => {
        return [normalizeTrackSrc(track.src), track] as const;
      }),
  );
});

const folderTracks = computed<HomeAudioTrack[]>(() => {
  return (audioLibrary as HomeAudioLibraryTrack[])
    .filter((track) => track.src.startsWith(configuredFolder.value))
    .map((track) => {
      const override = playlistOverrides.value.get(track.src);
      return {
        src: track.src,
        label: override?.label || track.label || deriveTrackLabel(track.src),
        loop: override?.loop ?? true,
      };
    });
});

const tracks = computed<HomeAudioTrack[]>(() => {
  if (folderTracks.value.length > 0) {
    return folderTracks.value;
  }

  return (audioConfig.value.playlist || [])
    .filter((track) => !!track?.src)
    .map((track) => {
      const normalizedSrc = normalizeTrackSrc(track.src);
      return {
        ...track,
        src: normalizedSrc,
        label:
          track.label || deriveTrackLabel(normalizedSrc) || 'Untitled Track',
      };
    });
});

const selectedTrackIndex = ref(0);
const selectedTrack = computed<HomeAudioTrack | null>(() => {
  return tracks.value[selectedTrackIndex.value] || tracks.value[0] || null;
});
const enabled = computed(
  () => audioConfig.value.enabled !== false && tracks.value.length > 0,
);
const src = computed(() => selectedTrack.value?.src || '');
const isStream = computed(() => selectedTrack.value?.isStream === true);
const label = computed(
  () =>
    selectedTrack.value?.label || (isStream.value ? 'LOFI LIVE' : 'MOTTO TAPE'),
);
const trackKindLabel = computed(() => {
  return isStream.value ? '直播流' : '本地音轨';
});
const canSwitchTracks = computed(() => tracks.value.length > 1);
const defaultLoopEnabled = computed(() => {
  return selectedTrack.value?.loop ?? !isStream.value;
});
const trackSignature = computed(() => {
  return selectedTrack.value
    ? `${selectedTrack.value.src}::${selectedTrack.value.isStream ? '1' : '0'}`
    : '';
});

const audio = ref<HTMLAudioElement | null>(null);
const currentTime = ref(0);
const duration = ref(0);
const isPlaying = ref(false);
const settingsOpen = ref(false);
const collapsed = ref(false);
const loopEnabled = ref(defaultLoopEnabled.value);
const volume = ref(Math.min(Math.max(audioConfig.value.volume ?? 0.36, 0), 1));
const muted = ref(false);
const settingsRef = ref<HTMLElement | null>(null);
const trackDurations = ref<Record<string, number>>({});
const mounted = ref(false);
let metadataLoadToken = 0;

function formatTime(value: number) {
  const safeValue = Math.max(0, Math.floor(value));
  const minutes = Math.floor(safeValue / 60);
  const seconds = String(safeValue % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const selectedTrackDuration = computed(() => {
  if (!selectedTrack.value) {
    return 0;
  }

  return trackDurations.value[selectedTrack.value.src] || 0;
});

const trackSummaryLabel = computed(() => {
  const resolvedDuration = selectedTrackDuration.value
    ? formatTime(selectedTrackDuration.value)
    : '--:--';

  if (!tracks.value.length) {
    return resolvedDuration;
  }

  if (tracks.value.length === 1) {
    return resolvedDuration;
  }

  return `${selectedTrackIndex.value + 1}/${tracks.value.length} · ${resolvedDuration}`;
});

const progressRatio = computed(() => {
  if (!duration.value) {
    return 0;
  }

  return Math.min(1, currentTime.value / duration.value);
});

const displayVolume = computed(() => {
  return muted.value ? 0 : volume.value;
});

const statusLabel = computed(() => {
  if (isStream.value) {
    return isPlaying.value ? 'LIVE' : 'READY';
  }

  return `${formatTime(currentTime.value)} / ${formatTime(duration.value)}`;
});

function syncAudioState() {
  if (!audio.value) {
    return;
  }

  audio.value.volume = muted.value ? 0 : volume.value;
  audio.value.loop = !isStream.value && loopEnabled.value;
}

function teardownAudio(target: HTMLAudioElement | null) {
  if (!target) {
    return;
  }

  target.pause();
  target.src = '';
  target.load();
}

function loadTrackDuration(src: string) {
  return new Promise<number>((resolve) => {
    const previewAudio = new Audio();
    let settled = false;

    const cleanup = () => {
      previewAudio.removeEventListener('loadedmetadata', handleResolve);
      previewAudio.removeEventListener('durationchange', handleResolve);
      previewAudio.removeEventListener('error', handleReject);
    };

    const finish = (nextDuration = 0) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      previewAudio.pause();
      previewAudio.removeAttribute('src');
      previewAudio.load();
      resolve(
        Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : 0,
      );
    };

    const handleResolve = () => {
      finish(previewAudio.duration);
    };

    const handleReject = () => {
      finish(0);
    };

    previewAudio.preload = 'metadata';
    previewAudio.addEventListener('loadedmetadata', handleResolve);
    previewAudio.addEventListener('durationchange', handleResolve);
    previewAudio.addEventListener('error', handleReject);
    previewAudio.src = src;
  });
}

async function syncTrackDurations() {
  const currentToken = ++metadataLoadToken;
  const nextDurations: Record<string, number> = {};

  await Promise.all(
    tracks.value.map(async (track) => {
      if (track.isStream) {
        return;
      }

      const nextDuration = await loadTrackDuration(track.src);
      if (!nextDuration || currentToken !== metadataLoadToken) {
        return;
      }

      nextDurations[track.src] = nextDuration;
    }),
  );

  if (currentToken !== metadataLoadToken) {
    return;
  }

  trackDurations.value = nextDurations;
}

function formatTrackOptionLabel(track: HomeAudioTrack) {
  const resolvedDuration = trackDurations.value[track.src];
  return resolvedDuration
    ? `${track.label} · ${formatTime(resolvedDuration)}`
    : track.label || deriveTrackLabel(track.src);
}

function disposeAudio() {
  teardownAudio(audio.value);
  audio.value = null;
  isPlaying.value = false;
  currentTime.value = 0;
  duration.value = 0;
}

function handlePointerDown(event: PointerEvent) {
  if (!settingsOpen.value || !settingsRef.value) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (!settingsRef.value.contains(target)) {
    settingsOpen.value = false;
  }
}

function buildAudio(options?: {
  resume?: boolean;
}) {
  const previousAudio = audio.value;
  const shouldResume =
    !!options?.resume && !!previousAudio && !previousAudio.paused;

  disposeAudio();

  if (!enabled.value || !src.value) {
    return;
  }

  const nextAudio = new Audio(src.value);
  nextAudio.preload = isStream.value ? 'none' : 'metadata';
  nextAudio.addEventListener('loadedmetadata', () => {
    duration.value = Number.isFinite(nextAudio.duration)
      ? nextAudio.duration
      : 0;
  });
  nextAudio.addEventListener('durationchange', () => {
    duration.value = Number.isFinite(nextAudio.duration)
      ? nextAudio.duration
      : 0;
  });
  nextAudio.addEventListener('timeupdate', () => {
    currentTime.value = nextAudio.currentTime;
  });
  nextAudio.addEventListener('play', () => {
    isPlaying.value = true;
  });
  nextAudio.addEventListener('pause', () => {
    isPlaying.value = false;
  });
  nextAudio.addEventListener('ended', () => {
    isPlaying.value = false;
    currentTime.value = 0;
  });

  audio.value = nextAudio;
  syncAudioState();

  if (shouldResume) {
    nextAudio.play().catch(() => {
      isPlaying.value = false;
    });
  }
}

async function togglePlayback() {
  if (!audio.value) {
    return;
  }

  if (audio.value.paused) {
    try {
      await audio.value.play();
    } catch {
      isPlaying.value = false;
    }
    return;
  }

  audio.value.pause();
}

function toggleMute() {
  muted.value = !muted.value;
}

function toggleLoop() {
  if (isStream.value) {
    return;
  }

  loopEnabled.value = !loopEnabled.value;
}

function clampTrackIndex(index: number) {
  if (!tracks.value.length) {
    return 0;
  }

  return Math.min(Math.max(index, 0), tracks.value.length - 1);
}

function handleSeek(event: MouseEvent) {
  if (isStream.value || !audio.value || !duration.value) {
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const ratio = Math.min(
    1,
    Math.max(0, (event.clientX - rect.left) / rect.width),
  );
  audio.value.currentTime = ratio * duration.value;
  currentTime.value = audio.value.currentTime;
}

onMounted(() => {
  const savedTrackIndex = window.localStorage.getItem(trackStorageKey);
  const savedVolume = window.localStorage.getItem(volumeStorageKey);
  const savedMuted = window.localStorage.getItem(muteStorageKey);
  const savedCollapsed = window.localStorage.getItem(collapsedStorageKey);

  if (savedTrackIndex) {
    const parsedTrackIndex = Number(savedTrackIndex);
    if (!Number.isNaN(parsedTrackIndex)) {
      selectedTrackIndex.value = clampTrackIndex(parsedTrackIndex);
    }
  }

  if (savedVolume) {
    const parsedVolume = Number(savedVolume);
    if (!Number.isNaN(parsedVolume)) {
      volume.value = Math.min(Math.max(parsedVolume, 0), 1);
    }
  }

  muted.value = savedMuted === 'true';
  if (savedCollapsed === 'true' || savedCollapsed === 'false') {
    collapsed.value = savedCollapsed === 'true';
  } else {
    collapsed.value = audioConfig.value.defaultCollapsed ?? true;
  }
  loopEnabled.value = defaultLoopEnabled.value;
  buildAudio();
  void syncTrackDurations();
  document.addEventListener('pointerdown', handlePointerDown);
  mounted.value = true;
});

onBeforeUnmount(() => {
  metadataLoadToken += 1;
  document.removeEventListener('pointerdown', handlePointerDown);
  disposeAudio();
});

watch([volume, muted, loopEnabled], () => {
  window.localStorage.setItem(volumeStorageKey, String(volume.value));
  window.localStorage.setItem(muteStorageKey, String(muted.value));
  syncAudioState();
});

watch(defaultLoopEnabled, (nextLoopEnabled) => {
  loopEnabled.value = nextLoopEnabled;
});

watch(collapsed, (nextCollapsed) => {
  window.localStorage.setItem(collapsedStorageKey, String(nextCollapsed));
  if (nextCollapsed) {
    settingsOpen.value = false;
  }
});

watch(tracks, (nextTracks) => {
  if (!nextTracks.length) {
    selectedTrackIndex.value = 0;
    return;
  }

  selectedTrackIndex.value = clampTrackIndex(selectedTrackIndex.value);
  if (mounted.value) {
    void syncTrackDurations();
  }
});

watch(selectedTrackIndex, (nextTrackIndex) => {
  window.localStorage.setItem(trackStorageKey, String(nextTrackIndex));
});

watch(trackSignature, () => {
  if (!mounted.value) {
    return;
  }

  buildAudio({ resume: true });
});
</script>

<template>
  <div
    v-if="enabled"
    ref="settingsRef"
    class="home-audio-dock"
    :class="{
      'home-audio-dock--collapsed': collapsed,
    }"
  >
    <div
      class="home-audio-player"
      :class="{
        'home-audio-player--playing': isPlaying,
        'home-audio-player--stream': isStream,
      }"
    >
      <div class="home-audio-disc" aria-hidden="true">
        <span class="home-audio-disc-label" />
      </div>

      <div class="home-audio-panel">
        <button
          class="home-audio-toggle"
          :aria-label="isPlaying ? '暂停音频' : '播放音频'"
          type="button"
          @click="togglePlayback"
        >
          <Pause v-if="isPlaying" :size="16" aria-hidden="true" />
          <Play v-else :size="16" aria-hidden="true" />
        </button>

        <div class="home-audio-track">
          <div class="home-audio-track-top">
            <span class="home-audio-label">{{ label }}</span>
            <span class="home-audio-badge">{{ isStream ? 'LIVE' : 'TAPE' }}</span>
          </div>

          <button
            v-if="!isStream"
            class="home-audio-progress"
            type="button"
            :aria-label="`当前播放进度 ${statusLabel}`"
            @click="handleSeek"
          >
            <span class="home-audio-progress-fill" :style="{ width: `${progressRatio * 100}%` }" />
          </button>

          <div v-else class="home-audio-wave" aria-hidden="true">
            <span v-for="index in 8" :key="index" class="home-audio-wave-bar" :style="{ '--delay': `${index * 0.08}s` }" />
          </div>

          <div class="home-audio-track-bottom">
            <span class="home-audio-status">{{ statusLabel }}</span>
            <span class="home-audio-volume">{{ Math.round(displayVolume * 100) }}%</span>
          </div>
        </div>

        <button
          class="home-audio-icon-button"
          :aria-label="muted ? '取消静音' : '静音'"
          type="button"
          @click="toggleMute"
        >
          <VolumeX v-if="muted" :size="16" aria-hidden="true" />
          <Volume2 v-else :size="16" aria-hidden="true" />
        </button>

        <div class="home-audio-settings-wrap">
          <button
            class="home-audio-icon-button"
            :aria-expanded="settingsOpen"
            aria-label="音频设置"
            type="button"
            @click="settingsOpen = !settingsOpen"
          >
            <Settings2 :size="16" aria-hidden="true" />
          </button>

          <div v-if="settingsOpen" class="home-audio-settings">
            <label v-if="canSwitchTracks" class="home-audio-settings-label">
              <span>曲目</span>
              <select v-model.number="selectedTrackIndex" class="home-audio-select">
                <option
                  v-for="(track, index) in tracks"
                  :key="track.src"
                  :value="index"
                >
                  {{ formatTrackOptionLabel(track) }}
                </option>
              </select>
            </label>

            <label class="home-audio-settings-label">
              <span>音量</span>
              <input v-model.number="volume" class="home-audio-range" type="range" min="0" max="1" step="0.01">
            </label>

            <button
              v-if="!isStream"
              class="home-audio-settings-toggle"
              type="button"
              @click="toggleLoop"
            >
              <span>循环播放</span>
              <strong>{{ loopEnabled ? '开' : '关' }}</strong>
            </button>

            <div class="home-audio-settings-meta">
              <span>{{ trackKindLabel }}</span>
              <span>{{ trackSummaryLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button
      class="home-audio-collapse"
      :aria-label="collapsed ? '展开播放器' : '收起播放器'"
      type="button"
      @click="collapsed = !collapsed"
    >
      <ChevronRight v-if="collapsed" :size="18" aria-hidden="true" />
      <ChevronLeft v-else :size="18" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.home-audio-dock {
  position: fixed;
  left: 16px;
  bottom: 18px;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(calc(100vw - 16px), 520px);
  transition: transform 0.28s ease;
}

.home-audio-dock--collapsed {
  transform: translateX(calc(-100% + 42px));
}

.home-audio-player {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  max-width: min(100%, 460px);
}

.home-audio-disc {
  position: relative;
  flex: 0 0 auto;
  width: 58px;
  height: 58px;
  border-radius: 999px;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.18) 0 8px, transparent 8px),
    repeating-radial-gradient(
      circle at center,
      rgba(9, 15, 20, 0.92) 0 5px,
      rgba(46, 59, 68, 0.92) 5px 8px
    );
  box-shadow:
    0 10px 22px rgba(17, 31, 40, 0.18),
    inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}

.home-audio-disc::before,
.home-audio-disc::after {
  content: "";
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: inherit;
}

.home-audio-disc::after {
  inset: 20px;
  border-color: rgba(255, 255, 255, 0.16);
}

.home-audio-disc-label {
  position: absolute;
  inset: 22px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(84, 142, 214, 0.86), rgba(48, 91, 164, 0.9));
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.18);
}

.home-audio-player--playing .home-audio-disc {
  animation: home-audio-spin 4.8s linear infinite;
}

.home-audio-panel {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid var(--home-card-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.42);
  box-shadow: var(--home-card-shadow);
  backdrop-filter: blur(10px);
}

.home-audio-player--playing .home-audio-panel {
  border-color: rgba(78, 127, 207, 0.28);
  box-shadow: 0 8px 22px rgba(55, 93, 167, 0.12);
}

.home-audio-toggle,
.home-audio-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 999px;
  background: var(--home-card-inner-bg);
  color: var(--vp-c-brand-1);
  transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.home-audio-toggle:hover,
.home-audio-icon-button:hover {
  border-color: var(--home-card-border-hover);
  background: var(--home-card-inner-bg-hover);
  transform: translateY(-1px);
}

.home-audio-track {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
}

.home-audio-track-top,
.home-audio-track-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.home-audio-label {
  color: var(--vp-c-text-1);
  font-family: var(--font-family-code);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.home-audio-badge,
.home-audio-status,
.home-audio-volume {
  font-family: var(--font-family-code);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.home-audio-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(74, 127, 212, 0.12);
  color: var(--vp-c-brand-1);
}

.home-audio-status,
.home-audio-volume {
  color: var(--vp-c-text-2);
}

.home-audio-progress {
  position: relative;
  display: block;
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(83, 106, 92, 0.15);
}

.home-audio-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(86, 126, 198, 0.9), rgba(61, 171, 179, 0.82));
}

.home-audio-wave {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 14px;
}

.home-audio-wave-bar {
  display: block;
  width: 4px;
  height: 30%;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(91, 149, 217, 0.85), rgba(66, 196, 180, 0.75));
  opacity: 0.36;
}

.home-audio-player--playing .home-audio-wave-bar {
  animation: home-audio-wave 0.7s ease-in-out infinite alternate;
  animation-delay: var(--delay);
  opacity: 0.9;
}

.home-audio-settings-wrap {
  position: relative;
}

.home-audio-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 88px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--vp-c-brand-1);
  backdrop-filter: none;
  transition: color 0.2s ease, transform 0.2s ease;
}

.home-audio-collapse:hover {
  color: var(--vp-c-brand-2);
  transform: translateX(-1px);
}

.home-audio-settings {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  z-index: 20;
  width: 208px;
  padding: 12px;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 30px rgba(29, 45, 52, 0.16);
  transform-origin: bottom right;
}

.home-audio-settings-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--vp-c-text-1);
  font-size: 12px;
}

.home-audio-range {
  width: 100%;
}

.home-audio-select {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 10px;
  background: var(--home-card-inner-bg);
  color: var(--vp-c-text-1);
}

.home-audio-settings-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 12px;
  background: var(--home-card-inner-bg);
  color: var(--vp-c-text-1);
  font-size: 12px;
}

.home-audio-settings-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  color: var(--vp-c-text-2);
  font-family: var(--font-family-code);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@media screen and (max-width: 767px) {
  .home-audio-dock {
    left: 8px;
    right: 8px;
    bottom: 12px;
    max-width: calc(100vw - 8px);
  }

  .home-audio-dock--collapsed {
    transform: translateX(calc(-100% + 38px));
  }

  .home-audio-player {
    width: min(100%, calc(100vw - 54px));
    gap: 12px;
  }

  .home-audio-panel {
    width: 100%;
  }

  .home-audio-collapse {
    width: 24px;
  }

  .home-audio-track {
    min-width: 0;
    flex: 1 1 auto;
  }
}

@keyframes home-audio-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes home-audio-wave {
  from {
    height: 30%;
  }

  to {
    height: 100%;
  }
}

:global(html.dark) .home-audio-disc {
  box-shadow:
    0 10px 22px rgba(0, 0, 0, 0.34),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

:global(html.dark) .home-audio-panel {
  background: rgba(20, 20, 20, 0.76);
}

:global(html.dark) .home-audio-settings {
  background: rgba(20, 20, 20, 0.96);
}
</style>
