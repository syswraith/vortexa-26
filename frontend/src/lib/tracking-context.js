import { createContext, useContext } from "react"

export const TrackingContext = createContext({
  currentSessionId: null,
})

export function useTracking() {
  return useContext(TrackingContext)
}
