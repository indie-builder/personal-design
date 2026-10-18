# Personal Design

English · [中文](README.zh-CN.md)

A personal design collection. The homepage lists the work on a timeline ordered by launch date, and each entry opens a fully browsable product built on real content. The site runs on TanStack Start, Tailwind CSS v4, and a pnpm workspace.

## Products

| Product | What you can do |
| --- | --- |
| [Layout Compositions](apps/web/src/routes/products/layout-compositions.tsx) | Browse 350 typographic layout studies across 8 categories and themes; search, page through the two-page album, and click any image to zoom. |
| [Muse](apps/web/src/routes/products/muse) | Browse images and videos by Chinese category or keyword; more works load as you scroll, with details, authors, and links to the originals. |
| [Design Engineer Tools](apps/web/src/routes/products/design-engineer-tools.tsx) | Browse design-engineering tools by category and open each one on its original site. |
| [Personal Sites](apps/web/src/routes/products/personal-sites.tsx) | Watch a 36-second promo video, then open the independently deployed personal website. |
| [AI Coding Dictionary](apps/web/src/routes/products/ai-coding-dictionary.tsx) | Explore terminology in a searchable knowledge graph and read the Chinese and English text side by side, paragraph by paragraph. |
| [AI Chat](apps/web/src/routes/products/ai-chat.tsx) | Pick or create an agent and converse in text, tables, charts, and interactive cards; conversations are kept in your browser. |
| [Word Arcade](apps/web/src/routes/products/word-arcade.tsx) | Play five local mini-games that use headline text as their target; switch games, pause, and restart at any time. |

## Run locally

You need Node.js 24, pnpm 12, and [Portless](https://github.com/vercel-labs/portless) installed globally. Development and local production preview both go through Portless at <https://personal-design.localhost>, so there is no app port to manage.

```bash
npm install -g portless          # skip if already installed
pnpm install
pnpm dev
```

The first run starts an HTTPS proxy and trusts the local certificate; on macOS/Linux it may ask for your sudo password to bind port 443. For a production preview, run `pnpm build` and then `pnpm start`. Both modes share one domain, so stop the running one with Ctrl+C before switching. Git worktrees get their own subdomain. Use the URL from the startup log.

## Contributing

This is a personal collection maintained by one owner. Development commands, repository layout, and content update boundaries are documented in [CONTRIBUTING.md](CONTRIBUTING.md). Page behavior contracts live in [docs/design/README.md](docs/design/README.md), and product boundaries in [PRODUCT.md](PRODUCT.md).

## Credits

Layout Compositions adapts [nevertoday/350-layout-compositions](https://github.com/nevertoday/350-layout-compositions), used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
