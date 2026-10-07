import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { loadRuntimeConfig } from './app/core/config/runtime-config';
import { environment } from './environments/environment';

// En desarrollo manda environment.development.ts; el archivo es para los despliegues.
const ready = environment.production ? loadRuntimeConfig() : Promise.resolve();

ready
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error(err));
