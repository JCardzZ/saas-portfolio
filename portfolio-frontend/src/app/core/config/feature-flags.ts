/**
 * Funciones que se pueden apagar sin retirar su código. Se compilan con la aplicación: no se
 * cambian desde `/config.json`.
 */
const FLAGS = {
  /** Paleta de comandos: búsqueda local y accesos rápidos sobre el panel del asistente (⌘K). */
  'ui.command-palette': true,
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function featureEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag];
}
