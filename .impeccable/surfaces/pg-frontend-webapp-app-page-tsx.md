---
version: 1
slug: "pg-frontend-webapp-app-page-tsx"
primary_target: "pg-frontend-webapp/app/page.tsx"
related_targets: []
---

## Scope

The root route `/` — the internal entry page a Perchstone & Graeys fee-earner passes through before `/chat`. Replaces the previous `redirect('/chat')`.

Visitor mode: **Experience**. The gavel sequence leads; the interface recedes; there is exactly one door.

## Audience & job

Internal fee-earners only — partners, associates, paralegals. They are already sold; nobody needs converting. Their job on this surface is simply to arrive, register that the instrument is ready and what its limits are, and enter. Anything that reads as marketing is wrong for this audience.

## Action

A single primary action: enter `/chat`. No secondary CTA, no nav, no sign-in (authentication is undecided in PRODUCT.md and must not be implied).

## Proof / content

No external proof exists and none may be invented — no clients, metrics, testimonials, or press. The only assets are the 61-frame gavel sequence and the product's own true description. The page's persuasive burden is therefore carried entirely by craft and by the honest statement of what the tool does and does not do.

## Chosen direction

**The chamber approach** — a vertical descent through named thresholds, structure 4 of the grounded list (surface seed `2a8fd7b6`, mode experience, assigned index 4).

The 61 frames are apportioned across three thresholds that match the asset's real motion arc: frames 1–44 the gavel suspended (deliberation), 45–58 the descent, 59–61 the strike. Scroll drives the frames; the frames drive the narrative. The strike is the terminal beat and coincides with the door opening — the CTA is earned by the gavel landing, not printed above the fold.

Grafted from dealt challengers, dressed in the committed identity:
- a strict numbered margin column tracking the passage (from the orizuru fold-sequence's numbered crease register) — legible to lawyers as document grammar;
- scrub-don't-jump pacing, one idea per threshold (from the Saul Bass title sequence). The Bass world's flat saturated act-fields were rejected outright: they violate the pinned achromatic palette.

## Memorable moment

The gavel does not fall until you make it fall, and when it lands the way through appears. The page's single interaction restates the product's own principle — the tool holds a question until a person acts on it.

## Constraints

- Light theme only on this surface. Forced by the physical scene (a daylit Lagos office at the start of a working session) and by the asset: the frames are studio-lit on a pale grey ground and would fight `#111113`.
- Achromatic per DESIGN.md. The gavel's walnut and brass are the only chroma and come from the asset, not from a chosen accent.
- The not-legal-advice caveat is a threshold in the sequence, not a footer. Product Principle 5 makes it load-bearing.
- Canvas is `contain`-fit, never upscaled past ~1.25× of the 1280×720 source, so the sequence stays sharp — a stated requirement.
- `prefers-reduced-motion` must yield a complete, non-animated version of the same content.

## Unresolved

- The source frames carry a faint four-point sparkle artifact at roughly 90%/83% of the frame, bottom-right. Currently masked by the canvas edge feather; a clean re-export would remove it at source.
- No firm logo file exists; the existing hand-drawn stacked-chevron mark from the app shell is reused rather than a new mark invented.
