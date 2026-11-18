import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

import type { FeatureFlag } from '../services/feature-flags';
import { FeatureFlagsService } from '../services/feature-flags';

// Sends a page that is turned off back to Inicio, so it cannot be opened with its link either.
export const featureGuard =
  (flag: FeatureFlag): CanActivateFn =>
  async () => {
    const service = inject(FeatureFlagsService);
    const router = inject(Router);
    await service.load();
    return service.flags()[flag] ? true : router.parseUrl('/tabs/inicio');
  };
