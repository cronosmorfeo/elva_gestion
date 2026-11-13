import type { Routes } from '@angular/router';

import { adminGuard } from '../auth/admin.guard';
import { authGuard } from '../auth/auth.guard';

import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'login',
        loadComponent: () => import('../login/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'tab2',
        loadComponent: () => import('../tab2/tab2.page').then((m) => m.Tab2Page),
      },
      {
        path: 'tab3',
        canActivate: [adminGuard],
        loadComponent: () => import('../tab3/tab3.page').then((m) => m.Tab3Page),
      },
      {
        path: 'inicio',
        canActivate: [authGuard],
        loadComponent: () => import('../home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'perfil',
        canActivate: [authGuard],
        loadComponent: () => import('../profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'vacaciones',
        canActivate: [authGuard],
        loadComponent: () => import('../vacation-request/vacation-request.page').then((m) => m.VacationRequestPage),
      },
      {
        path: 'horas-extra',
        canActivate: [authGuard],
        loadComponent: () => import('../overtime-request/overtime-request.page').then((m) => m.OvertimeRequestPage),
      },
      {
        path: 'solicitudes',
        canActivate: [authGuard],
        loadComponent: () => import('../my-requests/my-requests.page').then((m) => m.MyRequestsPage),
      },
      {
        path: 'avisos',
        canActivate: [authGuard],
        loadComponent: () => import('../notices/notices.page').then((m) => m.NoticesPage),
      },
      {
        path: 'reporte',
        canActivate: [authGuard],
        loadComponent: () => import('../reports/weekly-report.page').then((m) => m.WeeklyReportPage),
      },
      {
        path: 'dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('../admin-dashboard/admin-dashboard.page').then((m) => m.AdminDashboardPage),
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
