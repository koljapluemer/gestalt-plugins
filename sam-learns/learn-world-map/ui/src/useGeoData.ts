import { useEffect, useState } from 'react';
import { logger, useRepo } from '@gestalts/sdk';
import type { Feature, FeatureCollection } from 'geojson';
import type { Country } from './model';

const log = logger('world-map');

/** Parsed geometry blobs by name (blob names are content hashes, so they never change meaning). */
const cache = new Map<string, Promise<Feature | null>>();

/**
 * The map: every given country's `geometry` blob, as one feature collection (features keyed by `properties.code`).
 * `null` while loading.
 */
export function useGeoData(countries: Country[]): FeatureCollection | null {
  const repo = useRepo();
  const names = countries.flatMap((c) => (c.geometry ? [c.geometry] : [])).sort();
  const key = names.join();
  const [geo, setGeo] = useState<{ key: string; data: FeatureCollection } | null>(null);
  useEffect(() => {
    let live = true;
    const load = (name: string) => {
      let p = cache.get(name);
      if (!p) {
        p = repo.readBlob(name).then((bytes) => (bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as Feature) : null)).catch((e: unknown) => {
          log.warn('geometry', { name, error: String(e) });
          cache.delete(name);
          return null;
        });
        cache.set(name, p);
      }
      return p;
    };
    void Promise.all(key ? key.split(',').map(load) : []).then((features) => {
      if (live) setGeo({ key, data: { type: 'FeatureCollection', features: features.filter((f): f is Feature => !!f) } });
    });
    return () => { live = false; };
  }, [repo, key]);
  return geo && geo.key === key ? geo.data : null;
}
