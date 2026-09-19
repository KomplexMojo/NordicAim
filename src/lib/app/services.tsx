// React context that hands screens the browser `ServiceContext` plus the browser image and render tools.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { browserImageTools } from '@/lib/media/image-browser';
import { browserRenderTools, type RenderTools } from '@/lib/render/rasterize-browser';
import type { ServiceContext } from '@/lib/services/context';
import { openAppDb } from '@/lib/store/db';
import { migrateBackingToSettings } from '@/lib/store/migrate-backing';

export interface AppServices {
  ctx: ServiceContext;
  imageTools: typeof browserImageTools;
  renderTools: RenderTools;
}

let servicesPromise: Promise<AppServices> | null = null;

/** Opens the app database once and builds the browser ServiceContext (shared by the provider and test hooks). */
// eslint-disable-next-line react-refresh/only-export-components -- shared by the provider and test hooks
export function loadAppServices(): Promise<AppServices> {
  if (servicesPromise === null) {
    servicesPromise = openAppDb().then(async (db) => {
      // backing-sheet.md §3a (REV-48): before any screen or the pipeline reads a record.
      await migrateBackingToSettings(db);
      return {
        ctx: { db, now: () => new Date(), newId: () => crypto.randomUUID() },
        imageTools: browserImageTools,
        renderTools: browserRenderTools,
      };
    });
    servicesPromise.catch(() => {
      servicesPromise = null;
    });
  }
  return servicesPromise;
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAppServices().then(
      (s) => {
        if (!cancelled) setServices(s);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null) {
    return <p className="p-6 text-center text-destructive">Could not open on-device storage: {error}</p>;
  }
  if (services === null) {
    return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  }
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}
