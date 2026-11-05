import { Component, DestroyRef, EnvironmentInjector, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IonHeader, IonTabs, IonToolbar } from '@ionic/angular';
import { getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

import { isAdminRole } from '../auth/admin.guard';
import { isSignedIn } from '../auth/auth.guard';
import { RequestsStore } from '../services/requests-store';

// Pages that have their own header, so the navbar stays hidden there.
const OWN_HEADER = ['/tabs/login', '/tabs/dashboard', '/tabs/tab3'];

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonHeader, IonToolbar, IonTabs, RouterLink, RouterLinkActive],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly router = inject(Router);
  private readonly store = inject(RequestsStore);

  readonly unseenNotices = this.store.unseenNotices;
  readonly signedIn = signal(false);
  readonly isAdmin = signal(false);
  readonly ownHeader = signal(true);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const routerEvents = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.ownHeader.set(hasOwnHeader(event.urlAfterRedirects));
    });
    destroyRef.onDestroy(() => routerEvents.unsubscribe());

    // Firebase is set up in main.ts; unit tests run without it.
    if (getApps().length === 0) return;
    const stop = onAuthStateChanged(getAuth(), (user) => {
      this.signedIn.set(isSignedIn(user));
      this.isAdmin.set(false);
      if (user && isSignedIn(user)) void this.loadRole(user.uid);
    });
    destroyRef.onDestroy(stop);
  }

  async logout(): Promise<void> {
    await signOut(getAuth());
    this.store.forgetWorker();
    await this.router.navigateByUrl('/tabs/login', { replaceUrl: true });
  }

  // Only decides whether to show the link to the panel; adminGuard still protects the page.
  private async loadRole(uid: string): Promise<void> {
    try {
      const snap = await getDoc(doc(getFirestore(), 'colaboradores', uid));
      this.isAdmin.set(isAdminRole(snap.data()?.['tipo_colaborador']));
    } catch {
      this.isAdmin.set(false);
    }
  }
}

function hasOwnHeader(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/' || OWN_HEADER.some((page) => path.startsWith(page));
}
