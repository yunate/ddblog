import { defineConfig } from 'vitepress'
import { getSidebarItems } from "./utils.js";

const sidebar = getSidebarItems();
console.log(sidebar);

export default defineConfig({
  title: "yunate",
  description: "Yunate's blog",
  srcDir: "../../md",
  themeConfig: {
    i18nRouting: false,
    nav: [
      { text: 'Home', link: '/' },
    ],
    logo: '/my-logo.svg',
    sidebar: [{
      items: sidebar
    }],
    search: {
      provider: 'local'
    },
    docFooter: {
      prev: false,
      next: false,
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/yunate' }
    ]
  }
})
