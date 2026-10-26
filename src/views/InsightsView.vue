<script setup>
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '../components/EmptyState.vue';
import { getDB } from '../db/database.js';
import { getSetting, setSetting } from '../db/settings.js';
import { findTodaysNote, getOrCreateDailyNote } from '../db/daily.js';
import { wordCount } from '../utils/format.js';
import { dateKey } from '../utils/links.js';

const router = useRouter();
const openSidebar = inject('openSidebar', () => {});

const docs = ref([]);
const notebooks = ref([]);
const todayNote = ref(null);
const goal = ref(300);
let sub = null;

async function load() {
  const db = await getDB();
  docs.value = await db.notes.find({ selector: { trashed: false } }).exec();
  notebooks.value = await db.notebooks.find().exec();
  todayNote.value = await findTodaysNote();
}

onMounted(async () => {
  goal.value = (await getSetting('dailyWordGoal', 300)) || 300;
  await load();
  const db = await getDB();
  sub = db.notes.$.subscribe(() => load());
});

onUnmounted(() => sub?.unsubscribe());

const totals = computed(() => {
  let words = 0;
  let attachments = 0;
  let favorites = 0;
  let locked = 0;
  for (const doc of docs.value) {
    words += wordCount(doc.contentText || '');
    attachments += (doc.atts || []).length;
    if (doc.favorite) favorites += 1;
    if (doc.locked) locked += 1;
  }
  return {
    notes: docs.value.length,
    words,
    attachments,
    favorites,
    locked,
    average: docs.value.length ? Math.round(words / docs.value.length) : 0
  };
});

const activity = computed(() => {
  const map = {};
  for (const doc of docs.value) {
    const key = dateKey(doc.updated);
    map[key] = (map[key] || 0) + 1;
  }
  return map;
});

const daysWritten = computed(() => Object.keys(activity.value).length);

const streak = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!activity.value[dateKey(d)]) d.setDate(d.getDate() - 1);
  let count = 0;
  while (activity.value[dateKey(d)]) {
    count += 1;
    d.setDate(d.getDate() - 1);
  }
  return count;
});

const bestStreak = computed(() => {
  const keys = Object.keys(activity.value).sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const key of keys) {
    const t = new Date(`${key}T00:00:00`).getTime();
    run = prev && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
});

const heatWeeks = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(monday.getDate() - 11 * 7);

  const weeks = [];
  for (let w = 0; w < 12; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = dateKey(date);
      const count = activity.value[key] || 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
      week.push({
        key,
        count,
        level,
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        future: date > today
      });
    }
    weeks.push(week);
  }
  return weeks;
});

const topTags = computed(() => {
  const map = {};
  for (const doc of docs.value) for (const tag of doc.tags || []) map[tag] = (map[tag] || 0) + 1;
  const rows = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = rows[0]?.[1] || 1;
  return rows.map(([tag, count]) => ({ tag, count, width: Math.round((count / max) * 100) }));
});

const spaces = computed(() => {
  const names = new Map(notebooks.value.map((nb) => [nb.id, nb.title]));
  const map = {};
  for (const doc of docs.value) {
    const key = doc.notebookId || '';
    map[key] = (map[key] || 0) + 1;
  }
  return Object.entries(map)
    .map(([id, count]) => ({ id, count, title: id ? names.get(id) || 'Notebook' : 'No notebook' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
});

const todayWords = computed(() => wordCount(todayNote.value?.contentText || ''));
const goalPercent = computed(() => Math.min(100, Math.round((todayWords.value / (goal.value || 1)) * 100)));

async function saveGoal(value) {
  const v = Math.max(50, Math.min(5000, Number(value) || 300));
  goal.value = v;
  await setSetting('dailyWordGoal', v);
}

async function openToday() {
  const doc = todayNote.value || (await getOrCreateDailyNote());
  router.push({ name: 'editor', params: { id: doc.id } });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-topbar">
      <button class="icon-btn" @click="openSidebar()"><i class="pi pi-bars"></i></button>
      <div class="title">Insights<div class="subtitle">Your writing, at a glance</div></div>
    </header>

    <div class="scroll-area insights">
      <EmptyState
        v-if="!totals.notes"
        icon="pi pi-chart-bar"
        title="Nothing to measure yet"
        text="Write a note and your streak, heatmap and word counts will appear here."
      />

      <template v-else>
        <section class="insight-hero">
          <div class="streak-bubble">
            <span class="streak-num">{{ streak }}</span>
            <span class="streak-lbl">day streak</span>
          </div>
          <div class="hero-copy">
            <h2>{{ streak > 0 ? 'Keep the ink flowing' : 'Start a new streak today' }}</h2>
            <p>
              {{ daysWritten }} day{{ daysWritten === 1 ? '' : 's' }} of writing so far · best run
              {{ bestStreak }} day{{ bestStreak === 1 ? '' : 's' }}.
            </p>
          </div>
          <i class="pi pi-bolt hero-bolt"></i>
        </section>

        <section class="metric-grid">
          <div class="metric-card">
            <span class="metric-icon"><i class="pi pi-file-edit"></i></span>
            <span class="metric-value">{{ totals.notes }}</span>
            <span class="metric-label">notes</span>
          </div>
          <div class="metric-card">
            <span class="metric-icon"><i class="pi pi-pencil"></i></span>
            <span class="metric-value">{{ totals.words.toLocaleString() }}</span>
            <span class="metric-label">words written</span>
          </div>
          <div class="metric-card">
            <span class="metric-icon"><i class="pi pi-chart-line"></i></span>
            <span class="metric-value">{{ totals.average.toLocaleString() }}</span>
            <span class="metric-label">avg. words / note</span>
          </div>
          <div class="metric-card">
            <span class="metric-icon"><i class="pi pi-paperclip"></i></span>
            <span class="metric-value">{{ totals.attachments }}</span>
            <span class="metric-label">attachments</span>
          </div>
          <div class="metric-card">
            <span class="metric-icon"><i class="pi pi-heart"></i></span>
            <span class="metric-value">{{ totals.favorites }}</span>
            <span class="metric-label">favorites</span>
          </div>
          <div class="metric-card">
            <span class="metric-icon"><i class="pi pi-shield"></i></span>
            <span class="metric-value">{{ totals.locked }}</span>
            <span class="metric-label">in the vault</span>
          </div>
        </section>

        <section class="goal-card">
          <div class="goal-head">
            <div>
              <div class="card-eyebrow">Today's journal</div>
              <h3>{{ todayWords.toLocaleString() }} <span>/ {{ goal }} words</span></h3>
            </div>
            <Button
              :label="todayNote ? 'Open' : 'Start'"
              :icon="todayNote ? 'pi pi-arrow-right' : 'pi pi-plus'"
              size="small"
              @click="openToday"
            />
          </div>
          <div class="goal-progress">
            <div class="goal-fill" :style="{ width: `${goalPercent}%` }"></div>
          </div>
          <div class="goal-foot">
            <span>{{ goalPercent }}% of your daily goal</span>
            <span class="goal-edit">
              Goal
              <InputNumber
                :model-value="goal"
                :min="50"
                :max="5000"
                :step="50"
                :show-buttons="false"
                input-style="width: 58px"
                @update:model-value="saveGoal"
              />
            </span>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="card-eyebrow">Writing activity</span>
            <span class="panel-sub">last 12 weeks</span>
          </div>
          <div class="heat-wrap">
            <div class="heat-days">
              <span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span>
            </div>
            <div class="heat-grid">
              <div v-for="(week, i) in heatWeeks" :key="i" class="heat-col">
                <div
                  v-for="day in week"
                  :key="day.key"
                  class="heat-cell"
                  :class="[`lvl-${day.level}`, { future: day.future }]"
                  :title="`${day.label}: ${day.count} note${day.count === 1 ? '' : 's'}`"
                ></div>
              </div>
            </div>
          </div>
          <div class="heat-legend">
            <span>{{ daysWritten }} active days</span>
            <span class="legend-scale">
              less
              <i class="heat-cell lvl-0"></i><i class="heat-cell lvl-1"></i><i class="heat-cell lvl-2"></i><i class="heat-cell lvl-3"></i><i class="heat-cell lvl-4"></i>
              more
            </span>
          </div>
        </section>

        <section v-if="topTags.length" class="panel">
          <div class="panel-head">
            <span class="card-eyebrow">Top tags</span>
            <span class="panel-sub">your most used labels</span>
          </div>
          <div class="tag-bars">
            <div v-for="row in topTags" :key="row.tag" class="tag-bar">
              <span class="tag-name">#{{ row.tag }}</span>
              <span class="tag-track"><span class="tag-fill" :style="{ width: `${row.width}%` }"></span></span>
              <span class="tag-count">{{ row.count }}</span>
            </div>
          </div>
        </section>

        <section v-if="spaces.length" class="panel">
          <div class="panel-head">
            <span class="card-eyebrow">Spaces</span>
            <span class="panel-sub">notes per notebook</span>
          </div>
          <div class="space-rows">
            <div v-for="space in spaces" :key="space.id || 'none'" class="space-row">
              <i :class="space.id ? 'pi pi-folder' : 'pi pi-inbox'"></i>
              <span class="space-name">{{ space.title }}</span>
              <span class="space-count">{{ space.count }}</span>
            </div>
          </div>
        </section>

        <p class="insight-foot">
          Private by design: all of this is computed on your device from local notes.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.insights {
  max-width: 680px;
  margin: 0 auto;
  width: 100%;
}
.insight-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(125deg, var(--ink-primary), var(--ink-accent));
  border-radius: 20px;
  padding: 16px;
  color: var(--ink-on-accent);
  position: relative;
  overflow: hidden;
  margin-bottom: 12px;
}
.streak-bubble {
  width: 74px;
  height: 74px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.16);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: none;
  backdrop-filter: blur(4px);
}
.streak-num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
}
.streak-lbl {
  font-size: 9.5px;
  opacity: 0.85;
  text-transform: uppercase;
  letter-spacing: 0.7px;
  margin-top: 3px;
}
.hero-copy {
  flex: 1;
  min-width: 0;
}
.hero-copy h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 750;
}
.hero-copy p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  opacity: 0.85;
}
.hero-bolt {
  position: absolute;
  right: -8px;
  bottom: -18px;
  font-size: 86px;
  opacity: 0.1;
  transform: rotate(12deg);
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 9px;
  margin-bottom: 12px;
}
.metric-card {
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: 16px;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'icon value'
    'icon label';
  align-items: center;
  column-gap: 10px;
}
.metric-icon {
  grid-area: icon;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--ink-accent-soft);
  color: var(--ink-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.metric-value {
  grid-area: value;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.5px;
}
.metric-label {
  grid-area: label;
  font-size: 10.5px;
  color: var(--ink-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.goal-card,
.panel {
  background: var(--ink-surface);
  border: 1px solid var(--ink-border);
  border-radius: var(--ink-radius);
  padding: 14px;
  margin-bottom: 12px;
}
.goal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.goal-head h3 {
  margin: 3px 0 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.3px;
}
.goal-head h3 span {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text-muted);
  letter-spacing: 0;
}
.card-eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ink-text-muted);
}
.goal-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--ink-surface-3);
  overflow: hidden;
  margin: 12px 0 8px;
}
.goal-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ink-primary), var(--ink-accent));
  transition: width 0.3s ease;
}
.goal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: var(--ink-text-muted);
}
.goal-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.panel-sub {
  font-size: 10.5px;
  color: var(--ink-text-muted);
}
.heat-wrap {
  display: flex;
  gap: 6px;
}
.heat-days {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  row-gap: 3px;
  font-size: 8.5px;
  color: var(--ink-text-muted);
  padding-top: 1px;
  flex: none;
}
.heat-grid {
  display: flex;
  gap: 3px;
  flex: 1;
  min-width: 0;
  justify-content: space-between;
}
.heat-col {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
  flex: 1;
}
.heat-cell {
  display: inline-block;
  width: 100%;
  height: 12px;
  border-radius: 3px;
  background: var(--ink-surface-3);
}
.heat-days + .heat-grid .heat-cell {
  height: 12px;
}
.heat-cell.lvl-1 { background: color-mix(in srgb, var(--ink-accent) 30%, var(--ink-surface-3)); }
.heat-cell.lvl-2 { background: color-mix(in srgb, var(--ink-accent) 55%, var(--ink-surface-3)); }
.heat-cell.lvl-3 { background: color-mix(in srgb, var(--ink-accent) 78%, var(--ink-surface-3)); }
.heat-cell.lvl-4 { background: var(--ink-accent); }
.heat-cell.future {
  opacity: 0.25;
}
.heat-legend {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 9px;
  font-size: 10px;
  color: var(--ink-text-muted);
}
.legend-scale {
  display: flex;
  align-items: center;
  gap: 3px;
}
.legend-scale .heat-cell {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.tag-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
}
.tag-name {
  width: 92px;
  flex: none;
  color: var(--ink-accent);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--ink-surface-3);
  overflow: hidden;
}
.tag-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ink-primary), var(--ink-accent));
}
.tag-count {
  width: 22px;
  text-align: right;
  font-size: 10.5px;
  color: var(--ink-text-muted);
  flex: none;
}
.space-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.space-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 2px;
  font-size: 12.5px;
}
.space-row i {
  color: var(--ink-accent);
  font-size: 12px;
  width: 16px;
  text-align: center;
}
.space-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.space-count {
  font-size: 10.5px;
  color: var(--ink-text-muted);
  background: var(--ink-surface-3);
  border-radius: 999px;
  padding: 1px 8px;
}
.insight-foot {
  font-size: 10.5px;
  color: var(--ink-text-muted);
  text-align: center;
  padding: 4px 20px 24px;
  line-height: 1.5;
}

</style>

