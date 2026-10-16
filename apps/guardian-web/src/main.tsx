import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@osan-kids-bridge/ui/tokens.css'
import '@osan-kids-bridge/ui/fonts.css'
import '@osan-kids-bridge/ui/base.css'
import '@osan-kids-bridge/ui/components.css'
import './styles/base.css'
import './styles/intro.css'
import './styles/home.css'
import './styles/detail.css'
import './styles/sheet.css'
import App from './App'
import { I18nProvider } from './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider><App /></I18nProvider>
  </StrictMode>,
)
