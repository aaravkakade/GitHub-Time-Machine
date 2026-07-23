# Design system

CodeChronicle is dark-first, technical and calm. The interface should feel
cinematic but never noisy — motion communicates state change, not decoration.
All tokens live in `src/app/globals.css` and are consumed through Tailwind v4
theme variables; nothing hardcodes a hex value.

## Principles

- **Restraint.** One accent color, crisp borders, subtle depth. No gradient
  overload, glassmorphism, glowing neon, or floating blobs.
- **Information density without clutter.** Progressive disclosure (collapsible
  methodology, expandable debt signals), monospace for identifiers.
- **Motion with meaning.** Transitions on `transform`/`opacity`/`scale`, spring
  easing used selectively, and everything honors `prefers-reduced-motion`.
- **Color is never the only signal.** Change status uses color *and* shape
  (added `+` badge, modified ring, dashed test borders, dashed structure edges).

## Color tokens

Surfaces, borders and ink are layered scales that swap in one place between
dark (default) and the `.cc-light` theme:

| Role | Token | Purpose |
| --- | --- | --- |
| Surfaces | `--surface-0…3` | Page → panels → controls, back to front |
| Borders | `--line-0…2` | Recessive → prominent hairlines |
| Ink | `--ink-1…3` | Primary → muted text |
| Accent | `--accent`, `--accent-strong`, `--accent-soft`, `--accent-line` | The single UI accent — **never a data-series color** |
| Semantic | `--add`, `--remove`, `--warn`, `--neutral-change` (+ `-soft`) | Additions, removals, warnings, neutral change |

### Data colors

Charts and clusters draw from a **separately validated** palette so they stay
colorblind-safe and legible in both themes:

- `--chart-1` — the single-series chart color (dataviz slot 1).
- `--cluster-1…8` — categorical hues for architectural regions, in a fixed
  order (never cycled), stepped for each theme.

The categorical order was validated with the dataviz palette validator against
both surfaces. Text always wears ink tokens, never a series color; a colored
mark beside it carries identity.

## Scales

| Scale | Tokens |
| --- | --- |
| Radius | `--radius-sm 4` · `--radius-md 6` · `--radius-lg 10` · `--radius-xl 16` |
| Motion duration | `--dur-fast 120` · `--dur-med 240` · `--dur-slow 480` · `--dur-graph 700` (ms) |
| Easing | `--ease-out` (spring-like), `--ease-in-out` |

Typography uses Geist Sans for UI and Geist Mono for identifiers (paths, SHAs,
tags, metrics). A restrained type scale leans on weight and color rather than
many sizes.

## Graph states

- **added** — green fill ring + `+` badge; enters with a scale/opacity animation.
- **modified** — amber ring dot; inner activity dot scales with churn.
- **removed** — faded, lingers briefly with an exit animation during time travel.
- **stable** — cluster-hued, quiet.
- **test module** — dashed border.
- **focus mode** — non-neighbors dim to ~14%; edges of the focused node brighten.
- Import edges are solid (width scales with weight); structure edges are dashed
  and dim, so inferred relationships read differently from real imports.

## Timeline states

Commit-density bars (past = accent, future = muted), release markers (dashed,
labels decluttered by spacing), snapshot ticks, milestone diamonds (icon per
category, active state filled), a scrub cursor, and a keyboard-focusable slider
handle. Playback pauses cinematically at each milestone.

## Motion rules

- Animate `transform`/`opacity`/`scale`; avoid layout thrash.
- Graph transitions are continuous — nodes move/resize/reconnect rather than
  being destroyed and recreated.
- Decorative animation never blocks interaction.
- `prefers-reduced-motion` collapses durations to ~1 ms and disables looping
  and entrance animations (handled globally in `globals.css` and via Framer
  Motion's `useReducedMotion`).

## Accessibility

- Keyboard-accessible timeline (arrows, Shift+arrows, Home/End, PageUp/PageDown,
  Space/Enter) and tablist (arrow navigation).
- Visible focus rings (`:focus-visible`) with an offset.
- Semantic HTML, ARIA labels on controls, `role="slider"`/`meter`/`img` where
  appropriate.
- Screen-reader summaries of the architecture graph and each sparkline.
- Color-independent change indicators; sufficient contrast in both themes.

## Responsiveness

Excellent at 1440 (desktop), 1280 (laptop), tablet, and mobile. On mobile the
desktop workspace is replaced by a thoughtfully adapted experience: a segmented
switch toggles between the architecture canvas and the insights panel instead of
squeezing both on screen; the timeline and header condense. Wide content
(tables, the graph, code) scrolls inside its own container — the page body never
scrolls horizontally.
