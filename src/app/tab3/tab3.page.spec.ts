import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { FirebaseApp } from 'firebase/app';
import { deleteApp, getApps, initializeApp } from 'firebase/app';

import { Tab3Page } from './tab3.page';

describe('Tab3Page', () => {
  let component: Tab3Page;
  let fixture: ComponentFixture<Tab3Page>;
  let fakeApp: FirebaseApp | null = null;

  // Tab 3 reads the Firebase app when it is created. Unit tests do not run main.ts,
  // so start a fake app here. It never connects to anything and is removed afterwards.
  beforeAll(() => {
    if (getApps().length === 0) fakeApp = initializeApp({ apiKey: 'test', appId: 'test', projectId: 'test' });
  });

  afterAll(async () => {
    if (fakeApp) await deleteApp(fakeApp);
  });

  beforeEach(async () => {
    fixture = TestBed.createComponent(Tab3Page);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
