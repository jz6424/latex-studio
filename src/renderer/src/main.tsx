import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'katex/dist/katex.min.css'
// Load order matters: theme defines the CSS variables the other two consume.
import './styles/theme.css'
import './styles/layout.css'
import './styles/widgets.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
