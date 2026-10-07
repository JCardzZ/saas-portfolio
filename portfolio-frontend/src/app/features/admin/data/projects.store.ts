import { Injectable, inject } from '@angular/core';

import { AdminProjectsCMSService, Project, ProjectRequest } from '../../../core/api';
import { CrudApi, CrudStore } from '../../../shared/data/crud-store';

@Injectable()
export class ProjectsStore extends CrudStore<Project, ProjectRequest> {
  private readonly service = inject(AdminProjectsCMSService);

  protected readonly api: CrudApi<Project, ProjectRequest> = {
    list: () => this.service.adminProjectsGet(),
    create: (request) => this.service.adminProjectsPost(request),
    update: (id, request) => this.service.adminProjectsIdPut(id, request),
    remove: (id) => this.service.adminProjectsIdDelete(id),
  };
}
