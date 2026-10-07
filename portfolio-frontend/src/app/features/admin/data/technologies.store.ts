import { Injectable, inject } from '@angular/core';

import { AdminTechnologiesCMSService, Technology, TechnologyRequest } from '../../../core/api';
import { CrudApi, CrudStore } from '../../../shared/data/crud-store';

@Injectable()
export class TechnologiesStore extends CrudStore<Technology, TechnologyRequest> {
  private readonly service = inject(AdminTechnologiesCMSService);

  protected readonly api: CrudApi<Technology, TechnologyRequest> = {
    list: () => this.service.adminTechnologiesGet(),
    create: (request) => this.service.adminTechnologiesPost(request),
    update: (id, request) => this.service.adminTechnologiesIdPut(id, request),
    remove: (id) => this.service.adminTechnologiesIdDelete(id),
  };
}
