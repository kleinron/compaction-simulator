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

**Avg freshness** is the mean of `t_db − t_ingest` (sim-seconds) over views
already upserted. Views still in open batches are pending and excluded; the
sim does not flush them just to compute the mean. With stage 2 on, `t_db` is
the mid-agg DB publish, so deeper buffering raises freshness.

When **only M fires** and all traffic sits in a **single hour**, occupancy
gives `E[U] = P(1-(1-1/P)^M)` and `C ≈ M/E[U]`, where **P = T/N** is the
shard size (pages per raw queue). **S** is the timeout knob in sim-seconds —
it is never the shard size.

## Pipeline

1. Ingest: page name → `{ page, timestamp }` (ISO-8601 UTC).
2. `N` queues `page_views_raw_<i>` with `i = abs(hash(page)) mod N`.
3. Each consumer merges into hour-floored counts.
4. Flush payload looks like `{ "2026-08-20T18:00:00Z": { "pg0": 10, "pg2": 21 } }` (pages are named `pgK` for `0 <= K < T`).
5. **One blob per flush** is published to `page_views_agg` (a SPOF).
6. The DB writer (also a SPOF) additive-upserts each `(hour, page)` leaf.

A batch flushes on the **earliest** of:

| Knob | Fires when |
| --- | --- |
| **S** / **S₁** | sim-seconds since the batch opened |
| **M** / **M₁** | raw messages received |

If S and M fall on the same sim instant, **M wins**. Each numeric knob is a
slider and a text box bound to the same value (clamped to that knob's
min / max / step).

**Timeout jitter** is one global toggle covering **all** timeouts: stage-1
**S** and, when stage 2 is on, **S₂**. There are no per-stage switches. Off:
the deadline is exactly the configured S / S₂. On: each newly opened batch
(raw or mid) independently samples
`deadline = configured timeout × U(0.9, 1.1)` for that stage. Flush is still
the earliest of that sampled timeout vs M / M₂.

## Optional stage 2 (extra compaction)

Stage 2 is **deeper buffering on the same shard**, not a reliability or SPOF
feature. When enabled:

1. Each raw shard `i` still flushes on **S₁** / **M₁**.
2. That blob goes to **mid-agg `i` only** (sticky hash; same N, never N/2).
3. Mid-agg merges payloads additively, so the same `(hour, page)` across
   successive stage-1 flushes collapses before the DB.
4. The mid batch flushes on the earliest of **S₂** (sim-seconds) or **M₂**
   (count of **stage-1 blobs**, not raw views). Ties prefer M.
5. Only that mid flush publishes to `page_views_agg` and counts DB upserts.

Hero **C** is still `raw_views / db_upserts`. Merging across stage-1 flushes
can raise C and adds latency. When stage 2 is off, the pipeline is unchanged:
raw → `page_views_agg` → DB.

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

- `src/sim/` — pure domain: hash shard, S/M flush race, optional stage-2 mid-agg, upserts, C, discrete-event engine. No React.
- `src/ui/` — slider+textbox knobs, stage-2 toggle, global timeout-jitter toggle, freshness chip, and the LTR pipeline visualization.
