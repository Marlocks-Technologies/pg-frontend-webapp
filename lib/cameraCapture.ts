import type { CaptureFrame } from './api';

export const MAX_CAPTURE_FRAMES = 12;
export const MAX_CAPTURE_TOTAL_BYTES = 7 * 1024 * 1024;
const MAX_FRAME_BYTES = 5 * 1024 * 1024;

type FrameOptions = {
  maxWidth?: number;
  quality?: number;
};

function waitForMediaEvent(
  target: HTMLMediaElement,
  eventName: 'loadedmetadata' | 'loadeddata' | 'seeked'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`The media could not be read while waiting for ${eventName}.`));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, handleEvent);
      target.removeEventListener('error', handleError);
    };
    target.addEventListener(eventName, handleEvent, { once: true });
    target.addEventListener('error', handleError, { once: true });
  });
}

function cameraUnavailableMessage(): string {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return [
      'Camera capture requires HTTPS or localhost.',
      'Open this page from a secure origin and try again.',
    ].join(' ');
  }
  return 'Camera capture is not supported in this browser.';
}

function getCameraMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  const legacyNavigator = navigator as Navigator & {
    getUserMedia?: (
      constraints: MediaStreamConstraints,
      successCallback: (stream: MediaStream) => void,
      errorCallback: (error: DOMException) => void
    ) => void;
    webkitGetUserMedia?: (
      constraints: MediaStreamConstraints,
      successCallback: (stream: MediaStream) => void,
      errorCallback: (error: DOMException) => void
    ) => void;
    mozGetUserMedia?: (
      constraints: MediaStreamConstraints,
      successCallback: (stream: MediaStream) => void,
      errorCallback: (error: DOMException) => void
    ) => void;
    msGetUserMedia?: (
      constraints: MediaStreamConstraints,
      successCallback: (stream: MediaStream) => void,
      errorCallback: (error: DOMException) => void
    ) => void;
  };
  const legacyGetUserMedia =
    legacyNavigator.getUserMedia ||
    legacyNavigator.webkitGetUserMedia ||
    legacyNavigator.mozGetUserMedia ||
    legacyNavigator.msGetUserMedia;

  if (!legacyGetUserMedia) {
    throw new Error(cameraUnavailableMessage());
  }

  return new Promise((resolve, reject) => {
    legacyGetUserMedia.call(navigator, constraints, resolve, reject);
  });
}

export function captureFrameBytes(frame: CaptureFrame): number {
  const encoded = frame.content.includes(',')
    ? frame.content.split(',', 2)[1]
    : frame.content;
  return Math.ceil((encoded.length * 3) / 4);
}

export function captureTotalBytes(frames: CaptureFrame[]): number {
  return frames.reduce((total, frame) => total + captureFrameBytes(frame), 0);
}

export function assertCaptureBudget(frames: CaptureFrame[]): void {
  if (frames.length > MAX_CAPTURE_FRAMES) {
    throw new Error(`A document can contain at most ${MAX_CAPTURE_FRAMES} captured frames.`);
  }
  if (frames.some(frame => captureFrameBytes(frame) > MAX_FRAME_BYTES)) {
    throw new Error('One captured frame is larger than the 5 MB OCR limit.');
  }
  if (captureTotalBytes(frames) > MAX_CAPTURE_TOTAL_BYTES) {
    throw new Error('The captured frames exceed the 7 MB document limit. Remove a frame and try again.');
  }
}

export function captureVideoFrame(
  video: HTMLVideoElement,
  { maxWidth = 1440, quality = 0.82 }: FrameOptions = {}
): CaptureFrame {
  if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('Wait for the camera or video preview to become ready.');
  }

  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create a capture frame.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const frame: CaptureFrame = {
    content: canvas.toDataURL('image/jpeg', quality),
    contentType: 'image/jpeg',
    capturedAt: new Date().toISOString(),
  };
  assertCaptureBudget([frame]);
  return frame;
}

export async function startDocumentCamera(
  video: HTMLVideoElement
): Promise<MediaStream> {
  if (typeof navigator === 'undefined') {
    throw new Error('Camera capture is only available in a browser.');
  }

  const stream = await getCameraMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopDocumentCamera(video: HTMLVideoElement | null): void {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach(track => track.stop());
  }
  if (video) video.srcObject = null;
}

export async function sampleVideoFile(
  file: File,
  onProgress?: (completed: number, total: number) => void
): Promise<CaptureFrame[]> {
  if (!file.type.startsWith('video/')) {
    throw new Error('Choose a valid video file.');
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await waitForMediaEvent(video, 'loadedmetadata');
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForMediaEvent(video, 'loadeddata');
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('The selected video does not have a readable duration.');
    }

    const frameCount = Math.min(
      MAX_CAPTURE_FRAMES,
      Math.max(1, Math.ceil(video.duration / 2))
    );
    const lastTimestamp = Math.max(0, video.duration - 0.08);
    const timestamps = Array.from({ length: frameCount }, (_, index) =>
      frameCount === 1 ? 0 : (lastTimestamp * index) / (frameCount - 1)
    );

    const frames: CaptureFrame[] = [];
    for (const [index, timestamp] of timestamps.entries()) {
      if (Math.abs(video.currentTime - timestamp) > 0.01) {
        video.currentTime = timestamp;
        await waitForMediaEvent(video, 'seeked');
      }
      const frame = captureVideoFrame(video, { maxWidth: 1280, quality: 0.76 });
      const nextFrames = [...frames, frame];
      assertCaptureBudget(nextFrames);
      frames.push(frame);
      onProgress?.(index + 1, timestamps.length);
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
