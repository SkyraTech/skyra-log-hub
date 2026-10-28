// Import and register all authoritative Skyra Platform Web Components
import '@skyra-tech-platform/app-shell';
import '@skyra-tech-platform/badge';
import '@skyra-tech-platform/button';
import '@skyra-tech-platform/checkbox';
import '@skyra-tech-platform/data-table';
import '@skyra-tech-platform/dialog';
import '@skyra-tech-platform/drawer';
import '@skyra-tech-platform/dropdown-menu';
import '@skyra-tech-platform/empty-state';
import '@skyra-tech-platform/input';
import '@skyra-tech-platform/loader';
import '@skyra-tech-platform/notification';
import '@skyra-tech-platform/popover';
import '@skyra-tech-platform/switch';
import '@skyra-tech-platform/tabs';
import '@skyra-tech-platform/toast';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error('Skyra LogHub Console bootstrap error:', err)
);
