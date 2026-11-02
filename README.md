# ASTRA — Digital Observatory

An immersive, scroll-driven astronomy experience: a continuous journey from Earth to the edge of the observable universe.

Chapters include Earth, Moon, Solar System, Cosmic Scale, Black Holes, Observatory (a locally computed real night sky), Star Map, Deep Space and an exoplanet atlas, Search for Life, and Humanity.

## Tech stack

- React 19 + TypeScript
- Vite 6
- Three.js + React Three Fiber (3D scenes)
- Tailwind CSS v4

ASTRA is a fully client-side static app. It has no backend, no API keys and no environment variables.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the development server         |
| `npm run build`     | Type-check and build to `dist/`      |
| `npm run preview`   | Preview the production build locally |
| `npm run typecheck` | Run the TypeScript check only        |

## Deployment

Deployed on Vercel as a static Vite site (see `vercel.json`).

## Project notes

See `PROJECT_STATUS.md` for architecture and per-chapter development notes.
