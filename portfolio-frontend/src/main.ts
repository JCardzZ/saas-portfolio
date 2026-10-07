import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { fallBackToDemoIfBackendIsDown, loadRuntimeConfig } from './app/core/config/runtime-config';
import { environment } from './environments/environment';

/**
 * En los despliegues: primero la dirección de la API (/config.json) y luego si esa API responde;
 * si no, la aplicación arranca en modo demo. En desarrollo manda environment.development.ts.
 */
async function prepare(): Promise<void> {
  if (environment.production) {
    await loadRuntimeConfig();
    await fallBackToDemoIfBackendIsDown();
  }
}

prepare()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error(err));
