import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Tooltip from 'primevue/tooltip';
import Ripple from 'primevue/ripple';

import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Drawer from 'primevue/drawer';
import Dialog from 'primevue/dialog';
import Toast from 'primevue/toast';
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import Checkbox from 'primevue/checkbox';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import DatePicker from 'primevue/datepicker';
import ConfirmDialog from 'primevue/confirmdialog';
import Image from 'primevue/image';
import Divider from 'primevue/divider';
import Badge from 'primevue/badge';
import InputNumber from 'primevue/inputnumber';

import 'primeicons/primeicons.css';
import 'quill/dist/quill.snow.css';
import './styles/app.css';

import App from './App.vue';
import router from './router.js';
import { getDB } from './db/database.js';
import { initTheme } from './composables/useTheme.js';
import { loadVaultState } from './crypto/vault.js';
import { buildPreset } from './theme/presets.js';
import { themeId as currentTheme } from './composables/useTheme.js';

const GLOBAL_COMPONENTS = {
  Button,
  InputText,
  Textarea,
  Drawer,
  Dialog,
  Toast,
  Menu,
  Popover,
  Checkbox,
  ToggleSwitch,
  Select,
  DatePicker,
  ConfirmDialog,
  Image,
  Divider,
  Badge,
  InputNumber
};

async function boot() {
  // Open the local database first (IndexedDB, fully offline)
  await getDB();
  await initTheme();
  await loadVaultState();

  const app = createApp(App);

  app.use(PrimeVue, {
    ripple: true,
    theme: {
      preset: buildPreset(currentTheme.value),
      options: {
        darkModeSelector: '.inkwell-dark',
        cssLayer: false
      }
    }
  });
  app.use(ToastService);
  app.use(ConfirmationService);
  app.directive('tooltip', Tooltip);
  app.directive('ripple', Ripple);
  for (const [name, comp] of Object.entries(GLOBAL_COMPONENTS)) app.component(name, comp);
  app.use(router);

  app.mount('#app');

  // fade out the HTML boot splash once Vue owns the screen
  requestAnimationFrame(() => {
    document.getElementById('boot-splash')?.classList.add('hide');
    setTimeout(() => document.getElementById('boot-splash')?.remove(), 450);
  });
}

boot().catch((err) => {
  console.error('[inkwell] boot failed', err);
  const el = document.getElementById('boot-splash');
  if (el) el.innerHTML = `<div style="color:#ff7a59;padding:24px;font-family:sans-serif">
     Failed to start Inkwell:<br/>${String(err?.message || err)}</div>`;
});
