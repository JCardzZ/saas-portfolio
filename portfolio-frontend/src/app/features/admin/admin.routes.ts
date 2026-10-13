import { Routes } from '@angular/router';

import { AdminLayoutComponent } from './layout/admin-layout.component';

import { permissionGuard } from '../../core/guards/permission.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      {
        path: 'technologies',
        canActivate: [permissionGuard('cms:read')],
        loadComponent: () =>
          import('./technologies/technologies-page.component').then((m) => m.TechnologiesPageComponent),
      },
      {
        path: 'projects',
        canActivate: [permissionGuard('cms:read')],
        loadComponent: () => import('./projects/projects-page.component').then((m) => m.ProjectsPageComponent),
      },
      {
        path: 'articles',
        canActivate: [permissionGuard('cms:read')],
        loadComponent: () => import('./articles/articles-page.component').then((m) => m.ArticlesPageComponent),
      },
      {
        path: 'assistant',
        canActivate: [permissionGuard('ai:reindex', 'profile:write')],
        loadComponent: () =>
          import('./assistant/assistant-admin-page.component').then((m) => m.AssistantAdminPageComponent),
      },
      {
        path: 'features',
        canActivate: [permissionGuard('flags:read')],
        loadComponent: () => import('./features/features-page.component').then((m) => m.FeaturesPageComponent),
      },
      {
        path: 'users',
        canActivate: [permissionGuard('users:manage')],
        loadComponent: () => import('./users/users-page.component').then((m) => m.UsersPageComponent),
      },
      // El inicio del panel no pide permiso: enseña lo que cada uno puede abrir.
      { path: '', pathMatch: 'full', loadComponent: () => import('./home/admin-home.component').then((m) => m.AdminHomeComponent) },
    ],
  },
];
