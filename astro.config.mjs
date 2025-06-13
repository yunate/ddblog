// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import * as globals from './globals.js';

// https://astro.build/config
export default defineConfig({
  site: globals.siteUrl,
  integrations: [sitemap()],
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: {
      themes: {
        light: 'github-dark',
      }
    }
  },
});