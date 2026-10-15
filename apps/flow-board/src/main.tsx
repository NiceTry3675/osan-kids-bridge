import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@osan-kids-bridge/ui/tokens.css'
import '@osan-kids-bridge/ui/base.css'
import './styles.css'
import App from './App'
import { pretendardUrl } from './bundles'

// 보드 글자도 틀 안 대시보드와 같은 서체로 맞춥니다.
const face = document.createElement('style')
face.textContent = `@font-face{font-family:'Pretendard Variable';font-weight:45 920;font-display:swap;src:url(${pretendardUrl()}) format('woff2-variations')}`
document.head.append(face)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
