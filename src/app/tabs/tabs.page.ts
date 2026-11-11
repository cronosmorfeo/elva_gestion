import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, EnvironmentInjector, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IonHeader, IonTabs, IonToolbar, ToastController } from '@ionic/angular';
import { getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

import { isAdminRole } from '../auth/admin.guard';
import { isSignedIn } from '../auth/auth.guard';
import { NotificationCardsComponent } from '../notification-cards/notification-cards.component';
import { NotificationsService, notifyMessage } from '../services/notifications';
import { RequestsStore } from '../services/requests-store';

// Pages that have their own header, so the navbar stays hidden there.
const OWN_HEADER = ['/tabs/login', '/tabs/dashboard', '/tabs/tab3'];

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonHeader, IonToolbar, IonTabs, NgTemplateOutlet, RouterLink, RouterLinkActive, NotificationCardsComponent],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly router = inject(Router);
  private readonly store = inject(RequestsStore);
  private readonly notifications = inject(NotificationsService);
  private readonly toast = inject(ToastController);

  readonly notifyState = this.notifications.state;
  readonly unseenNotices = this.store.unseenNotices;
  readonly signedIn = signal(false);
  readonly isAdmin = signal(false);
  readonly ownHeader = signal(true);
  // Small screens only: the list of links under the bar.
  readonly menuOpen = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const routerEvents = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.ownHeader.set(hasOwnHeader(event.urlAfterRedirects));
        this.menuOpen.set(false);
      }
    });
    destroyRef.onDestroy(() => routerEvents.unsubscribe());

    // Firebase is set up in main.ts; unit tests run without it.
    if (getApps().length === 0) return;
    const stop = onAuthStateChanged(getAuth(), (user) => {
      this.signedIn.set(isSignedIn(user));
      this.isAdmin.set(false);
      if (user && isSignedIn(user)) void this.loadRole(user.uid);
      else this.store.forgetWorker();
    });
    destroyRef.onDestroy(stop);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  async enableNotifications(): Promise<void> {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;
    const toast = await this.toast.create({
      message: notifyMessage(await this.notifications.enable(uid)),
      duration: 5000,
      position: 'bottom',
    });
    await toast.present();
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.notifications.disable();
    await signOut(getAuth());
    this.store.forgetWorker();
    await this.router.navigateByUrl('/tabs/login', { replaceUrl: true });
  }

  // Decides whether to show the link to the panel (adminGuard still protects the page)
  // and whether the store loads everyone's requests or only this person's.
  private async loadRole(uid: string): Promise<void> {
    try {
      const snap = await getDoc(doc(getFirestore(), 'colaboradores', uid));
      this.isAdmin.set(isAdminRole(snap.data()?.['tipo_colaborador']));
    } catch {
      this.isAdmin.set(false);
    }
    this.store.watch(uid, this.isAdmin());
    void this.notifications.resume(uid);
  }
}

function hasOwnHeader(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/' || OWN_HEADER.some((page) => path.startsWith(page));
}
