import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { fallBackToDemoIfBackendIsDown, loadRuntimeConfig } from './app/core/config/runtime-config';
import { loadFeatureFlags } from './app/core/flags/feature-flags';
import { environment } from './environments/environment';

/**
 * En los despliegues: primero la dirección de la API (/config.json) y luego si esa API responde;
 * si no, la aplicación arranca en modo demo. En desarrollo manda environment.development.ts.
 * Lo último son las feature flags, que deciden qué partes nuevas se pintan.
 */
async function prepare(): Promise<void> {
  if (environment.production) {
    await loadRuntimeConfig();
    await fallBackToDemoIfBackendIsDown();
  }
  // Después de saber si hay backend: en modo demo las flags no se piden a la API.
  await loadFeatureFlags();
}

prepare()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error(err));
