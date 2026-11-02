<script setup>
defineEmits(['action', 'close']);
</script>

<template>
  <div class="selection-bar">
    <button class="icon-btn" title="Close" @click="$emit('close')"><i class="bx bx-x"></i></button>
    <button class="icon-btn" title="Pin" @click="$emit('action', 'pin')"><i class="bx bx-pin"></i></button>
    <button class="icon-btn" title="Favorite" @click="$emit('action', 'favorite')">
      <i class="bx bx-heart"></i>
    </button>
    <button class="icon-btn" title="Archive" @click="$emit('action', 'archive')"><i class="bx bx-archive"></i></button>
    <button class="icon-btn" title="Lock in vault" @click="$emit('action', 'lock')">
      <i class="bx bx-shield"></i>
    </button>
    <button class="icon-btn" title="Duplicate" @click="$emit('action', 'duplicate')"><i class="bx bx-copy"></i></button>
    <button class="icon-btn" title="Merge into one note" @click="$emit('action', 'merge')"><i class="bx bx-duplicate"></i></button>
    <button class="icon-btn" title="Delete" style="color: #e5484d" @click="$emit('action', 'trash')">
      <i class="bx bx-trash"></i>
    </button>
  </div>
</template>

<style scoped>
.selection-bar .icon-btn {
  width: 34px;
  height: 34px;
  font-size: 15px;
}
</style>