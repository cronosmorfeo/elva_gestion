import type { Routes } from '@angular/router';

import { adminGuard } from '../auth/admin.guard';
import { authGuard } from '../auth/auth.guard';
import { featureGuard } from '../auth/feature.guard';

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
        // Firebase's e-mail link (new account or "¿Olvidó su contraseña?") opens here; no session needed.
        path: 'restablecer',
        loadComponent: () => import('../password/reset-password.page').then((m) => m.ResetPasswordPage),
      },
      {
        // Change your own password (the current one is asked again).
        path: 'contrasena',
        canActivate: [authGuard],
        loadComponent: () => import('../password/password.page').then((m) => m.PasswordPage),
      },
      {
        path: 'vacaciones',
        canActivate: [authGuard, featureGuard('vacaciones')],
        loadComponent: () => import('../vacation-request/vacation-request.page').then((m) => m.VacationRequestPage),
      },
      {
        path: 'horas-extra',
        canActivate: [authGuard, featureGuard('horasExtra')],
        loadComponent: () => import('../overtime-request/overtime-request.page').then((m) => m.OvertimeRequestPage),
      },
      {
        path: 'solicitudes',
        canActivate: [authGuard],
        loadComponent: () => import('../my-requests/my-requests.page').then((m) => m.MyRequestsPage),
      },
      {
        path: 'avisos',
        canActivate: [authGuard, featureGuard('avisos')],
        loadComponent: () => import('../notices/notices.page').then((m) => m.NoticesPage),
      },
      {
        path: 'reporte',
        canActivate: [authGuard, featureGuard('reportes')],
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
