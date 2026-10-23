import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/public/landing/landing-page.component').then((m) => m.LandingPageComponent),
  },
  {
    path: 'legal',
    title: 'Aviso legal y privacidad · Manuel Cardoza',
    loadComponent: () => import('./features/public/legal/legal-page.component').then((m) => m.LegalPageComponent),
  },
  {
    path: 'articulos/:slug',
    loadComponent: () => import('./features/public/articles/article-page.component').then((m) => m.ArticlePageComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
