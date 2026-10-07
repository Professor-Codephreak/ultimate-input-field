import ReactDOM from 'react-dom/client';
import { App } from './App';
import { OutputWindow } from './components/OutputWindow';
import { isOutputWindow } from './core/bus';
import './styles/UltimateInputField.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(isOutputWindow() ? <OutputWindow /> : <App />);
