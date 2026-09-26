# AI Use Log

| Date | File(s) | What AI did | What the team wrote/decided |
|---|---|---|---|
| 2026-09-25 | `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/smoke.test.ts`, `README.md` | Hand-scaffolded the Next 16 + React 19 + Tailwind 4 project (no `create-next-app`), pinned dependency majors, wrote the `postinstall` Node-shim script to work around a Node 18 shadow in `node_modules/.bin`, wrote the minimal app shell and a smoke test, and verified `npm test` / `npm run build` pass | Team specified the exact package versions/majors, script names, and file layout in the Phase 1 task brief before any code was written |
