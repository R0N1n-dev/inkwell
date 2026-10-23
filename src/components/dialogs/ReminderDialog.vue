<script setup>
import { ref, watch } from 'vue';

const props = defineProps({ visible: Boolean, modelValue: { type: Number, default: 0 } });
const emit = defineEmits(['update:visible', 'update:modelValue']);

const date = ref(null);

watch(
  () => props.visible,
  (v) => {
    if (v) date.value = props.modelValue ? new Date(props.modelValue) : null;
  }
);

function quick(kind) {
  const d = new Date();
  if (kind === 'hour') d.setHours(d.getHours() + 1, 0, 0, 0);
  if (kind === 'tonight') {
    d.setHours(20, 0, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
  }
  if (kind === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  if (kind === 'week') {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
  }
  date.value = d;
  save();
}

function save() {
  emit('update:modelValue', date.value ? new Date(date.value).getTime() : 0);
  emit('update:visible', false);
}

function clear() {
  emit('update:modelValue', 0);
  emit('update:visible', false);
}
</script>

<template>
  <Dialog v-model:visible="props.visible" modal header="Reminder" :style="{ width: '360px', maxWidth: '92vw' }">
    <div class="quick">
      <Button label="In 1 hour" size="small" severity="secondary" text @click="quick('hour')" />
      <Button label="Tonight 8pm" size="small" severity="secondary" text @click="quick('tonight')" />
      <Button label="Tomorrow 9am" size="small" severity="secondary" text @click="quick('tomorrow')" />
      <Button label="Next week" size="small" severity="secondary" text @click="quick('week')" />
    </div>
    <Divider />
    <DatePicker
      v-model="date"
      showTime
      hourFormat="24"
      :showIcon="true"
      :minDate="new Date()"
      class="w-full"
      placeholder="Pick date & time"
    />
    <div class="row" style="justify-content: space-between; margin-top: 16px">
      <Button label="Remove" severity="danger" text icon="pi pi-trash" @click="clear" />
      <Button label="Set reminder" icon="pi pi-bell" @click="save" />
    </div>
  </Dialog>
</template>

<style scoped>
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.w-full {
  width: 100%;
}
</style>
