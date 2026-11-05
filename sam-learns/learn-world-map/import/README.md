# Importing learn-world-map's decks

`mise run import-world-map [<sam-learns-things>]` (from the repo root) rebuilds `decks/whole-world` and
`decks/africa` from a sam-learns-things checkout (`public/data/world-map/`), then publishes them. Rerunning it with
the same input changes nothing.

- `iso-3166-m49.csv`: ISO 3166 codes with their UN M49 regions, from
  [lukes/ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes)
  (`all/all.csv`, fetched 2026-11-05). The Africa deck is the countries whose region is Africa; `alpha2` comes from here too.
- The map (`map.geo.json`) is Natural Earth's, whose codes differ from ISO for a few places. `import.ts` maps those
  to ISO where one exists (South Sudan `SDS` → `SSD`, …). The few with no ISO code of their own (Somaliland,
  Kosovo, …) keep Natural Earth's code, and take their region from the ISO country they're internationally counted in.
