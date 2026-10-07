import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { TechIconComponent } from '../../../shared/ui/tech-icon.component';
import { TECH_ICONS, TechIcon } from '../../../shared/ui/tech-icons';
import { CatalogCategory, CatalogItem, SERVICE_CATALOG } from './cloud-catalog.data';
import { CLOUD_PROVIDERS, CloudProviderId, forProvider, resolveIcon } from './cloud-topology.data';

/** Tipo MIME con el que viaja un servicio al arrastrarlo del catálogo al lienzo. */
export const CATALOG_DRAG_TYPE = 'application/x-cloud-service';

/**
 * Catálogo de servicios acoplado al lienzo, por categorías. Cada entrada muestra el nombre,
 * el logo y el recurso de Terraform de la nube activa. Se añade con un clic o arrastrándola.
 */
@Component({
  selector: 'app-service-catalog',
  standalone: true,
  imports: [TechIconComponent],
  templateUrl: './service-catalog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceCatalogComponent {
  readonly provider = input.required<CloudProviderId>();
  /** Categorías y servicios que se ofrecen; por defecto, los que lleva el estudio. */
  readonly catalog = input<CatalogCategory[]>(SERVICE_CATALOG);
  /** El catálogo viene del backend. */
  readonly fromServer = input(false);
  /** El visitante ha elegido un servicio para colocarlo en el lienzo. */
  readonly picked = output<CatalogItem>();

  readonly search = signal('');
  readonly providerName = computed(() => CLOUD_PROVIDERS.find((candidate) => candidate.id === this.provider())!.name);

  /** Categorías con los servicios que coinciden con la búsqueda (por función, nombre o recurso en la nube activa). */
  readonly categories = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.catalog().map((category) => ({
      ...category,
      items: category.items.filter((item) =>
        !term || `${item.capability} ${this.nameOf(item)} ${this.terraformOf(item)}`.toLowerCase().includes(term)),
    })).filter((category) => category.items.length > 0);
  });

  nameOf(item: CatalogItem): string {
    return forProvider(item.service, this.provider());
  }

  terraformOf(item: CatalogItem): string {
    return forProvider(item.terraform, this.provider());
  }

  iconOf(item: CatalogItem): TechIcon {
    return TECH_ICONS[resolveIcon(item.icon, this.provider())];
  }

  onDragStart(event: DragEvent, item: CatalogItem): void {
    event.dataTransfer?.setData(CATALOG_DRAG_TYPE, item.type);
    event.dataTransfer?.setData('text/plain', item.type);
  }
}
