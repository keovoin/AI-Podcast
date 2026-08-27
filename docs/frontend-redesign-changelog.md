# Frontend Redesign — Fragments Design Language & Bug Fixes

**Date:** 2026-08-27
**Repo:** keovoin/AI-Podcast (clone `/workspace/AI-Podcast`)
**Branch:** main (working tree)

## 🎨 Design Language: usefragments.com

Applied the Fragments component patterns (accessible Base-UI-inspired primitives, design tokens, Card/Stack/Field ergonomics, EmptyState/Skeleton/Dialog feedback patterns) to the whole frontend.

### Design tokens (`src/app/globals.css`, `tailwind.config.ts`)
- Richer token set: added `success` / `warning` color tokens, `--shadow-card` / `--shadow-popover` elevation tokens, radius bumped to `0.75rem`.
- New utilities: `.focus-ring`, `.skip-link`, `.status-dot`, `.card-lift`, `text-balance`, `prefers-reduced-motion` guard.
- **Khmer-first typography:** `Noto Sans Khmer` (400/500/600/700) loaded via `next/font/google` with `subsets: ['khmer','latin']`; `.font-khmer` class with 1.7 line-height for stacked Khmer diacritics; font wired as `--font-noto-sans-khmer` → Tailwind `font-sans`.
- Theme: `html lang="km"` (was `en`), dark theme via CSS vars, `themeColor` viewport metadata.

### New UI primitives (`src/components/ui/`)
- `dialog.tsx` — accessible modal (Esc close, focus trap, focus return, body scroll lock, aria-modal/labelledby) replacing `window.alert/confirm`.
- `skeleton.tsx` — shimmer loading placeholders.
- `empty-state.tsx` — Fragments-style blank-state with icon + CTA.
- `progress.tsx` — accessible progressbar with aria-valuenow.
- `select.tsx` — styled select with chevron.
- `textarea.tsx` — styled multiline input.
- Polished: `badge.tsx` (success/warning tokens + `dot` prop), `button.tsx` (active scale, `icon-sm` size), `card.tsx` (elevation shadow).

### Layout (`src/app/(dashboard)/layout.tsx`)
- Fragments AppShell/Header pattern: sticky blurred header, icon nav with active states, **mobile-responsive** (hamburger + collapsible drawer — fixes the fixed `space-x-6` overflow).
- **Skip-to-content link** for keyboard users.
- Footer with Khmer tagline.

## 🐛 Bug Fixes (from review)

1. **RoutingExplanation 404** — `src/components/routing/routing-explanation.tsx`: `POST /api/routing/recommend` → `POST /api/routing` (the only routing route). Added loading skeletons, `role="alert"` error, accessible toggle buttons with `aria-pressed`, non-color status markers.
2. **provider-form `{{variables}}` typo** — verified already fixed (line 370 uses `{'Request Template (JSON with {{variables}})'}` string expression).
3. **Mobile nav overflow** — fixed in layout (drawer pattern above).
4. **Timeline `setInterval` leak + O(n²)** — `projects/[id]/timeline/page.tsx`: timer now cleaned up on unmount via effect cleanup; per-turn offsets precomputed in one O(n) pass (`turnOffsets` Map); `useMemo` for speaker maps; seek slider is a real `role="slider"` with arrow-key support; playhead/turn rows accessible buttons.
5. **`alert()`/`confirm()` → accessible Dialog** — replaced in `benchmark/page.tsx` (save error dialog), `providers/page.tsx` (delete confirmation dialog), `speakers/page.tsx` (delete confirmation dialog). **Zero `alert(`/`confirm(` remain in `src/`** (verified by grep).
6. **Accessibility** — skip-link, aria-labels on icon buttons/range inputs, `aria-pressed` toggles, `role="alert"`/`role="status"`, non-color status (✓/◐/• symbols + labels in badges/steppers), `prefers-reduced-motion`.

## 📄 Page Redesigns

- **Landing page** (`src/app/page.tsx`): Fragments-style hero with Khmer title, ambient gradient blobs, badge, CTA buttons, 3-step pipeline, 6 feature cards.
- **Projects list** (`projects/page.tsx`): card grid with **episode thumbnails** (`thumbnailUrl` from the new thumbnail endpoint), status badges with dot markers, Skeleton loading, EmptyState, card hover lift.
- **Project detail** (`projects/[id]/page.tsx`): thumbnail in header, production-pipeline stepper (outline→dialogue→validate→audio→export), **deduplicated 3× add-turn form** into one `AddTurnForm` component, dialogs for delete/validation, skeletons.
- **Timeline** (`projects/[id]/timeline/page.tsx`): full redesign + bug fixes above.
- **New podcast wizard** (`projects/new/page.tsx`): Fragments stepper (numbered, non-color), segmented routing-mode buttons, speaker cards with sliders, review summary.
- **Providers / Speakers / Benchmark / Exports / Usage**: inherit the new design language automatically via shared primitives; alert/confirm replaced with Dialog.

## ✅ Thumbnail Integration

- Frontend surfaces `project.thumbnailUrl` (added to Prisma schema + thumbnail endpoint by the audio pipeline) on:
  - Project cards (1200×630 poster with language badge overlay)
  - Project detail header
- The GET thumbnail route lazily generates the poster when absent, so cards always render.

## ✅ Verification

- `npx tsc --noEmit`: **no errors in any frontend file touched by this redesign**. (4 remaining errors are in the Voice AI backend files `audio/route.ts` + `azure-speech-tts.ts` — out of frontend scope.)
- `npx vitest run`: 273 passed / 8 pre-existing backend failures (unchanged from before this work).
- `grep -rn "alert(\|confirm(" src/` → **ALL-CLEAN**.
