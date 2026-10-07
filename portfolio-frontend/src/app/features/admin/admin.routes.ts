import { Routes } from '@angular/router';

import { AdminLayoutComponent } from './layout/admin-layout.component';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      {
        path: 'technologies',
        loadComponent: () =>
          import('./technologies/technologies-page.component').then((m) => m.TechnologiesPageComponent),
      },
      {
        path: 'projects',
        loadComponent: () => import('./projects/projects-page.component').then((m) => m.ProjectsPageComponent),
      },
      {
        path: 'articles',
        loadComponent: () => import('./articles/articles-page.component').then((m) => m.ArticlesPageComponent),
      },
      {
        path: 'assistant',
        loadComponent: () =>
          import('./assistant/assistant-admin-page.component').then((m) => m.AssistantAdminPageComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'technologies' },
    ],
  },
];
