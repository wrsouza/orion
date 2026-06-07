import { defineConfig } from 'vitepress';

export default defineConfig({
  // ── Site metadata ───────────────────────────────────────────────────────────
  title: 'Orion',
  description:
    'Eloquent-inspired Active Record ORM for TypeScript — PostgreSQL, MySQL, MariaDB, SQLite, SQL Server.',
  lang: 'en-US',

  // Base URL for GitHub Pages: https://wrsouza.github.io/orion/
  base: '/orion/',

  // Clean URLs — /getting-started instead of /getting-started.html
  cleanUrls: true,

  // Generate last updated timestamp from git
  lastUpdated: true,

  // ── Head tags ────────────────────────────────────────────────────────────────
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/orion/logo.svg' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Orion ORM' }],
    ['meta', { name: 'og:description', content: 'Eloquent-inspired ORM for TypeScript' }],
  ],

  // ── Theme config ─────────────────────────────────────────────────────────────
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Orion',

    // ── Top navigation ──────────────────────────────────────────────────────
    nav: [
      { text: 'Guide', link: '/getting-started', activeMatch: '/' },
      {
        text: 'v0.1.0',
        items: [
          {
            text: 'Changelog',
            link: 'https://github.com/wrsouza/orion/blob/main/CHANGELOG.md',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/wrsouza/orion/blob/main/CONTRIBUTING.md',
          },
        ],
      },
    ],

    // ── Sidebar ─────────────────────────────────────────────────────────────
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Connection', link: '/connection' },
        ],
      },
      {
        text: 'Core',
        items: [
          { text: 'Query Builder', link: '/query-builder' },
          { text: 'Relationships', link: '/relationships' },
          { text: 'Collections', link: '/collections' },
          { text: 'Mutators & Casting', link: '/mutators-casting' },
          { text: 'Serialization', link: '/serialization' },
          { text: 'Scopes & Events', link: '/scopes-events' },
        ],
      },
      {
        text: 'Advanced',
        items: [
          { text: 'API Resources', link: '/api-resources' },
          { text: 'Factories', link: '/factories' },
          { text: 'Pagination', link: '/pagination' },
          { text: 'Soft Deletes', link: '/soft-deletes' },
          { text: 'Pruning', link: '/pruning' },
          { text: 'UUID / ULID', link: '/uuid-ulid' },
          { text: 'Schema & Migrations', link: '/schema-migrations' },
        ],
      },
    ],

    // ── Social links ────────────────────────────────────────────────────────
    socialLinks: [
      { icon: 'github', link: 'https://github.com/wrsouza/orion' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@wrsouza/orion' },
    ],

    // ── Edit link ───────────────────────────────────────────────────────────
    editLink: {
      pattern: 'https://github.com/wrsouza/orion/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    // ── Footer ──────────────────────────────────────────────────────────────
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 wrsouza',
    },

    // ── Local search (no API key needed) ────────────────────────────────────
    search: {
      provider: 'local',
    },

    // ── Last updated label ──────────────────────────────────────────────────
    lastUpdated: {
      text: 'Updated at',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'medium',
      },
    },
  },
});
