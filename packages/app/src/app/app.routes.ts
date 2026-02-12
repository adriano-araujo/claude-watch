import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/sessions/sessions.component').then((m) => m.SessionsComponent),
  },
  {
    path: 'pair',
    loadComponent: () =>
      import('./pages/pair/pair.component').then((m) => m.PairComponent),
  },
  {
    path: 'approval/:sessionId',
    loadComponent: () =>
      import('./pages/approval/approval.component').then((m) => m.ApprovalComponent),
  },
];
