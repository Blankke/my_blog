import BlogTheme from '@sugarat/theme';
import BlogApp from './components/BlogApp.vue';
import { withConfigProvider } from './lib/sugarat';
import './custom.css';

export default {
  ...BlogTheme,
  Layout: withConfigProvider(BlogApp),
  enhanceApp(ctx) {
    BlogTheme.enhanceApp?.(ctx);
  },
};
