/**
 * 用法示例：
 * css: { postcss: { plugins: [motionPreferenceCssPlugin()] } }
 *
 * 说明：
 * 将依赖与站点样式中的 prefers-reduced-motion 规则限定为“未手动开启动画”。
 * 这样系统偏好仍是默认值，同时允许 Navbar 开关明确覆盖系统设置。
 */
type CssAtRule = {
  params: string;
  walkRules: (callback: (rule: CssRule) => void) => void;
};

type CssRule = {
  selector?: string;
};

function splitSelectorList(selectorList: string) {
  const selectors: string[] = [];
  let current = '';
  let depth = 0;
  let quote = '';

  for (const character of selectorList) {
    if (quote) {
      current += character;
      if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }

    if (character === '(' || character === '[') {
      depth += 1;
    } else if (character === ')' || character === ']') {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      selectors.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    selectors.push(current.trim());
  }

  return selectors;
}

function scopeSelector(selector: string) {
  const guard = 'html:not([data-motion="enabled"])';

  if (selector.startsWith(guard)) {
    return selector;
  }

  if (/^html(?=[.#[:\s>+~]|$)/.test(selector)) {
    return selector.replace(/^html/, guard);
  }

  return `${guard} ${selector}`;
}

export function motionPreferenceCssPlugin() {
  return {
    postcssPlugin: 'blog-motion-preference',
    AtRule(atRule: CssAtRule) {
      if (atRule.params.trim() !== '(prefers-reduced-motion: reduce)') {
        return;
      }

      atRule.walkRules((rule) => {
        if (!rule.selector) {
          return;
        }

        rule.selector = splitSelectorList(rule.selector)
          .map(scopeSelector)
          .join(',\n');
      });
    },
  };
}
