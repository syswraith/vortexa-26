import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/session.jsx'
import { SessionTrackingProvider } from './lib/session-tracking.jsx'
import { NavigationTracking } from './lib/navigation-tracking.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionTrackingProvider>
          <NavigationTracking />
          <App />
        </SessionTrackingProvider>
      </AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>,
)
