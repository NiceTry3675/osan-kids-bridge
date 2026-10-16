import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@osan-kids-bridge/ui/tokens.css'
import '@osan-kids-bridge/ui/fonts.css'
import '@osan-kids-bridge/ui/base.css'
import '@osan-kids-bridge/ui/components.css'
import './styles.css'
import App from './App'
import { LanguageProvider } from './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider><App /></LanguageProvider>
  </StrictMode>,
)
