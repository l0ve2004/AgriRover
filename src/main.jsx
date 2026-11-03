import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Note: StrictMode double-invokes effects in dev, which causes an intentional
// connect -> disconnect -> reconnect cycle on WebSockets. Removing it provides
// a single, stable, persistent connection directly matching hardware expectations.
createRoot(document.getElementById('root')).render(
  <App />
)
