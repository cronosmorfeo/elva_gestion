import type { Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'login',
        loadComponent: () => import('../login/login.page').then((m) => m.loginPage),
      },
      {
        path: 'tab2',
        loadComponent: () => import('../tab2/tab2.page').then((m) => m.Tab2Page),
      },
      {
        path: 'tab3',
        loadComponent: () => import('../tab3/tab3.page').then((m) => m.Tab3Page),
      },
      {
        path: 'vacaciones',
        // TODO: add canActivate: [authGuard] (../auth/auth.guard) once the login is connected.
        loadComponent: () => import('../vacation-request/vacation-request.page').then((m) => m.VacationRequestPage),
      },
      {
        path: 'horas-extra',
        // TODO: add canActivate: [authGuard] (../auth/auth.guard) once the login is connected.
        loadComponent: () => import('../overtime-request/overtime-request.page').then((m) => m.OvertimeRequestPage),
      },
      {
        path: '',
        redirectTo: '/tabs/login',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/login',
    pathMatch: 'full',
  },
];
