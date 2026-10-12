import { Injectable, signal } from '@angular/core';
import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';

import { FEATURE_FLAGS, FeatureFlagKey, FlagValues, activeFlagsProvider } from './feature-flags';

/**
 * Las flags, como señal: un componente que pregunta por una se vuelve a pintar si cambia.
 * Pregunta siempre al cliente de OpenFeature; sin proveedor registrado (los tests), todo
 * está apagado.
 */
@Injectable({ providedIn: 'root' })
export class FlagService {
  private readonly client = OpenFeature.getClient();
  private readonly values = signal<FlagValues>(this.read());

  constructor() {
    const refresh = () => this.values.set(this.read());
    this.client.addHandler(ProviderEvents.Ready, refresh);
    this.client.addHandler(ProviderEvents.ConfigurationChanged, refresh);
  }

  isEnabled(key: FeatureFlagKey): boolean {
    return this.values()[key];
  }

  /** Refleja en esta sesión un cambio que la administración acaba de guardar. */
  apply(key: FeatureFlagKey, enabled: boolean): void {
    activeFlagsProvider()?.set(key, enabled);
  }

  private read(): FlagValues {
    return Object.fromEntries(FEATURE_FLAGS.map((key) => [key, this.client.getBooleanValue(key, false)])) as FlagValues;
  }
}
