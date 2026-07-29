'use client';

import { useEffect, useRef, useState } from 'react';
import {
  captureDocument,
  CaptureDocumentResponse,
  CaptureFrame,
  CaptureSourceType,
} from '@/lib/api';
import {
  assertCaptureBudget,
  captureTotalBytes,
  captureVideoFrame,
  MAX_CAPTURE_FRAMES,
  sampleVideoFile,
  startDocumentCamera,
  stopDocumentCamera,
} from '@/lib/cameraCapture';

type CaptureModalProps = {
  isDark: boolean;
  onClose: () => void;
  onQueued: (result: CaptureDocumentResponse) => void;
};

function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function VideoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="13" height="14" rx="2"/>
      <path d="m16 10 5-3v10l-5-3"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="animate-spin" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
    </svg>
  );
}

function formatCaptureSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CaptureModal({
  isDark,
  onClose,
  onQueued,
}: CaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CaptureSourceType>('camera');
  const [frames, setFrames] = useState<CaptureFrame[]>([]);
  const [filename, setFilename] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [samplingLabel, setSamplingLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [queued, setQueued] = useState<CaptureDocumentResponse | null>(null);

  const close = () => {
    stopDocumentCamera(videoRef.current);
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        stopDocumentCamera(videoRef.current);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      stopDocumentCamera(videoRef.current);
    };
  }, [onClose, submitting]);

  const selectMode = (nextMode: CaptureSourceType) => {
    stopDocumentCamera(videoRef.current);
    setCameraActive(false);
    setMode(nextMode);
    setFrames([]);
    setError('');
    setSamplingLabel('');
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    setError('');
    setCameraStarting(true);
    try {
      await startDocumentCamera(videoRef.current);
      setCameraActive(true);
      if (!filename) setFilename('camera-document');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The camera could not be started. Check your browser permissions.'
      );
    } finally {
      setCameraStarting(false);
    }
  };

  const addCameraFrame = () => {
    if (!videoRef.current) return;
    setError('');
    try {
      const nextFrames = [...frames, captureVideoFrame(videoRef.current)];
      assertCaptureBudget(nextFrames);
      setFrames(nextFrames);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The frame could not be captured.');
    }
  };

  const processVideoFile = async (file: File) => {
    setError('');
    setSampling(true);
    setSamplingLabel('Reading video…');
    setFrames([]);
    setFilename(file.name.replace(/\.[^.]+$/, '') || 'video-document');
    try {
      const sampledFrames = await sampleVideoFile(file, (complete, total) => {
        setSamplingLabel(`Sampling frame ${complete} of ${total}…`);
      });
      setFrames(sampledFrames);
      setSamplingLabel(
        `${sampledFrames.length} frame${sampledFrames.length === 1 ? '' : 's'} ready`
      );
    } catch (caught) {
      setSamplingLabel('');
      setError(
        caught instanceof Error
          ? caught.message
          : 'The video could not be sampled. Try a shorter or lower-resolution file.'
      );
    } finally {
      setSampling(false);
      if (videoFileRef.current) videoFileRef.current.value = '';
    }
  };

  const removeFrame = (index: number) => {
    setFrames(current => current.filter((_, frameIndex) => frameIndex !== index));
    setError('');
  };

  const submitCapture = async () => {
    if (!filename.trim()) {
      setError('Name this document before sending it for extraction.');
      return;
    }
    if (!frames.length) {
      setError(
        mode === 'camera'
          ? 'Capture at least one clear frame of the document.'
          : 'Choose a video and wait for its frames to be sampled.'
      );
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      assertCaptureBudget(frames);
      const result = await captureDocument({
        filename: filename.trim(),
        sourceType: mode,
        frames,
        metadata: { captureClient: 'web' },
      });
      setQueued(result);
      stopDocumentCamera(videoRef.current);
      setCameraActive(false);
      onQueued(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The document could not be queued. Check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setQueued(null);
    setFrames([]);
    setFilename('');
    setSamplingLabel('');
    setError('');
  };

  const totalBytes = captureTotalBytes(frames);
  const primaryButton = isDark
    ? 'bg-white text-[#1c1c1e] hover:bg-white/90 disabled:bg-white/40'
    : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c] disabled:bg-charcoal/35';
  const quietButton = isDark
    ? 'text-white/75 hover:bg-white/[0.07] border-white/[0.09]'
    : 'text-charcoal/75 hover:bg-charcoal/[0.05] border-charcoal/[0.09]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 cursor-default"
        onClick={close}
        disabled={submitting}
        aria-label="Close capture dialog"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        className={`relative z-10 flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border
          ${isDark
            ? 'bg-[#1c1c1e] border-white/[0.09] text-white'
            : 'bg-white border-charcoal/[0.09] text-charcoal'
          }`}
      >
        <header className={`flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:px-5
          ${isDark ? 'border-white/[0.07]' : 'border-charcoal/[0.07]'}`}
        >
          <div>
            <h2 id="capture-title" className="text-[14px] font-bold">
              Extract from camera or video
            </h2>
            <p className={`mt-1 max-w-lg text-[11px] leading-relaxed
              ${isDark ? 'text-white/65' : 'text-charcoal/65'}`}
            >
              Clear frames are combined into one document, categorized from their text,
              and added to the knowledge base.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className={`shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              ${isDark
                ? 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                : 'text-charcoal/60 hover:bg-charcoal/[0.05] hover:text-charcoal'
              }`}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18"/>
            </svg>
          </button>
        </header>

        {queued ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <span className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl
              ${isDark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 10 10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </span>
            <h3 className="text-[15px] font-bold">Extraction is underway</h3>
            <p className={`mt-2 max-w-sm text-[12px] leading-relaxed
              ${isDark ? 'text-white/65' : 'text-charcoal/65'}`}
            >
              {queued.capture.framesAccepted} frame
              {queued.capture.framesAccepted === 1 ? '' : 's'} were accepted. OCR,
              categorization, and indexing will finish in the background.
            </p>
            <div className={`mt-5 w-full max-w-sm rounded-xl border px-3 py-2.5 text-left
              ${isDark ? 'border-white/[0.08] bg-white/[0.035]' : 'border-charcoal/[0.08] bg-charcoal/[0.025]'}`}
            >
              <p className={`text-[10px] font-medium ${isDark ? 'text-white/55' : 'text-charcoal/55'}`}>
                Document ID
              </p>
              <p className="mt-1 break-all text-[11px] font-semibold">{queued.documentId}</p>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={reset}
                className={`rounded-xl border px-4 py-2 text-[12px] font-semibold transition-colors ${quietButton}`}
              >
                Capture another
              </button>
              <button type="button" onClick={close}
                className={`rounded-xl px-4 py-2 text-[12px] font-semibold transition-colors ${primaryButton}`}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className={`grid grid-cols-2 rounded-xl p-1
                ${isDark ? 'bg-white/[0.05]' : 'bg-charcoal/[0.05]'}`}
              >
                {([
                  ['camera', 'Live camera', <CameraIcon key="camera" />],
                  ['video', 'Video file', <VideoIcon key="video" />],
                ] as const).map(([value, label, icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectMode(value)}
                    aria-pressed={mode === value}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                      ${mode === value
                        ? isDark
                          ? 'bg-[#3a3a3c] text-white'
                          : 'bg-white text-charcoal'
                        : isDark
                          ? 'text-white/60 hover:text-white/85'
                          : 'text-charcoal/55 hover:text-charcoal/80'
                      }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                {mode === 'camera' ? (
                  <div>
                    <div className={`relative aspect-[16/10] overflow-hidden rounded-xl border
                      ${isDark ? 'border-white/[0.08] bg-[#111113]' : 'border-charcoal/[0.08] bg-[#f0f0f2]'}`}
                    >
                      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
                      {!cameraActive && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                          <span className={isDark ? 'text-white/45' : 'text-charcoal/45'}>
                            <CameraIcon size={27} />
                          </span>
                          <p className="mt-3 text-[13px] font-semibold">Camera is off</p>
                          <p className={`mt-1 max-w-xs text-[11px] leading-relaxed
                            ${isDark ? 'text-white/60' : 'text-charcoal/60'}`}
                          >
                            Use the rear camera on a phone, or your webcam on desktop.
                            Keep the document flat and evenly lit.
                          </p>
                          <button
                            type="button"
                            onClick={startCamera}
                            disabled={cameraStarting}
                            className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-semibold transition-colors ${primaryButton}`}
                          >
                            {cameraStarting ? <Spinner /> : <CameraIcon size={14} />}
                            {cameraStarting ? 'Starting…' : 'Start camera'}
                          </button>
                        </div>
                      )}
                    </div>
                    {cameraActive && (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className={`text-[11px] ${isDark ? 'text-white/60' : 'text-charcoal/60'}`}>
                          Capture each page once. Overlapping text is removed during OCR.
                        </p>
                        <button
                          type="button"
                          onClick={addCameraFrame}
                          disabled={frames.length >= MAX_CAPTURE_FRAMES}
                          className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors
                            disabled:cursor-not-allowed disabled:opacity-40 ${quietButton}`}
                        >
                          <CameraIcon size={14} />
                          Capture page
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      ref={videoFileRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) processVideoFile(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => videoFileRef.current?.click()}
                      disabled={sampling}
                      className={`flex aspect-[16/7] w-full flex-col items-center justify-center rounded-xl border px-6 text-center transition-colors
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                        ${isDark
                          ? 'border-white/[0.09] bg-white/[0.025] hover:bg-white/[0.05]'
                          : 'border-charcoal/[0.09] bg-charcoal/[0.02] hover:bg-charcoal/[0.04]'
                        }`}
                    >
                      <span className={isDark ? 'text-white/45' : 'text-charcoal/45'}>
                        {sampling ? <Spinner /> : <VideoIcon size={26} />}
                      </span>
                      <span className="mt-3 text-[13px] font-semibold">
                        {sampling ? samplingLabel : frames.length ? 'Choose a different video' : 'Choose a video'}
                      </span>
                      <span className={`mt-1 max-w-sm text-[11px] leading-relaxed
                        ${isDark ? 'text-white/60' : 'text-charcoal/60'}`}
                      >
                        Frames are sampled evenly in your browser. The original video is
                        never uploaded.
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {frames.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold">
                      Captured frames
                    </p>
                    <p className={`text-[10px] ${isDark ? 'text-white/55' : 'text-charcoal/55'}`}>
                      {frames.length}/{MAX_CAPTURE_FRAMES} · {formatCaptureSize(totalBytes)}
                    </p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {frames.map((frame, index) => (
                      <div key={`${frame.capturedAt}-${index}`} className="group relative h-[76px] w-[106px] shrink-0 overflow-hidden rounded-lg">
                        {/* Captured frames are local browser data URLs. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={frame.content} alt={`Captured document frame ${index + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFrame(index)}
                          className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label={`Remove frame ${index + 1}`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
                            <path d="m6 6 12 12M18 6 6 18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="mt-4 block text-[11px] font-semibold" htmlFor="capture-filename">
                Document name
              </label>
              <input
                id="capture-filename"
                type="text"
                value={filename}
                onChange={event => setFilename(event.target.value)}
                placeholder="e.g. Signed service agreement"
                className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition-colors
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1
                  ${isDark
                    ? 'border-white/[0.09] bg-white/[0.05] text-white placeholder:text-white/40 focus:border-white/25'
                    : 'border-charcoal/[0.1] bg-charcoal/[0.035] text-charcoal placeholder:text-charcoal/40 focus:border-charcoal/25'
                  }`}
              />

              <div className={`mt-4 flex gap-2.5 rounded-xl px-3 py-2.5
                ${isDark ? 'bg-white/[0.035]' : 'bg-charcoal/[0.035]'}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  className={`mt-0.5 shrink-0 ${isDark ? 'text-white/55' : 'text-charcoal/55'}`} aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>
                </svg>
                <p className={`text-[10.5px] leading-relaxed ${isDark ? 'text-white/65' : 'text-charcoal/65'}`}>
                  Text extraction and category selection happen automatically after upload.
                  Review sensitive documents before adding them to the shared knowledge base.
                </p>
              </div>

              <div aria-live="polite" className="min-h-5">
                {error && (
                  <p className={`mt-3 text-[11px] leading-relaxed ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                    {error}
                  </p>
                )}
              </div>
            </div>

            <footer className={`flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3.5 sm:px-5
              ${isDark ? 'border-white/[0.07]' : 'border-charcoal/[0.07]'}`}
            >
              <p className={`hidden text-[10px] sm:block ${isDark ? 'text-white/55' : 'text-charcoal/55'}`}>
                JPEG frames · 7 MB total limit
              </p>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className={`rounded-xl border px-4 py-2 text-[12px] font-semibold transition-colors ${quietButton}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCapture}
                  disabled={submitting || sampling || frames.length === 0}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-semibold transition-colors
                    disabled:cursor-not-allowed ${primaryButton}`}
                >
                  {submitting ? <Spinner /> : null}
                  {submitting ? 'Sending…' : 'Extract and add'}
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
