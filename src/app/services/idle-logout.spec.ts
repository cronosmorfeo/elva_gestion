import { TestBed } from '@angular/core/testing';

import { IDLE_STORAGE_KEY } from '../shared/idle';

import { IdleLogoutService } from './idle-logout';

describe('IdleLogoutService', () => {
  const min = 60_000;
  let service: IdleLogoutService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00'));
    localStorage.removeItem(IDLE_STORAGE_KEY);
    service = TestBed.inject(IdleLogoutService);
  });

  afterEach(() => {
    service.stop(true);
    vi.useRealTimers();
  });

  it('warns one minute before and closes after 30 minutes without use', () => {
    const timeout = vi.fn();
    service.start('u1', Date.now(), timeout);
    vi.advanceTimersByTime(28 * min);
    expect(service.warningSeconds()).toBeNull();
    vi.advanceTimersByTime(1 * min);
    expect(service.warningSeconds()).toBe(60);
    vi.advanceTimersByTime(1 * min);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(service.warningSeconds()).toBeNull();
    expect(localStorage.getItem(IDLE_STORAGE_KEY)).toBeNull();
  });

  it('activity keeps the session open', () => {
    const timeout = vi.fn();
    service.start('u1', Date.now(), timeout);
    vi.advanceTimersByTime(20 * min);
    document.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(20 * min);
    expect(timeout).not.toHaveBeenCalled();
    expect(service.warningSeconds()).toBeNull();
  });

  it('during the warning only "Sí, sigo aquí" keeps it open', () => {
    const timeout = vi.fn();
    service.start('u1', Date.now(), timeout);
    vi.advanceTimersByTime(29 * min + 10_000);
    document.dispatchEvent(new Event('pointermove'));
    expect(service.warningSeconds()).toBe(50);
    service.stillHere();
    expect(service.warningSeconds()).toBeNull();
    vi.advanceTimersByTime(20 * min);
    expect(timeout).not.toHaveBeenCalled();
  });

  it('closes right away a session that was left open longer than the limit', () => {
    localStorage.setItem(IDLE_STORAGE_KEY, JSON.stringify({ uid: 'u1', at: Date.now() - 2 * 60 * min }));
    const timeout = vi.fn();
    service.start('u1', Date.now() - 3 * 60 * min, timeout);
    expect(timeout).toHaveBeenCalledTimes(1);
  });

  it('a fresh sign-in starts the count again even if the saved activity is old', () => {
    localStorage.setItem(IDLE_STORAGE_KEY, JSON.stringify({ uid: 'u1', at: Date.now() - 2 * 60 * min }));
    const timeout = vi.fn();
    service.start('u1', Date.now(), timeout);
    expect(timeout).not.toHaveBeenCalled();
  });

  it('activity in another tab keeps this one open too', () => {
    const timeout = vi.fn();
    service.start('u1', Date.now(), timeout);
    vi.advanceTimersByTime(29 * min + 30_000);
    expect(service.warningSeconds()).toBe(30);
    const value = JSON.stringify({ uid: 'u1', at: Date.now() });
    window.dispatchEvent(new StorageEvent('storage', { key: IDLE_STORAGE_KEY, newValue: value }));
    expect(service.warningSeconds()).toBeNull();
    vi.advanceTimersByTime(20 * min);
    expect(timeout).not.toHaveBeenCalled();
  });
});
