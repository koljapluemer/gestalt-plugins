import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { geoCentroid, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { select, type Selection } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, ZoomTransform, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import type { Feature, FeatureCollection } from 'geojson';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import {
  computeCountryMaxDimension, computeGroupProjection, computeMapProjection, computeMarkerRadius, findCountryFeature,
  interpolateScale, toZoomTransform,
} from './mapProjection';
import {
  COUNTRY_FILL_COLOR, HIGHLIGHT_COLOR, MAP_STROKE_COLOR, MAP_STROKE_WIDTH, MARKER_STROKE_WIDTH,
  MARKER_VISIBILITY_HIDE_ABOVE_PX, MARKER_VISIBILITY_SHOW_BELOW_PX, WATER_COLOR, ZOOM_BUTTON_FACTOR,
  ZOOM_CLICK_DISTANCE, ZOOM_MAX_HEADROOM, ZOOM_SCALE_EXTENT, ZOOM_TRANSITION_MS,
} from './mapStyle';

export type MapHandle = { revealCountry(code: string): void };

export type MapProps = {
  geoData: FeatureCollection;
  targetCountry?: string;
  zoom?: number;
  panIndex?: number;
  groupCountries?: string[];
  highlightCountry?: string;
  highlightColor?: string;
  markerCountry?: string;
  markerColor?: string;
  /** pan and zoom by drag, wheel, pinch and buttons; fixed for the component's lifetime */
  interactive?: boolean;
  onCountryClicked?: (code: string) => void;
  ref?: Ref<MapHandle>;
};

// buttons only for fine pointers; touch devices pinch and drag directly
const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * The world map, ported from sam-learns-things' `WorldMapCanvas.vue`. All geometry is drawn with one world
 * projection, so zoom k=1 is always the whole world; an exercise's starting view (a country close-up, a group) is a
 * zoom transform on top of it. d3 owns the SVG once mounted: it's created once and updated in place.
 */
export function WorldMapCanvas({ ref, ...props }: MapProps) {
  const container = useRef<HTMLDivElement | null>(null);
  // the props as last rendered, for d3's handlers and the effects below (layout effects run before them)
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [maxScale, setMaxScale] = useState(ZOOM_SCALE_EXTENT[1]);
  const [initial, setInitial] = useState<ZoomTransform>(zoomIdentity);

  const d3 = useRef<{
    svg: Selection<SVGSVGElement, unknown, null, undefined>;
    water: Selection<SVGRectElement, unknown, null, undefined>;
    g: Selection<SVGGElement, unknown, null, undefined>;
    zoom: ZoomBehavior<SVGSVGElement, unknown> | null;
    world: GeoProjection | null;
    initial: ZoomTransform;
    k: number;
    markerBaseMaxDim: number;
    markerHidden: boolean;
    markerRadius: number;
  } | null>(null);

  const updateMarkerOnZoom = () => {
    const s = d3.current;
    if (!s) return;
    const circle = s.g.select<SVGCircleElement>('circle');
    if (circle.empty()) return;
    circle.attr('r', s.markerRadius / s.k);
    const onScreen = s.markerBaseMaxDim * s.k;
    // two thresholds, so zooming around the boundary doesn't make it flicker
    if (s.markerHidden && onScreen < MARKER_VISIBILITY_SHOW_BELOW_PX) s.markerHidden = false;
    else if (!s.markerHidden && onScreen > MARKER_VISIBILITY_HIDE_ABOVE_PX) s.markerHidden = true;
    circle.attr('display', s.markerHidden ? 'none' : null);
  };

  const applyFills = () => {
    const s = d3.current;
    if (!s) return;
    const p = latest.current;
    s.g.selectAll<SVGPathElement, Feature>('path').attr('fill', (f) => (f.properties?.code === p.highlightCountry ? (p.highlightColor ?? HIGHLIGHT_COLOR) : COUNTRY_FILL_COLOR));
  };

  const applyMarker = () => {
    const s = d3.current;
    const el = container.current;
    if (!s || !el || !s.world) return;
    s.g.selectAll('circle').remove();
    const p = latest.current;
    const feature = p.markerCountry ? findCountryFeature(p.geoData, p.markerCountry) : undefined;
    if (!feature) return;
    s.markerBaseMaxDim = computeCountryMaxDimension(s.world, feature);
    s.markerRadius = computeMarkerRadius(el.clientWidth, el.clientHeight);
    const [cx, cy] = s.world(geoCentroid(feature)) ?? [0, 0];
    s.g.append('circle')
      .attr('cx', cx).attr('cy', cy).attr('r', s.markerRadius / s.k)
      .attr('fill', 'none').attr('stroke', p.markerColor ?? HIGHLIGHT_COLOR).attr('stroke-width', MARKER_STROKE_WIDTH)
      .attr('vector-effect', 'non-scaling-stroke').style('pointer-events', 'none');
    s.markerHidden = false;
    updateMarkerOnZoom();
  };

  /** The exercise's starting view as a transform on the world projection, and the zoom bounds with it. */
  const updateInitialTransform = () => {
    const s = d3.current;
    const el = container.current;
    if (!s || !el || !s.world) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;
    const p = latest.current;
    const target = p.groupCountries?.length
      ? computeGroupProjection({ geoData: p.geoData, width, height, groupCountries: p.groupCountries })
      : computeMapProjection({ geoData: p.geoData, width, height, targetCountry: p.targetCountry, zoom: p.zoom, panIndex: p.panIndex });
    // a few large countries fit at a smaller scale than the world: start at the world view then
    const candidate = toZoomTransform(s.world, target);
    s.initial = candidate.k < 1 ? zoomIdentity : candidate;
    setInitial(s.initial);
    const max = Math.max(ZOOM_SCALE_EXTENT[1], s.initial.k * ZOOM_MAX_HEADROOM);
    setMaxScale(max);
    s.zoom?.scaleExtent([ZOOM_SCALE_EXTENT[0], max]);
    s.zoom?.translateExtent([[0, 0], [width, height]]);
    applyMarker();
  };

  const resetTransform = (animate: boolean) => {
    const s = d3.current;
    if (!s?.zoom) return;
    if (animate) s.svg.transition().duration(ZOOM_TRANSITION_MS).call(s.zoom.transform, s.initial);
    else s.svg.call(s.zoom.transform, s.initial);
  };

  /** Recomputes the world projection and redraws the geometry for the container's size; keeps the transform. */
  const updateWorldGeometry = () => {
    const s = d3.current;
    const el = container.current;
    if (!s || !el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;
    s.svg.attr('width', width).attr('height', height);
    s.water.attr('width', width).attr('height', height);
    const p = latest.current;
    s.world = geoMercator().fitSize([width, height], p.geoData);
    const path = geoPath(s.world);
    s.g.selectAll<SVGPathElement, Feature>('path')
      .data(p.geoData.features, (f) => String(f.properties?.code ?? ''))
      .join((enter) => enter.append('path')
        .attr('data-country', (f) => String(f.properties?.code ?? ''))
        .attr('stroke', MAP_STROKE_COLOR)
        .attr('stroke-width', MAP_STROKE_WIDTH)
        // borders stay as thick on screen at any zoom
        .attr('vector-effect', 'non-scaling-stroke')
        .style('cursor', 'pointer')
        .on('click', (_e, f) => { const code = f.properties?.code; if (typeof code === 'string') latest.current.onCountryClicked?.(code); }))
      .attr('d', (f) => path(f) ?? '');
    applyFills();
    updateInitialTransform();
  };

  // mount: the SVG, the zoom behaviour, resizing
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const svg = select(el).append('svg');
    const water = svg.append('rect').attr('fill', WATER_COLOR);
    const g = svg.append('g');
    d3.current = { svg, water, g, zoom: null, world: null, initial: zoomIdentity, k: 1, markerBaseMaxDim: 0, markerHidden: false, markerRadius: 0 };
    if (latest.current.interactive) {
      const z = d3zoom<SVGSVGElement, unknown>().clickDistance(ZOOM_CLICK_DISTANCE).on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        const s = d3.current;
        if (!s) return;
        s.k = event.transform.k;
        setTransform(event.transform);
        s.g.attr('transform', event.transform.toString());
        updateMarkerOnZoom();
      });
      d3.current.zoom = z;
      // no double-click zoom: it collides with tapping a country again
      svg.call(z).on('dblclick.zoom', null);
    }
    updateWorldGeometry();
    resetTransform(false);
    const observer = new ResizeObserver(() => updateWorldGeometry());
    observer.observe(el);
    return () => {
      observer.disconnect();
      svg.interrupt();
      svg.remove();
      d3.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once; later props arrive through `latest` and the effects below
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw when the map changes
  useEffect(() => { updateWorldGeometry(); }, [props.geoData]);

  // a new target, zoom stage or group is a new view: snap to its start
  const groupKey = props.groupCountries?.join() ?? '';
  useEffect(() => {
    updateInitialTransform();
    resetTransform(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `groupKey` stands for the group
  }, [props.targetCountry, props.zoom, props.panIndex, groupKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `latest` holds them
  useEffect(applyFills, [props.highlightCountry, props.highlightColor]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `latest` holds them
  useEffect(applyMarker, [props.markerCountry, props.markerColor]);

  useImperativeHandle(ref, () => ({
    /** Pans to a close-up of `code` (after "I have no idea"), no closer than the normal maximum. */
    revealCountry(code: string) {
      const s = d3.current;
      const el = container.current;
      if (!s?.zoom || !el || !s.world) return;
      const width = el.clientWidth;
      const height = el.clientHeight;
      const feature = findCountryFeature(latest.current.geoData, code);
      if (!width || !height || !feature) return;
      const worldScale = s.world.scale();
      const countryScale = geoMercator().fitSize([width, height], feature).scale();
      const k = Math.min(Math.max(interpolateScale(worldScale, countryScale, 1) / worldScale, ZOOM_SCALE_EXTENT[0]), ZOOM_SCALE_EXTENT[1]);
      const [x, y] = s.world(geoCentroid(feature)) ?? [width / 2, height / 2];
      s.svg.transition().duration(ZOOM_TRANSITION_MS).call(s.zoom.transform, new ZoomTransform(k, width / 2 - k * x, height / 2 - k * y));
    },
  }), []);

  const canZoomIn = transform.k < maxScale - 0.01;
  const canZoomOut = transform.k > ZOOM_SCALE_EXTENT[0] + 0.01;
  const atInitial = Math.abs(transform.k - initial.k) < 0.01 && Math.abs(transform.x - initial.x) < 0.5 && Math.abs(transform.y - initial.y) < 0.5;
  const zoomBy = (factor: number) => {
    const s = d3.current;
    if (s?.zoom) s.svg.transition().duration(ZOOM_TRANSITION_MS).call(s.zoom.scaleBy, factor);
  };
  const button = 'btn btn-circle pointer-events-auto bg-base-100/90 text-base-content shadow-sm backdrop-blur';

  return (
    <div ref={container} className={`world-map relative h-full w-full ${props.interactive ? 'touch-none overscroll-contain' : ''}`}>
      <style>{'@media (hover: hover) and (pointer: fine) { .world-map path[data-country] { transition: filter 0.1s ease } .world-map path[data-country]:hover { filter: brightness(0.9) } }'}</style>
      {props.interactive && (
        <div className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-2">
          {!isTouchDevice && <button type="button" className={button} disabled={!canZoomIn} aria-label="Zoom in" onClick={() => zoomBy(ZOOM_BUTTON_FACTOR)}><Plus size={20} aria-hidden /></button>}
          {!isTouchDevice && <button type="button" className={button} disabled={!canZoomOut} aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_BUTTON_FACTOR)}><Minus size={20} aria-hidden /></button>}
          <button type="button" className={button} disabled={atInitial} aria-label="Reset view" onClick={() => resetTransform(true)}><RotateCcw size={20} aria-hidden /></button>
        </div>
      )}
    </div>
  );
}
