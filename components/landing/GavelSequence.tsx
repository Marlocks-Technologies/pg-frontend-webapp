'use client';

/**
 * DIRECTION CONTRACT — root entry surface
 *
 * THESIS: The gavel does not fall until you make it fall. This surface refuses
 * the category's entry screen — centred logo, headline, "Enter" button above the
 * fold — and refuses the AirPods arrangement its own technique invites: canvas
 * pinned, three claims crossfading over it. Here the scroll *is* the deliberation.
 *
 * OWN-WORLD: The app's achromatic system, unchanged. Charcoal ink on #f5f5f7,
 * separation by 1px hairlines at 7% ink, Raleway, no accent colour. The gavel's
 * walnut and brass are the only chroma on the page and are earned from a real
 * object, not chosen. The render sits in a hard-edged rounded-2xl plate bounded
 * by the system's hairline — the visible rectangle IS the artwork, no vignette,
 * because this system separates with rules, not feathers. One device is imported
 * for this surface: a numbered margin register (01/02/03 + 04 Enter) whose marks
 * sit at their real timeline fractions and whose fill tracks scroll.
 *
 * STORY: A fee-earner arrives mid-morning already sold. They learn three things
 * in order — it is grounded in the firm's record; it always shows sources; it is
 * not advice — and then they go in.
 *
 * FIRST VIEWPORT: Pale ground, split. Left: the threshold column, "Held, not
 * decided." (display-entry, clamped to 52px/700) over a ~54ch sub at ink/72.
 * Right (desktop) or leading (mobile): the plate with the gavel suspended. Far
 * left: the numbered register. The primary action is deliberately absent from
 * the stage — it exists only as a quiet header text link until the gavel strikes,
 * when the Door blooms in the text column.
 *
 * FORM: Chamber approach — descent through named thresholds. Structure 4 of the
 * grounded list; surface seed key 2a8fd7b6, mode experience, assigned index 4.
 * Staging: the asset's own three-part motion arc, one threshold per movement,
 * the frame cursor eased so the strike gets the dwell and then a held beat.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CROP_TIGHT,
  CROP_WIDE,
  DOOR_AT,
  FRAME_COUNT,
  FRAMES_END,
  MAX_DEVICE_SCALE,
  THRESHOLDS,
  WIDE_CROP_ABOVE,
  frameSrc,
  type Crop,
} from './sequence';

type Mode = 'loading' | 'scrub' | 'static';

export default function GavelSequence() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thresholdRefs = useRef<(HTMLDivElement | null)[]>([]);
  const registerRefs = useRef<(HTMLLIElement | null)[]>([]);
  const railFillRef = useRef<HTMLSpanElement | null>(null);
  const doorRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

  const plateRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const sizeRef = useRef<{ w: number; h: number; crop: Crop }>({
    w: 0, h: 0, crop: CROP_TIGHT,
  });
  const frameRef = useRef(0);

  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<Mode>('loading');

  // ── Draw one frame, filling the plate exactly ──────────────────────────────

  const draw = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const i = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(index)));
    const img = imagesRef.current[i];
    if (!img?.complete || !img.naturalWidth) return;

    frameRef.current = i;

    const { w, h, crop } = sizeRef.current;
    if (!w || !h) return;

    // The canvas was sized to the crop's aspect in resize(), so the frame
    // fills it edge to edge — no letterbox inside the plate, ever.
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
  }, []);

  /**
   * Sizes the canvas to the largest box that fits its slot without pushing the
   * source past MAX_DEVICE_SCALE in real device pixels. The plate is therefore
   * always exactly the image — the visible rectangle and the artwork are the
   * same object, so its hairline reads as a frame rather than a container.
   */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const plate = plateRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !plate || !ctx) return;

    const slot = plate.getBoundingClientRect();
    if (!slot.width || !slot.height) return;

    const crop: Crop =
      slot.width / slot.height > WIDE_CROP_ABOVE ? CROP_WIDE : CROP_TIGHT;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const scale = Math.min(
      slot.width / crop.sw,
      slot.height / crop.sh,
      MAX_DEVICE_SCALE / dpr,
    );
    const w = Math.round(crop.sw * scale);
    const h = Math.round(crop.sh * scale);

    sizeRef.current = { w, h, crop };
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    draw(frameRef.current);
  }, [draw]);

  // ── Preload every frame before the sequence is allowed to run ──────────────

  useEffect(() => {
    let cancelled = false;
    let settled = 0;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const images = Array.from({ length: FRAME_COUNT }, (_, i) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = () => {
        if (cancelled) return;
        settled += 1;
        setProgress(settled / FRAME_COUNT);
        // Paint the first frame the moment it lands so the stage is never blank.
        if (settled === 1 || frameRef.current === 0) draw(reduced ? FRAME_COUNT - 1 : 0);
        if (settled === FRAME_COUNT) setMode(reduced ? 'static' : 'scrub');
      };
      img.src = frameSrc(i);
      return img;
    });

    imagesRef.current = images;
    resize();

    return () => {
      cancelled = true;
      images.forEach((img) => { img.onload = img.onerror = null; });
    };
  }, [draw, resize]);

  // ── Keep the backing store correct ─────────────────────────────────────────

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, [resize, mode]);

  // ── The scrub ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'scrub') return;

    let ctx: { revert: () => void } | null = null;
    let disposed = false;

    (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (disposed) return;

      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const thresholds = thresholdRefs.current.filter(Boolean) as HTMLDivElement[];
        const registers = registerRefs.current.filter(Boolean) as HTMLLIElement[];
        const cursor = { frame: 0 };

        gsap.set(thresholds[0], { autoAlpha: 1, y: 0 });
        gsap.set(thresholds.slice(1), { autoAlpha: 0, y: 18 });
        gsap.set(doorRef.current, { autoAlpha: 0, y: 22 });

        const ACTIVE = '#2C2C2E';
        const RESTING = 'rgba(44,44,46,0.72)';
        const tickOf = (li: HTMLLIElement) => li.querySelector('.tick');
        registers.forEach((li, i) => {
          gsap.set(li, { color: i === 0 ? ACTIVE : RESTING });
          gsap.set(tickOf(li), { width: i === 0 ? 14 : 0 });
        });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: () => `+=${window.innerHeight * 4}`,
            pin: stageRef.current,
            pinSpacing: true,
            anticipatePin: 1,
            scrub: 0.55,
            invalidateOnRefresh: true,
          },
        });

        // Eased, not linear: the cursor moves fast through the 44 near-static
        // hang frames and decelerates into the descent and strike, so the
        // payload — the fall — gets the dwell instead of flashing past.
        tl.to(cursor, {
          frame: FRAME_COUNT - 1,
          ease: 'power2.out',
          duration: FRAMES_END,
          onUpdate: () => draw(cursor.frame),
        }, 0);

        // The scroll hint retires as soon as the visitor has taken the point.
        tl.to(hintRef.current, { autoAlpha: 0, duration: 0.04 }, 0.02);

        THRESHOLDS.forEach((t, i) => {
          const [enter, exit] = t.at;
          if (i > 0) {
            tl.to(thresholds[i], { autoAlpha: 1, y: 0, duration: 0.06, ease: 'power2.out' }, enter);
            tl.to(registers[i], { color: ACTIVE, duration: 0.05 }, enter);
            tl.to(tickOf(registers[i]), { width: 14, duration: 0.05, ease: 'power2.out' }, enter);
          }
          tl.to(thresholds[i], { autoAlpha: 0, y: -18, duration: 0.06, ease: 'power2.in' }, exit);
          tl.to(registers[i], { color: RESTING, duration: 0.05 }, exit);
          tl.to(tickOf(registers[i]), { width: 0, duration: 0.05, ease: 'power2.in' }, exit);
        });

        tl.to(doorRef.current, { autoAlpha: 1, y: 0, duration: 0.09, ease: 'power3.out' }, DOOR_AT);

        // The register's fourth mark is the door itself.
        const doorMark = registers[THRESHOLDS.length];
        if (doorMark) {
          tl.to(doorMark, { color: ACTIVE, duration: 0.05 }, DOOR_AT);
          tl.to(tickOf(doorMark), { width: 14, duration: 0.05, ease: 'power2.out' }, DOOR_AT);
        }

        tl.fromTo(
          railFillRef.current,
          { scaleY: 0 },
          { scaleY: 1, ease: 'none', duration: 1 },
          0,
        );

        ScrollTrigger.refresh();
      }, sectionRef);
    })();

    return () => {
      disposed = true;
      ctx?.revert();
    };
  }, [mode, draw]);

  const loadingPct = Math.round(progress * 100);

  // ── Static composition: reduced motion, or frames that never arrived ───────

  if (mode === 'static') {
    return (
      <section className="mx-auto w-full max-w-[68rem] px-6 pb-24 pt-28 sm:px-10">
        <div
          ref={plateRef}
          className="mx-auto flex aspect-[1080/700] w-full max-w-[52rem] items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            className="rounded-2xl border border-charcoal/[0.07]"
            aria-hidden="true"
          />
        </div>

        <ol className="mt-16 space-y-14 sm:mt-20">
          {THRESHOLDS.map((t) => (
            <li key={t.index} className="grid gap-x-8 gap-y-3 sm:grid-cols-[3rem_1fr]">
              <span className="flex items-center gap-2 text-[11px] font-medium tabular-nums text-charcoal/72">
                <span className="h-px w-3 bg-current sm:hidden" aria-hidden="true" />
                {t.index}
              </span>
              <div>
                <h2 className="max-w-[18ch] text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-charcoal/90">
                  {t.heading}
                </h2>
                <p className="mt-4 max-w-[62ch] text-[14px] leading-[1.65] text-charcoal/72">
                  {t.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-16 border-t border-charcoal/[0.07] pt-10 sm:ml-[3.5rem]">
          <Door />
        </div>
      </section>
    );
  }

  // ── Pinned scrub composition ───────────────────────────────────────────────

  return (
    <section ref={sectionRef} className="relative">
      <div ref={stageRef} className="relative h-[100svh] w-full overflow-hidden">
        {/* Numbered register — a genuine position indicator for a pinned
            passage whose length the visitor cannot otherwise judge. */}
        <div className="pointer-events-none absolute bottom-28 left-6 top-28 hidden lg:flex lg:gap-4 xl:left-10">
          <span className="relative block w-px shrink-0 bg-charcoal/[0.09]">
            <span
              ref={railFillRef}
              className="absolute inset-0 block origin-top bg-charcoal/55"
            />
          </span>
          {/* Markers sit at their real timeline positions, so the rail reads
              as a map of the passage rather than a decorative tally. */}
          {/* Active state is marked by a tick appearing, not by fading the
              inactive ones below legibility. */}
          <ol className="relative w-28 text-[10px] font-medium leading-none">
            {THRESHOLDS.map((t, i) => (
              <li
                key={t.index}
                ref={(el) => { registerRefs.current[i] = el; }}
                className="absolute left-0 flex items-center gap-2 text-charcoal/70"
                style={{ top: `${t.at[0] * 100}%` }}
              >
                <span className="tick h-px w-0 bg-current" aria-hidden="true" />
                <span className="tabular-nums">{t.index}</span>
                <span>{t.name}</span>
              </li>
            ))}
            <li
              ref={(el) => { registerRefs.current[THRESHOLDS.length] = el; }}
              className="absolute left-0 flex items-center gap-2"
              style={{ top: `${DOOR_AT * 100}%` }}
              aria-hidden="true"
            >
              <span className="tick h-px w-0 bg-current" />
              <span className="tabular-nums">04</span>
              <span>Enter</span>
            </li>
          </ol>
        </div>

        {/* Stage: text column beside the plate. The gavel is an object on the
            page, never a background — the page ground stays #f5f5f7. */}
        <div className="mx-auto grid h-full max-w-[96rem] grid-rows-[minmax(0,0.9fr)_auto] items-center gap-x-12 gap-y-4 px-6 pb-20 pt-6 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:grid-rows-1 lg:gap-y-0 lg:py-0 lg:pl-[10.5rem] xl:pl-[13rem]">
          {/* Plate — first on mobile so the artifact leads, right on desktop.
              A raised surface bounded by a hairline: the system's own way of
              separating things, rather than a shadow or a soft vignette. */}
          <div
            ref={plateRef}
            className="flex h-full min-h-0 w-full items-center justify-center lg:order-2 lg:h-[72vh]"
          >
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="rounded-2xl border border-charcoal/[0.07]"
            />
          </div>

          {/* Thresholds */}
          <div className="relative w-full self-start lg:order-1 lg:self-center">
            {THRESHOLDS.map((t, i) => (
              <div
                key={t.index}
                ref={(el) => { thresholdRefs.current[i] = el; }}
                className={i === 0 ? 'relative' : 'absolute inset-x-0 top-0'}
              >
                <p className="mb-4 flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-charcoal/75 lg:hidden">
                  <span className="tabular-nums">{t.index}</span>
                  <span className="h-px w-6 bg-charcoal/30" />
                  <span>{t.name}</span>
                </p>
                <h2 className="max-w-[16ch] text-[clamp(1.75rem,4.4vw,3.25rem)] font-bold leading-[1.06] tracking-[-0.03em] text-charcoal/90">
                  {t.heading}
                </h2>
                <p className="mt-5 max-w-[54ch] text-[clamp(13px,1.15vw,15px)] leading-[1.65] text-charcoal/72">
                  {t.body}
                </p>
              </div>
            ))}

            {/* The door, earned by the strike. */}
            <div
              ref={doorRef}
              className="absolute inset-x-0 top-0"
              style={{ opacity: 0, visibility: 'hidden' }}
            >
              <Door />
            </div>
          </div>
        </div>

        {/* Loading + scroll affordance, bottom rule */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-7 sm:px-10">
          <div className="flex items-end justify-between gap-6 border-t border-charcoal/[0.07] pt-5">
            <div ref={hintRef} className="text-[10px] leading-relaxed text-charcoal/72">
              {mode === 'loading' ? (
                <span aria-live="polite">Loading sequence — {loadingPct}%</span>
              ) : (
                <span>Scroll to begin</span>
              )}
            </div>
            <span className="hidden text-[10px] tabular-nums text-charcoal/72 sm:block">
              61 frames
            </span>
          </div>
          {mode === 'loading' && (
            <span
              aria-hidden="true"
              className="mt-px block h-px origin-left bg-charcoal/30 transition-transform duration-200 ease-out"
              style={{ transform: `scaleX(${progress})` }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

// ── The single primary action ────────────────────────────────────────────────

function Door() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  // Bridge the seam: the landing is light, /chat opens dark. Fading through
  // charcoal on the way out lands the user in the dark shell without a flash,
  // and reads as the struck gavel's blackout. Reduced motion navigates plainly.
  const enter = (e: React.MouseEvent) => {
    if (
      e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;
    e.preventDefault();
    setLeaving(true);
    router.prefetch('/chat');
    window.setTimeout(() => router.push('/chat'), 280);
  };

  return (
    <div>
      <h2 className="text-[clamp(1.75rem,4.4vw,3.25rem)] font-bold leading-[1.06] tracking-[-0.03em] text-charcoal/90">
        Ready when you are.
      </h2>
      <Link
        href="/chat"
        onClick={enter}
        className="group mt-8 inline-flex items-center gap-3 rounded-xl bg-charcoal px-7 py-4 text-[12px] font-medium tracking-[0.02em] text-[#f5f5f7] transition-colors duration-200 hover:bg-[#1c1c1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f7]"
      >
        Open the assistant
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className="transition-transform duration-300 ease-out group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="18" y2="12" />
          <polyline points="12,6 18,12 12,18" />
        </svg>
      </Link>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[60] bg-[#111113] transition-opacity duration-300 ease-in"
        style={{ opacity: leaving ? 1 : 0, visibility: leaving ? 'visible' : 'hidden' }}
      />
    </div>
  );
}
