---
name: Perchstone & Graeys Legal AI
description: Hairline-ruled research instrument for Perchstone & Graeys fee-earners, carrying the firm's orange as its one accent
colors:
  ember: "#D6512C"
  ember-deep: "#B5421F"
  ember-light: "#E8714F"
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
    backgroundColor: "{colors.ember}"
    textColor: "#ffffff"
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

# Design System: Perchstone & Graeys Legal AI

<!-- impeccable:design-schema 1 -->

## Overview

A research instrument for lawyers, wearing the firm's identity. The system is built from two neutrals — charcoal ink and off-white paper — separated by hairlines rather than borders, boxes, or fills, with the firm's orange (`ember`) as its single accent. It reads as an instrument panel rather than a document: dense, small-type, quiet, and unornamented, because its users are experts working under time pressure who need to scan rather than be led.

The governing idea is **restraint as credibility**. A law firm's product cannot look eager. Illustration, large display type and decorative shadow are withheld; the one accent is the firm's own orange, taken from its lockup, and it is spent only where the firm speaks or the user acts — the mark, the primary action, focus, the active item. Everything else stays ink on paper, so the orange keeps its weight.

Light and dark are equal citizens, both authored by hand throughout the component tree via an `isDark` prop rather than CSS variables.

## Colors

### Primary

`ember` `#D6512C` is the firm's orange, sampled from the Perchstone & Graeys lockup (October 2026 rebrand; it replaced the earlier no-accent rule at the firm's request). `ember-deep` `#B5421F` is its hover/pressed step and its text tone on light grounds; `ember-light` `#E8714F` exists for tints only. White on `ember` is 5.3:1.

### Neutral

| Token | Light | Dark |
|---|---|---|
| Ground | `#f5f5f7` | `#111113` |
| Raised / panel | `#ffffff` | `#1c1c1e` |
| Raised 2 / input | `#f0f0f2` | `#3a3a3c` |
| Ink | `#2C2C2E` | `rgba(255,255,255,0.88)` |

Text is tinted by **opacity on the ink**, never by a separate gray token: `/88` primary, `/60` secondary, `/38` tertiary, `/30` quaternary. Dark mode mirrors this with `white/85`, `/55`, `/38`, `/25`.

### Named Rules

- **Ember is the firm speaking or the user acting.** It fills the monogram, every primary action (one per view), the focus outline, text selection, the active session dot and link underlines. It never fills panels (except the sign-in panel, the one ember field), chat bubbles, headings or body text, and it never signals state.
- **Other hues mean state, never decoration.** Emerald = ready/active, amber = processing/warning, red = error/destructive, blue = informational. Red stays a cool `red-700`/`#f87171` so it never reads as the brand orange.
- **Separation is a hairline, not a border.** `charcoal/[0.07]` in light, `white/[0.07]` in dark, always 1px. Heavier rules and colored left-borders are out of the system.
- **Chroma beyond ember may enter only from a photographic asset.** The gavel sequence's walnut and brass are permitted because they are the material of a real object.

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

Primary is solid `ember` with white text in both themes, `ember-deep` on hover; one per view. In the chat shell the send button is that primary, so "New conversation" stays ink-filled. Ghost/icon buttons are transparent, revealing a `ink/6` wash on hover with a 200ms color transition, and step their text opacity up rather than changing hue.

### Cards / Containers

Panels are a raised surface plus a hairline — never a shadow, never a colored border. Nested cards do not occur.

### Inputs / Fields

Sunken surface (`#f0f0f2` / `#3a3a3c`), `rounded-xl`, hairline. Keyboard focus is a 2px `ember` outline at 2px offset, set globally.

### Navigation

The sidebar is a list of session rows; the active row is a filled wash, not a colored bar. Destructive affordances (delete) are revealed on hover and are the only place red appears in navigation.

### Signature Component — the brand marks

Two marks, traced to vector from the firm's lockup (`public/brand/`). The **lockup** (pillar tile, PERCHSTONE & GRAEYS, "Solicitors. Advocates. Arbitrators.") appears where the firm introduces itself: the sign-in column, the chat empty state, the admin header, the landing footer, and Cognito's hosted page. Use `lockup-dark.svg` on dark grounds. The **monogram** (pillar-PG in the orange tile, `BrandMark`) is the compact mark everywhere else: sidebar, landing header, favicon. `BrandMark variant="glyph"` draws the white pillar alone for orange grounds. Never redraw, recolor or crop the lockup; never pair the monogram with a second icon.

### Signature Component — the column (sign-in)

The sign-in page splits into an `ember` panel and a paper column. The panel carries the pillar glyph at architectural scale, standing on the panel's floor, with two quiet labels ("Legal AI", "Internal · By invitation"); the tagline lives only in the lockup beside it, never repeated. The pillar rises once on arrival (clip-path, 1.1s expo-out), skipped under reduced motion. On small screens the panel collapses to a band the column rises into.

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
- Spend ember only on the mark, the primary action, focus and the active item.
- State the not-legal-advice caveat wherever the product speaks.

### Don't:

- Introduce a second accent, a gradient, or gradient text.
- Use ember for state, panels, headings or more than one primary action per view.
- Add shadow, glass, or glow for depth.
- Apply tracked uppercase as a general section eyebrow.
- Let display type exceed the compressed scale inside the app shell.
- Show an answer without its sources.
