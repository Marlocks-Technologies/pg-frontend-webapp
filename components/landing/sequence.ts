/**
 * Gavel scroll sequence — shared configuration.
 *
 * 61 frames, 1280×720, extracted from a single 3D render. The motion arc is
 * not uniform and the copy is timed against it:
 *
 *   frames  1–44   the gavel hangs, turning slowly        → deliberation
 *   frames 45–58   descent, with real motion blur         → the answer arriving
 *   frames 59–61   contact, with impact debris            → the limit, and the door
 */

export const FRAME_COUNT = 61;

export const frameSrc = (i: number) =>
  `/sequence/gavel/frame-${String(i + 1).padStart(3, '0')}.jpg`;

/**
 * Art-directed crops of the 1280×720 source.
 *
 * Both deliberately stop short of x≈1140: the source frames carry a faint
 * four-point sparkle artifact near the bottom-right corner. Cropping is the
 * cheapest way to lose it without touching the asset.
 */
export type Crop = { sx: number; sy: number; sw: number; sh: number };

/** Wide plates — keeps the full handle-to-block composition. */
export const CROP_WIDE: Crop = { sx: 50, sy: 10, sw: 1080, sh: 700 };

/**
 * Square-ish plates — tightens onto the gavel and its block, discarding the
 * dead studio grey either side. This is the crop the pinned stage uses at
 * every breakpoint; the fall is a vertical move and wants a vertical frame.
 */
export const CROP_TIGHT: Crop = { sx: 230, sy: 20, sw: 700, sh: 660 };

/** Container aspect above which the wide crop is the better fit. */
export const WIDE_CROP_ABOVE = 1.35;

/**
 * Cap on how far the source may be upscaled in *device* pixels. The surface
 * brief fixes this at ~1.25× the 1280px render; past it a studio render
 * softens, and sharpness is a hard requirement here. In practice the plate is
 * always smaller than the source, so this is a guard, not a governor.
 */
export const MAX_DEVICE_SCALE = 1.25;

/**
 * Timeline positions, on a normalised 0→1 pin duration.
 *
 * Frames finish at `FRAMES_END`, well before the pin releases, so the struck
 * gavel gets a real held beat before the way through resolves at `DOOR_AT`.
 * The frame cursor is eased (see GavelSequence) rather than run linearly: the
 * render hangs for 44 frames and strikes in the last 3, so a linear scrub
 * would waste most of the scroll on the hang and flash past the payload.
 */
export const FRAMES_END = 0.66;

export type Threshold = {
  index: string;
  name: string;
  heading: string;
  body: string;
  /** [enter, exit] on the normalised timeline. */
  at: [number, number];
};

export const THRESHOLDS: Threshold[] = [
  {
    index: '01',
    name: 'Suspended',
    heading: 'Held, not decided.',
    body: "P&G Legal AI reads the firm's own record — precedents, filed matters, internal memos — alongside Nigerian law. It retrieves and quotes. It does not conclude.",
    at: [0.0, 0.24],
  },
  {
    index: '02',
    name: 'Descent',
    heading: 'Every answer carries its sources.',
    body: 'Open the citation, read the passage, confirm the ground. Where the record is silent, the assistant says so rather than filling the gap.',
    at: [0.30, 0.50],
  },
  {
    index: '03',
    name: 'Contact',
    heading: 'The last word is yours.',
    body: 'For research only. Not legal advice. Verify every answer with a qualified solicitor before it reaches a client.',
    // Enters just before the strike lands (~t 0.66) and holds through it.
    at: [0.56, 0.72],
  },
];

// A held beat sits between the strike (0.66) and the door — the struck gavel
// rests, the text column falls quiet, then the way through resolves.
export const DOOR_AT = 0.84;
