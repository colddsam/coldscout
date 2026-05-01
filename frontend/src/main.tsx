/**
 * Entry point for the Local Lead Pro dashboard application.
 * 
 * Initializes the React application tree and mounts it to the DOM.
 * Includes global styles and wraps the root component in StrictMode for development safety.
 * Shows an animated splash screen while the app bootstraps.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SplashScreen from './components/SplashScreen';
import './index.css';

function Root() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <React.StrictMode>
      {!splashDone && <SplashScreen onFinished={() => setSplashDone(true)} />}
      <App />
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
