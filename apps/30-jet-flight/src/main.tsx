import { createRoot } from 'react-dom/client'
import '@fontsource/bagel-fat-one/latin-400.css'
import '@fontsource/rubik/latin-500.css'
import '@fontsource/rubik/latin-700.css'
import '@fontsource/rubik/latin-800.css'
import JetFlight from './components/jet-flight'
import './index.css'

createRoot(document.getElementById('root')!).render(<JetFlight />)
