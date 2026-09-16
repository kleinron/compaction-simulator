# Compaction Simulator

Discrete-event simulator of a page-view analytics compaction pipeline.
Ingested views are hashed onto `N` raw queues, batched per shard, flushed as
**one blob** onto `page_views_agg`, then written with **additive upserts**.

Live site: [https://kleinron.github.io/compaction-simulator/](https://kleinron.github.io/compaction-simulator/)

## What C means

**C = raw_views / db_upserts**

Each raw page view is one ingest event. The DB writer issues **one upsert per
`(hour, page)` leaf** in each flushed aggregate blob. Batching many views of
the same page in the same calendar hour into a single leaf raises C — more
raw traffic per database write.

Live C is counted from the run (`raw_views` and `db_upserts`), not from the
closed-form estimate.

When **only M fires** and all traffic sits in a **single hour**, occupancy
gives `E[U] = P(1-(1-1/P)^M)` and `C ≈ M/E[U]`, where **P = T/N** is the
shard size (pages per raw queue). **S** is the timeout knob in sim-seconds —
it is never the shard size.

## Pipeline

1. Ingest: page name → `{ page, timestamp }` (ISO-8601 UTC).
2. `N` queues `page_views_raw_<i>` with `i = abs(hash(page)) mod N`.
3. Each consumer merges into hour-floored counts.
4. Flush payload looks like `{ "2026-08-20T18:00:00Z": { "a": 10, "c": 21 } }`.
5. **One blob per flush** is published to `page_views_agg` (a SPOF).
6. The DB writer (also a SPOF) additive-upserts each `(hour, page)` leaf.

A batch flushes on the **earliest** of:

| Knob | Fires when |
| --- | --- |
| **S** | sim-seconds since the batch opened |
| **M** | raw messages received |

If S and M fall on the same sim instant, **M wins**. Each numeric knob is a
slider and a text box bound to the same value (clamped to that knob's
min / max / step).

Throughput: `λ = V_day / 86400` events per **sim-second**. The UI shows sim
time and wall time separately; they are not the same clock.

## Run locally

```bash
npm install
npm test
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173/compaction-simulator/`).
The dev server uses `base: '/compaction-simulator/'` so paths match GitHub Pages.

```bash
npm run build
npm run preview
```

## GitHub Pages

On every push to `main`, `.github/workflows/pages.yml` runs `npm test`,
`npm run build`, and deploys `dist/` with GitHub Pages (Actions source).
After the first merge, set the repository Pages source to **GitHub Actions**
if it is not already.

## Layout

- `src/sim/` — pure domain: hash shard, flush race, upserts, C, discrete-event engine. No React.
- `src/ui/` — knobs and the LTR pipeline visualization.
