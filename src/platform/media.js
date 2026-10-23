import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { isNative, getBridge } from './cap.js';
import { base64ToBytes } from '../utils/format.js';

/** Capture with the camera. Returns {bytes, mime, name} */
export async function capturePhoto() {
  const photo = await Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera
  });
  return {
    bytes: base64ToBytes(photo.base64String),
    mime: photo.format === 'png' ? 'image/png' : 'image/jpeg',
    name: `photo-${Date.now()}.jpg`
  };
}

/** Pick image(s) from the gallery. Returns array of {bytes, mime, name} */
export async function pickImages(limit = 4) {
  if (isNative) {
    const res = await FilePicker.pickImages({ limit, readData: true });
    return (res.files || [])
      .filter((f) => f.data)
      .map((f) => ({
        bytes: base64ToBytes(f.data),
        mime: f.mimeType || 'image/jpeg',
        name: f.name || `image-${Date.now()}`
      }));
  }
  // web fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = limit > 1;
    input.onchange = async () => {
      const out = [];
      for (const file of input.files || []) {
        const buf = await file.arrayBuffer();
        out.push({ bytes: new Uint8Array(buf), mime: file.type, name: file.name });
      }
      resolve(out);
    };
    input.click();
  });
}

/** Pick audio or any file. Returns array of {bytes, mime, name} */
export async function pickFiles(limit = 3) {
  if (isNative) {
    const res = await FilePicker.pickFiles({
      types: ['audio/*', 'application/pdf', 'text/*'],
      readData: true
    });
    return (res.files || [])
      .filter((f) => f.data)
      .map((f) => ({
        bytes: base64ToBytes(f.data),
        mime: f.mimeType || 'application/octet-stream',
        name: f.name || `file-${Date.now()}`
      }));
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = limit > 1;
    input.onchange = async () => {
      const out = [];
      for (const file of input.files || []) {
        const buf = await file.arrayBuffer();
        out.push({ bytes: new Uint8Array(buf), mime: file.type, name: file.name });
      }
      resolve(out);
    };
    input.click();
  });
}

/** Ask the OS for microphone permission (native bridge method). */
export async function requestMicPermission() {
  if (!isNative) {
    const st = await navigator.mediaDevices?.getUserMedia?.({ audio: true })
      .then((s) => {
        s.getTracks().forEach((t) => t.stop());
        return true;
      })
      .catch(() => false);
    return !!st;
  }
  const bridge = await getBridge();
  if (!bridge) return false;
  const { granted } = await bridge.requestAudioPermission();
  return !!granted;
}
