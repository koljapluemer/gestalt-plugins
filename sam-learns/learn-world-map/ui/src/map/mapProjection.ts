import { geoCentroid, geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { ZoomTransform, zoomIdentity } from 'd3-zoom'
import type { Feature, FeatureCollection } from 'geojson'

export const PAN_GRID_SIZE = 3

const ZOOM_MIN = 100
const ZOOM_RANGE = 75
const ZOOM_COUNTRY_WEIGHT = 0.6

const MARKER_TARGET_RADIUS_PX = 15
const MARKER_MIN_FRACTION = 0.03
const MARKER_MAX_FRACTION = 0.14

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function zoomProgress(zoomLevel: number | undefined): number {
  if (!zoomLevel) return 0
  return clamp01((zoomLevel - ZOOM_MIN) / ZOOM_RANGE)
}

export function interpolateScale(worldScale: number, countryScale: number, progress: number): number {
  const maxZoomScale = worldScale + (countryScale - worldScale) * ZOOM_COUNTRY_WEIGHT
  return worldScale + (maxZoomScale - worldScale) * progress
}

export function panIndexToTranslate(panIndex: number, width: number, height: number): [number, number] {
  const cellWidth = width / PAN_GRID_SIZE
  const cellHeight = height / PAN_GRID_SIZE
  const cellX = panIndex % PAN_GRID_SIZE
  const cellY = Math.floor(panIndex / PAN_GRID_SIZE)
  return [cellX * cellWidth + cellWidth / 2, cellY * cellHeight + cellHeight / 2]
}

export function findCountryFeature(geoData: FeatureCollection, countryCode: string): Feature | undefined {
  return geoData.features.find((feature) => feature.properties?.code === countryCode)
}

export function getCountryDisplayName(geoData: FeatureCollection, countryCode: string): string {
  return findCountryFeature(geoData, countryCode)?.properties?.name ?? countryCode
}

export function computeMarkerRadius(width: number, height: number): number {
  const base = Math.min(width, height)
  const min = base * MARKER_MIN_FRACTION
  const max = base * MARKER_MAX_FRACTION
  return Math.min(Math.max(MARKER_TARGET_RADIUS_PX, min), max)
}

// Largest bounding-box dimension (width or height) of a feature as projected by `projection`, in
// projection-space px - i.e. at zoom k=1. Multiplying this by the live d3-zoom `k` gives the
// country's actual on-screen pixel size, since the zoom transform is a pure scale+translate applied
// on top of the same projection. Used to decide whether a country's own shape is big enough on
// screen to make out, or whether a marker circle is needed instead.
// Countries straddling the antimeridian (e.g. Fiji) get a box spanning the whole map; a width over
// half the world (Mercator world width is 2π·scale) can't be real, so only the height counts then.
export function computeCountryMaxDimension(projection: GeoProjection, feature: Feature): number {
  const bounds = geoPath(projection).bounds(feature)
  const width = bounds[1][0] - bounds[0][0]
  const height = bounds[1][1] - bounds[0][1]
  if (width > Math.PI * projection.scale()) return height
  return Math.max(width, height)
}

export function computeGroupProjection(input: {
  geoData: FeatureCollection
  width: number
  height: number
  groupCountries: string[]
}): GeoProjection {
  const features = input.geoData.features.filter((feature) => {
    const code = feature.properties?.code
    return code && input.groupCountries.includes(code)
  })
  if (features.length === 0) return geoMercator().fitSize([input.width, input.height], input.geoData)

  const collection: FeatureCollection = { type: 'FeatureCollection', features }
  return geoMercator().fitSize([input.width, input.height], collection)
}

// Converts a "pre-cropped" projection (fitted to a country, a country group, or the whole world)
// into the d3-zoom ZoomTransform that reproduces the same view when applied on top of `baseProjection`
// (the world projection all map geometry is always drawn with). This is what lets the interactive
// zoom/pan share one continuous coordinate system with the exercise's own designed starting view:
// zooming out always bottoms out at the true world view (k=1), and panning works relative to it.
// Mercator projections without rotation are affine in their raw (pre-scale/translate) space, so
// matching scale plus a single reference point's mapping fully determines the transform.
export function toZoomTransform(baseProjection: GeoProjection, targetProjection: GeoProjection): ZoomTransform {
  const referencePoint: [number, number] = [0, 0]
  const basePoint = baseProjection(referencePoint)
  const targetPoint = targetProjection(referencePoint)
  if (!basePoint || !targetPoint) return zoomIdentity

  const k = targetProjection.scale() / baseProjection.scale()
  return new ZoomTransform(k, targetPoint[0] - k * basePoint[0], targetPoint[1] - k * basePoint[1])
}

export function computeMapProjection(input: {
  geoData: FeatureCollection
  width: number
  height: number
  targetCountry?: string
  zoom?: number
  panIndex?: number
}): GeoProjection {
  const worldProjection = geoMercator().fitSize([input.width, input.height], input.geoData)
  const targetFeature = input.targetCountry ? findCountryFeature(input.geoData, input.targetCountry) : undefined
  if (!targetFeature) return worldProjection

  const progress = zoomProgress(input.zoom)
  if (progress <= 0) return worldProjection

  const worldScale = worldProjection.scale()
  const countryScale = geoMercator().fitSize([input.width, input.height], targetFeature).scale()
  const scale = interpolateScale(worldScale, countryScale, progress)
  const centroid = geoCentroid(targetFeature)
  const translate = panIndexToTranslate(input.panIndex ?? 4, input.width, input.height)

  return geoMercator().center(centroid).scale(scale).translate(translate)
}
