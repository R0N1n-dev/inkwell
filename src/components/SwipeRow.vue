<script setup>
import { ref } from 'vue';

const props = defineProps({
  disabled: Boolean,
  leftIcon: { type: String, default: 'pi pi-box' },
  rightIcon: { type: String, default: 'pi pi-trash' },
  leftColor: { type: String, default: '#3E63DD' },
  rightColor: { type: String, default: '#E5484D' }
});
const emit = defineEmits(['swipe-left', 'swipe-right', 'longpress']);

const TRIGGER = 92;
const MAX = 150;

const dx = ref(0);
const animated = ref(true);

let startX = 0;
let startY = 0;
let dragging = false;
let locked = false; // axis decided
let holdTimer = null;
let moved = false;
const suppressClick = ref(false);

function swallowClick(e) {
  if (suppressClick.value) {
    e.stopPropagation();
    e.preventDefault();
  }
}

function suppressFor(ms = 400) {
  suppressClick.value = true;
  setTimeout(() => (suppressClick.value = false), ms);
}

function onPointerDown(e) {
  if (props.disabled) return;
  if (e.target.closest('button, audio, video, a, input, .no-swipe')) return;
  startX = e.clientX;
  startY = e.clientY;
  dragging = true;
  locked = false;
  moved = false;
  animated.value = false;
  holdTimer = setTimeout(() => {
    if (!moved) {
      suppressFor();
      emit('longpress');
      dragging = false;
      dx.value = 0;
      animated.value = true;
    }
  }, 480);
}

function onPointerMove(e) {
  if (!dragging) return;
  const ddx = e.clientX - startX;
  const ddy = e.clientY - startY;
  if (!locked) {
    if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.4) locked = true;
    else if (Math.abs(ddy) > 14) {
      dragging = false;
      clearTimeout(holdTimer);
      animated.value = true;
      dx.value = 0;
      return;
    } else return;
  }
  if (Math.abs(ddx) > 6) moved = true;
  clearTimeout(holdTimer);
  // rubber-band past max
  const clamped = Math.max(-MAX, Math.min(MAX, ddx));
  dx.value = clamped * (Math.abs(ddx) > MAX ? 0.6 : 1);
}

function finish(direction) {
  animated.value = true;
  dx.value = 0;
  if (direction) {
    suppressFor();
    emit(direction > 0 ? 'swipe-right' : 'swipe-left');
  }
}

function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  clearTimeout(holdTimer);
  const v = dx.value;
  if (v > TRIGGER) finish(1);
  else if (v < -TRIGGER) finish(-1);
  else finish(0);
}

const leftOpacity = () => Math.min(1, Math.max(0, dx.value / TRIGGER));
const rightOpacity = () => Math.min(1, Math.max(0, -dx.value / TRIGGER));
</script>

<template>
  <div
    class="swipe-row"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerUp"
    @click.capture="swallowClick"
  >
    <div
      class="swipe-bg"
      :style="{
        background: `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} 45%, ${rightColor} 55%, ${rightColor} 100%)`
      }"
    >
      <span class="left" :style="{ opacity: leftOpacity() }"><i :class="leftIcon"></i></span>
      <span class="right" :style="{ opacity: rightOpacity() }"><i :class="rightIcon"></i></span>
    </div>
    <div
      class="swipe-content"
      :style="{
        transform: `translateX(${dx}px)`,
        transition: animated ? 'transform 0.22s cubic-bezier(.2,.8,.3,1)' : 'none'
      }"
    >
      <slot />
    </div>
  </div>
</template>
