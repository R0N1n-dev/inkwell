<script setup>
defineEmits(['action', 'close']);
</script>

<template>
  <div class="selection-bar">
    <button class="icon-btn" title="Close" @click="$emit('close')"><i class="pi pi-times"></i></button>
    <button class="icon-btn" title="Pin" @click="$emit('action', 'pin')"><i class="pi pi-thumbtack"></i></button>
    <button class="icon-btn" title="Favorite" @click="$emit('action', 'favorite')">
      <i class="pi pi-heart"></i>
    </button>
    <button class="icon-btn" title="Archive" @click="$emit('action', 'archive')"><i class="pi pi-box"></i></button>
    <button class="icon-btn" title="Lock in vault" @click="$emit('action', 'lock')">
      <i class="pi pi-shield"></i>
    </button>
    <button class="icon-btn" title="Duplicate" @click="$emit('action', 'duplicate')"><i class="pi pi-copy"></i></button>
    <button class="icon-btn" title="Merge into one note" @click="$emit('action', 'merge')"><i class="pi pi-objects-column"></i></button>
    <button class="icon-btn" title="Delete" style="color: #e5484d" @click="$emit('action', 'trash')">
      <i class="pi pi-trash"></i>
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