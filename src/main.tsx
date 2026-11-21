import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './cinematic.css';
import { hostAllowed, OFFICIAL_URL, UNOFFICIAL_TITLE, UNOFFICIAL_TEXT } from '../shared/official';

function Unofficial() {
  return (
    <main className="unofficial">
      <h1>{UNOFFICIAL_TITLE}</h1>
      <p>{UNOFFICIAL_TEXT}</p>
      <a className="btn btn-shu btn-lg" href={OFFICIAL_URL}>前往官方網站</a>
      <p className="muted small">© 2026 月夜狼人殺　版權所有</p>
    </main>
  );
}

const root = createRoot(document.getElementById('root')!);
// A saved or re-hosted copy of this page refuses to run.
root.render(hostAllowed(location.hostname) ? <App /> : <Unofficial />);
