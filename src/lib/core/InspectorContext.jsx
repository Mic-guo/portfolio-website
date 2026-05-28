import { createContext, useContext } from "react";

// Inspector state shape:
//   selection: { origin: Object3D, current: Object3D } | null
//   - origin: the leaf mesh the user actually clicked
//   - current: the active node — defaults to the closest named ancestor of
//              `origin`, but can be reassigned via the breadcrumb in the
//              panel to drill up/down the hierarchy.
//
// Default value is a no-op so consumers work without a Provider.
const InspectorContext = createContext({
  enabled: false,
  selection: null,
  select: () => {},
  setCurrent: () => {},
  selectExact: () => {},
});

export const InspectorProvider = InspectorContext.Provider;
export const useInspector = () => useContext(InspectorContext);

// Returns event handlers to spread onto an R3F `<primitive>` or `<mesh>`.
// When inspector is off, returns an empty object so React doesn't attach any
// listeners (avoids R3F's event-system overhead in production).
//
// On click, reports the raw leaf mesh as the new origin. Resolution to the
// closest named ancestor happens once in the consumer (ModelViewer's `select`
// handler) so the breadcrumb has a stable starting point to walk up from.
export function useInspectorProps() {
  const { enabled, select } = useInspector();
  if (!enabled) return {};
  return {
    onClick(event) {
      event.stopPropagation();
      select(event.object);
    },
    onPointerOver(event) {
      event.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    onPointerOut(event) {
      event.stopPropagation();
      document.body.style.cursor = "default";
    },
  };
}
