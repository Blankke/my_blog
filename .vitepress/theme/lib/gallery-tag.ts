import { ref } from 'vue';

/**
 * 画廊视图的标签筛选状态。
 * 与文章视图的 URL tag 参数（useActiveTag）相互独立，
 * 只在画廊视图内部生效，切换视图后自动重置。
 */
export const activeGalleryTag = ref('');
