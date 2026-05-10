<script setup lang="ts">
import {
  BadgeCheck,
  Bug,
  CircleHelp,
  FlaskConical,
  Info,
  Lightbulb,
  ListTodo,
  NotebookPen,
  OctagonAlert,
  Quote,
  ScrollText,
  TriangleAlert,
} from 'lucide-vue-next';
import { useRoute } from 'vitepress';
import { h, nextTick, onMounted, render, watch } from 'vue';

const route = useRoute();

const calloutIconMap = {
  abstract: ScrollText,
  bug: Bug,
  danger: OctagonAlert,
  example: FlaskConical,
  failure: OctagonAlert,
  info: Info,
  note: NotebookPen,
  question: CircleHelp,
  quote: Quote,
  success: BadgeCheck,
  tip: Lightbulb,
  todo: ListTodo,
  warning: TriangleAlert,
} as const;

function enhanceCallouts() {
  const blocks = document.querySelectorAll<HTMLElement>(
    '.VPDoc .content main .custom-block[data-callout]',
  );

  for (const block of blocks) {
    const header = block.querySelector<HTMLElement>(
      ':scope > .custom-block-title, :scope > summary',
    );
    if (!header || header.classList.contains('has-lucide-callout-icon')) {
      continue;
    }

    const type = block.dataset.callout as
      | keyof typeof calloutIconMap
      | undefined;
    const Icon = (type && calloutIconMap[type]) || Info;
    const host = document.createElement('span');
    host.className = 'obsidian-callout-icon-host';

    header.classList.add('has-lucide-callout-icon');
    header.prepend(host);

    render(
      h(Icon, {
        'aria-hidden': 'true',
        size: 16,
        strokeWidth: 2.15,
      }),
      host,
    );
  }
}

onMounted(() => {
  nextTick(enhanceCallouts);
});

watch(
  () => route.path,
  () => {
    nextTick(enhanceCallouts);
  },
);
</script>

<template />
