import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { FlagService } from './core/flags/flag.service';
import { authGuard } from './core/guards/auth.guard';

/** Las decisiones de arquitectura existen solo con su flag: apagada, la ruta no casa y cae en la portada. */
const adrEnabled = () => inject(FlagService).isEnabled('site.adr');
const loadDecisions = () => import('./features/public/decisions/decisions-page.component').then((m) => m.DecisionsPageComponent);

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
    path: 'decisiones',
    title: 'Decisiones de arquitectura · Manuel Cardoza',
    canMatch: [adrEnabled],
    loadComponent: loadDecisions,
  },
  {
    path: 'decisiones/:slug',
    canMatch: [adrEnabled],
    loadComponent: loadDecisions,
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
