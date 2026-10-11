import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/session.jsx'
import { SessionTrackingProvider } from './lib/session-tracking.jsx'
import { NavigationTracking } from './lib/navigation-tracking.jsx'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <SessionTrackingProvider>
        <NavigationTracking />
        <App />
      </SessionTrackingProvider>
    </AuthProvider>
  </BrowserRouter>,
)
