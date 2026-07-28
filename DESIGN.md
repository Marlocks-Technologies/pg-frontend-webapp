---
name: P&G Legal AI
description: Achromatic, hairline-ruled research instrument for Perchstone & Graeys fee-earners
colors:
  ink: "#2C2C2E"
  surface-light: "#f5f5f7"
  surface-light-sunken: "#f0f0f2"
  surface-light-raised: "#ffffff"
  surface-dark: "#111113"
  surface-dark-raised: "#1c1c1e"
  surface-dark-raised-2: "#3a3a3c"
  state-ready: "#34d399"
  state-pending: "#fbbf24"
  state-error: "#f87171"
  state-info: "#60a5fa"
typography:
  wordmark:
    fontFamily: "Raleway, sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
  display:
    fontFamily: "Raleway, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  display-entry:
    fontFamily: "Raleway, sans-serif"
    fontSize: "clamp(1.75rem, 4.4vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.03em"
  body-lead:
    fontFamily: "Raleway, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  body:
    fontFamily: "Raleway, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Raleway, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  micro:
    fontFamily: "Raleway, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.lg}"
    padding: "14px 28px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    typography: "{typography.label}"
---

# Design System: P&G Legal AI

<!-- impeccable:design-schema 1 -->

## Overview

An achromatic research instrument for lawyers. The system is built from two neutrals — charcoal ink and off-white paper — separated by hairlines rather than borders, boxes, or fills. It reads as an instrument panel rather than a document: dense, small-type, quiet, and unornamented, because its users are experts working under time pressure who need to scan rather than be led.

The governing idea is **restraint as credibility**. A law firm's product cannot look eager. Every device that would normally carry personality — accent color, illustration, large display type, decorative shadow — has been withheld, which makes the few things that *do* carry weight (a status dot, a citation panel, the disclaimer) read as meaningful rather than styled.

Light and dark are equal citizens, both authored by hand throughout the component tree via an `isDark` prop rather than CSS variables.

## Colors

### Primary

There is no brand accent color. This is the system's defining rule, not an omission. Identity is carried by `ink` (`#2C2C2E`, "charcoal") against paper, and by nothing else.

### Neutral

| Token | Light | Dark |
|---|---|---|
| Ground | `#f5f5f7` | `#111113` |
| Raised / panel | `#ffffff` | `#1c1c1e` |
| Raised 2 / input | `#f0f0f2` | `#3a3a3c` |
| Ink | `#2C2C2E` | `rgba(255,255,255,0.88)` |

Text is tinted by **opacity on the ink**, never by a separate gray token: `/88` primary, `/60` secondary, `/38` tertiary, `/30` quaternary. Dark mode mirrors this with `white/85`, `/55`, `/38`, `/25`.

### Named Rules

- **Color means state, never decoration.** The four hues in the palette are strictly semantic: emerald = ready/succeeded, amber = processing/warning, red = error/destructive, blue = informational. A hue appearing for emphasis, branding, or visual interest is a defect.
- **Separation is a hairline, not a border.** `charcoal/[0.07]` in light, `white/[0.07]` in dark, always 1px. Heavier rules and colored left-borders are out of the system.
- **Chroma may enter only from a photographic asset.** The gavel sequence's walnut and brass are permitted because they are the material of a real object, not a chosen accent.

## Typography

Raleway is the single family, loaded via `next/font` at weights 300–800 and bound to `--font-raleway`. It is a firm brand commitment.

### Hierarchy

The scale is deliberately **compressed and small** — an instrument scale, not an editorial one. Steps: 10 / 11 / 12 / 13 / 14 / 15 / 22px. Body sits at 13px, not 16px.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Wordmark | 11.5px | 700 | uppercase, `tracking-[0.1em]` |
| Section head | 14px | 700 | |
| Display | 22px | 700 | `tracking-tight`; the largest type in the app |
| Body | 13–13.5px | 400 | `leading-relaxed` |
| Label / control | 11–12px | 500 | |
| Micro / legal | 10px | 400 | disclaimers, timestamps |

**The entry surface (`/`) extends the ramp, and only it.** Full-viewport surfaces outside the app shell use `display-entry` (fluid, capping at 52px) and `body-lead` at 14px. Inside the shell the compressed scale stands.

### Named Rules

- **Uppercase + `0.1em` tracking is the wordmark's signature and belongs to it alone.** It is not a general eyebrow style; a tracked uppercase kicker over every section is out of the system.
- **Weight, not size, carries emphasis.** The scale's top is 22px inside the app precisely so that hierarchy is read from weight and opacity.
- **Ink opacity has a legibility floor of 0.72 for text.** Below that, differentiate state by adding an element — a tick, a rule, a fill — never by fading text further.

## Layout

Full-height flex shell: fixed-width sidebar (`lg:` and up) beside a `flex-1 min-w-0` content column, both `min-h-0` so inner regions scroll independently. Below `lg`, the sidebar becomes an overlay drawer. Content columns are constrained by `max-w-*` and centered; the app never runs edge-to-edge text.

## Elevation & Depth

Near-flat by default. Separation comes from the hairline and from surface-value steps, not from shadow. The only shadow in the system is `shadow-sm` on the active segment of the theme toggle. Glass, blur, and glow are absent and should stay absent.

## Motion

Motion is sparse and purposeful — the app's resting state is the typewriter cursor and 200ms color transitions on controls. Two durable rules the entry surface establishes:

- **A scroll-scrubbed sequence is eased to its content, not run linearly.** When source frames are unevenly paced (a long hang, a fast strike), map the scroll cursor with an ease so the meaningful frames get the dwell, and leave a held beat before any resolution. A linear scrub inherits the source's dead time.
- **Cross-surface navigation between a light surface and a dark one bridges through the destination's ground color.** The entry page fades through `surface-dark` (`#111113`) on its way into `/chat` rather than hard-cutting light→dark. Skipped under `prefers-reduced-motion`.

## Shapes

`rounded-lg` (8px) for controls and rows, `rounded-xl` (12px) for panels and the logo mark, `rounded-2xl` (16px) for large containers, `rounded-full` for dots, pills, and scrollbar thumbs. Nothing is square-cornered; nothing is a circle except status dots and avatars.

## Components

### Buttons

Primary is solid ink on paper (inverted in dark). Ghost/icon buttons are transparent, revealing a `ink/6` wash on hover with a 200ms color transition, and step their text opacity up rather than changing hue.

### Cards / Containers

Panels are a raised surface plus a hairline — never a shadow, never a colored border. Nested cards do not occur.

### Inputs / Fields

Sunken surface (`#f0f0f2` / `#3a3a3c`), `rounded-xl`, hairline, no visible focus ring color — focus is shown by hairline contrast increase.

### Navigation

The sidebar is a list of session rows; the active row is a filled wash, not a colored bar. Destructive affordances (delete) are revealed on hover and are the only place red appears in navigation.

### Signature Component — the citation panel

Every assistant message carries a collapsible source list. It is the product's whole thesis in a component: the answer is provisional, the sources are the point. It is never styled as a footnote or de-emphasized to a whisper.

### Signature Component — the status dot

A 6px `rounded-full` dot beside the wordmark, emerald when ready. The system's single permitted moment of color at rest.

### Signature Component — the plate (entry surface)

The gavel sequence renders into a canvas sized to exactly the drawn image, `rounded-2xl` with the standard hairline. The visible rectangle *is* the artwork — there is no container padding and no letterbox, so the hairline reads as a frame. A soft vignette mask was tried and rejected: it is foreign to a system that separates with hairlines, and any feather wide enough to matter eroded the gavel's handle.

### Signature Component — the numbered register (entry surface)

A left-margin rail with markers positioned at their real timeline fractions and a fill that tracks scroll. Numbered marks are permitted here, and only here, because the sequence carries information the reader needs: how far through a pinned passage they are. A numbered rail that does not track real progress is decoration and is out of the system.

## Do's and Don'ts

### Do:

- Separate with a 1px hairline at 7% ink.
- Tint text by lowering ink opacity.
- Keep type small, dense, and weighted.
- Author both themes explicitly; treat neither as the default.
- Let a photographic asset supply the only warmth on a surface.
- State the not-legal-advice caveat wherever the product speaks.

### Don't:

- Introduce a brand accent color, gradient, or gradient text.
- Use a hue for anything but state.
- Add shadow, glass, or glow for depth.
- Apply tracked uppercase as a general section eyebrow.
- Let display type exceed the compressed scale inside the app shell.
- Show an answer without its sources.
