# HourProof

HourProof is a Next.js PWA built for the Congressional App Challenge that helps students figure out, before they start volunteering, whether their planned hours are likely to count toward the requirements they care about (e.g. CalFresh E&T work/volunteer hour rules), so they don't waste time on hours that won't qualify.

## Setup

```bash
nvm use 24
npm i
npm run dev
```

The app runs on `http://localhost:7050`.

### Node version note

`npm i` prepends every ancestor `node_modules/.bin` to `PATH`, and this machine has a stray `~/node_modules/.bin/node` that is Node 18.20.8. The project's `postinstall` script symlinks the npm-invoking Node (`$npm_node_execpath`, resolved via `nvm use 24`) into `node_modules/.bin/node`, so all `npm run` scripts in this project use Node 20+ instead of the shadowed Node 18. Verify with:

```bash
npm exec -- node -v
```

This must print `v20.9` or higher (currently v24.x), never `v18.20.8`. If `postinstall` did not run automatically (e.g. it ran in the middle of a two-step install), run `npm run postinstall` once by hand.
