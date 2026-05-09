import BlogTheme from '@sugarat/theme';
import { withConfigProvider } from '../../node_modules/@sugarat/theme/src/composables/config/blog';
import BlogApp from './components/BlogApp.vue';
import './custom.css';

export default {
  ...BlogTheme,
  Layout: withConfigProvider(BlogApp),
  enhanceApp(ctx) {
    BlogTheme.enhanceApp?.(ctx);
  },
};
