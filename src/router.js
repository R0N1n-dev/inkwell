import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/notes' },
  { path: '/notes', name: 'notes', component: () => import('./views/NotesView.vue') },
  { path: '/note/:id', name: 'editor', component: () => import('./views/EditorView.vue') },
  { path: '/notebooks', name: 'notebooks', component: () => import('./views/NotebooksView.vue') },
  { path: '/tags', name: 'tags', component: () => import('./views/TagsView.vue') },
  { path: '/trash', name: 'trash', component: () => import('./views/TrashView.vue') },
  { path: '/vault', name: 'vault', component: () => import('./views/VaultView.vue') },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
