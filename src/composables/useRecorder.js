import { ref, onScopeDispose } from 'vue';
import { requestMicPermission } from '../platform/media.js';
import { formatDuration } from '../utils/format.js';

const MIME_CANDIDATES = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg']
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime] of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(mime)) return mime;
  }
  return null;
}

export function useRecorder() {
  const recording = ref(false);
  const elapsed = ref(0);
  const level = ref(0);
  const pretty = ref('0:00');

  let recorder = null;
  let stream = null;
  let chunks = [];
  let timer = null;
  let audioCtx = null;
  let analyser = null;
  let rafId = null;

  async function start() {
    const allowed = await requestMicPermission();
    if (!allowed) throw new Error('Microphone permission denied');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    // level meter
    try {
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        level.value = Math.min(1, peak / 64);
        rafId = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* meter is optional */
    }

    recorder.start(250);
    recording.value = true;
    elapsed.value = 0;
    pretty.value = '0:00';
    const startedAt = Date.now();
    timer = setInterval(() => {
      elapsed.value = (Date.now() - startedAt) / 1000;
      pretty.value = formatDuration(elapsed.value);
    }, 250);
  }

  function stopTracks() {
    stream?.getTracks().forEach((t) => t.stop());
    clearInterval(timer);
    cancelAnimationFrame(rafId);
    audioCtx?.close?.().catch(() => {});
    audioCtx = null;
    level.value = 0;
  }

  function stop() {
    return new Promise((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        stopTracks();
        recording.value = false;
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        stopTracks();
        recording.value = false;
        const mime = recorder.mimeType || 'audio/webm';
        const ext = MIME_CANDIDATES.find(([m]) => m === mime)?.[1] || 'webm';
        const blob = new Blob(chunks, { type: mime });
        blob.arrayBuffer().then((buf) => {
          resolve({
            bytes: new Uint8Array(buf),
            mime,
            ext,
            name: `recording-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`,
            seconds: elapsed.value
          });
        });
      };
      recorder.stop();
    });
  }

  function cancel() {
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => stopTracks();
      recorder.stop();
    } else {
      stopTracks();
    }
    recording.value = false;
  }

  onScopeDispose(() => cancel());

  return { recording, elapsed, level, pretty, start, stop, cancel };
}
