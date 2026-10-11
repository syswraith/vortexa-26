import { createContext, useContext } from "react"

export const SessionContext = createContext({
  session: null,
  user: null,
  loading: true,
})

export function useSession() {
  return useContext(SessionContext)
}
