/**
 * Entry point for the Local Lead Pro dashboard application.
 * 
 * Initializes the React application tree and mounts it to the DOM.
 * Includes global styles and wraps the root component in StrictMode for development safety.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
