<div align="center">

# Wardrobe

Your clothes, extracted and organized with gpt-image.

[![License: MIT](https://img.shields.io/badge/license-MIT-191919?style=flat-square)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-191919?style=flat-square)](package.json)

[See the original post →](https://x.com/cdngdev/status/2076812846793650485)

</div>

![Wardrobe gallery](docs/screenshots/gallery.png)

![Modeled wardrobe editor](docs/screenshots/editor.png)

## Quick start

```bash
git clone https://github.com/tandpfun/wardrobe.git
cd wardrobe
npm install
cp .env.example .env
npm run dev
```

⚠️ The importer stays disabled until you add `OPENAI_API_KEY` to `.env` and place a PNG reference photo of yourself at `data/model-reference.png`.

Open [localhost:5173](http://localhost:5173).

## Import with Codex

This repo includes two Codex skills: one imports clothes and generates modeled item photos; the other styles complete outfits and generates a modeled lookbook.

```text
$import-clothes Import the clothes from ~/Pictures/outfits, create modeled photos, and add them to this wardrobe.
$generate-outfits Create modeled outfit ideas from my wardrobe.
```

Open the cloned repo in Codex and run either prompt. The import skill asks for a local model-reference PNG when needed, reviews every cutout and modeled photo, then writes to `data/library.json` and `data/imported/`. The outfit skill asks how many looks to create, then curates, generates, verifies, and saves the complete collection under `data/`.

### For agents

If you are setting up Wardrobe for a user, ask how they want to import their clothes:

- **Codex:** Ask for a folder or camera-roll location and a model-reference PNG, then extract, model, and import the individual pieces by following [the bundled import skill](.agents/skills/import-clothes/SKILL.md). Afterward, offer to create a requested number of modeled looks with [the outfit-generation skill](.agents/skills/generate-outfits/SKILL.md).
- **Web UI:** Help the user configure their own `OPENAI_API_KEY` and `data/model-reference.png`, then let them import through the app.

## What it does

- Detects every garment in a photo with the OpenAI Responses API
- Extracts clean product cutouts with the OpenAI Images API
- Generates an optional modeled editorial preview
- Keeps originals, jobs, generated images, and the JSON database local in `data/`
- Supports drag, drop, paste, editing, review, regeneration, and approval

## Configuration

| Variable | Default |
| --- | --- |
| `OPENAI_API_KEY` | Required |
| `OPENAI_VISION_MODEL` | `gpt-5.4-mini` |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` |
| `OPENAI_IMAGE_QUALITY` | `high` |
| `WARDROBE_MODEL_REFERENCE` | `data/model-reference.png` |
| `WARDROBE_DATA_DIR` | `data` |

## Fashion Studio SOL Platform Mode

The local mode described above (`npm run dev`, `data/library.json`, the import/outfit skills) is untouched and remains the default when you open [localhost:5173](http://localhost:5173) normally.

There is also a **platform mode** that connects this same app to the shared [Fashion Studio SOL](https://github.com/Juanmaes83/Fashion-Studio-SOL) persistence layer instead of the local JSON database:

```
http://localhost:5173/?platform=1
```

### What it connects to

- Platform mode talks to the **Fashion Studio SOL API** (`services/platform-api`), which persists everything in PostgreSQL rather than `data/`.
- It requires that API running locally and reachable, configured with:

  ```bash
  PLATFORM_API_URL=http://127.0.0.1:8787
  ```

  This is read by `vite.config.js` and proxied dev-side through `/platform-api`; it is **not** exposed to the client bundle.
- On load it asks for the Fashion Studio SOL admin API token (stored only in `sessionStorage`) if the API requires one.

### Production override (`?api=` / `?project=`)

`PLATFORM_API_URL` only configures the **Vite dev server proxy** — it has no effect on `vite build`/`vite preview` or on a static production deploy, since there is no dev server to proxy through. For those cases, platform mode reads the API URL and project from the page's own query string instead:

```
https://<your-deployed-wardrobe>/?platform=1&api=https://<platform-api-url>&project=sol-store
```

- In local dev, `?platform=1` alone keeps working exactly as before, resolving through `/platform-api` via the Vite proxy.
- `?project=` overrides which project is loaded (defaults to `project-sol` / `VITE_PLATFORM_PROJECT_ID` when omitted).
- `?api=` is validated before use, not trusted blindly:
  - accepted: `localhost`, `127.0.0.1` (any scheme).
  - accepted: any `https://` domain.
  - rejected: anything else (malformed URLs, or a non-loopback `http://` origin) — the app falls back to `/platform-api` and shows a warning (both in the UI and via `console.warn`) instead of using it.
- **Why:** this app asks for and stores an admin `Bearer` token to talk to the platform API. Without this check, a crafted link with `?api=https://attacker.example` could make the app send that token to an untrusted origin. The validation ensures the token only ever reaches `/platform-api`, a loopback address, or an explicit HTTPS endpoint.

`PLATFORM_API_URL` remains the right way to configure the dev proxy; it is not, by itself, the production configuration mechanism — use `?api=` for that.

### What you get in this mode

- **Prendas** (garments), **Outfits** and their assets are read live from the API/PostgreSQL — not from `data/library.json`.
- A **Trabajos** (jobs) tab shows each generation job's status, attempt count and live progress bar.
- Each outfit has a **Generar editorial** action that queues a `generate_outfit_editorial` job against the platform — editorial generation is wired to the platform's job queue and OpenAI-backed workers, not to the local import pipeline.

### Dependency

Platform mode has no backend of its own: it depends functionally on **Fashion-Studio-SOL PR #3** (`phase-2/persistence-foundation`) being run locally alongside it. It will not work stand-alone.

### Relationship to the local skills

The `import-clothes` and `generate-outfits` Codex skills described above still exist and still work exactly as before, writing to `data/library.json` and `data/imported/`. They are the **local/agent flow** of this repo.

Platform mode does not yet replace them: the heavy visual extraction they perform (garment detection with bounding boxes, cutout generation, review) has **not** been ported into Fashion Studio SOL's platform API. Platform mode currently covers reading persisted catalog data, tracking jobs, and queuing outfit-editorial generation — it is a client to the shared platform, not a reimplementation of the local extraction pipeline.

## License

[MIT](LICENSE)
