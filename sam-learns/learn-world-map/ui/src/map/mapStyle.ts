// Single source of truth for all world-map visual styling decisions.

export const WATER_COLOR = '#dcefff'
export const COUNTRY_FILL_COLOR = '#e6e6e6'
export const MAP_STROKE_COLOR = '#787878'
export const MAP_STROKE_WIDTH = 2

export const MARKER_STROKE_WIDTH = 2

// The marker circle only earns its keep when the marked country's own shape is too small on screen
// to make out - below this size (px, largest bounding-box dimension) it shows; above it, it hides
// so a country you can already see clearly isn't cluttered with a circle. Two thresholds (not one)
// give hysteresis, so zooming right around the boundary doesn't flicker the circle on/off every frame.
export const MARKER_VISIBILITY_SHOW_BELOW_PX = 50
export const MARKER_VISIBILITY_HIDE_ABOVE_PX = 70

// k=1 is always the true world view (the floor - you can zoom out no further). The ceiling is
// whichever is larger: this default, or enough headroom above the exercise's own starting zoom
// level to still let the user zoom in further from wherever they're dropped in.
export const ZOOM_SCALE_EXTENT: [number, number] = [1, 8]
export const ZOOM_MAX_HEADROOM = 3
// Pointer movement (px) tolerated between down/up before a tap is treated as a drag, not a click.
export const ZOOM_CLICK_DISTANCE = 6
// Scale multiplier applied per zoom in/out button press.
export const ZOOM_BUTTON_FACTOR = 1.5
export const ZOOM_TRANSITION_MS = 250

// Default color for highlighting/marking the country relevant to the current exercise.
export const HIGHLIGHT_COLOR = '#3b82f6'
// Feedback color shown once the correct country has been found.
export const SUCCESS_COLOR = '#22c55e'

