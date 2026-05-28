import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.jsx'
import BlobPlayground from './playground/BlobPlayground.jsx'

// Reload when toggling the #blob route so the correct root mounts.
window.addEventListener('hashchange', () => window.location.reload())

const Root = window.location.hash === '#blob' ? BlobPlayground : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
