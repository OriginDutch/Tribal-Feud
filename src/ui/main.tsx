import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource-variable/inter';
import { render } from 'preact';
import { App } from './App';
import { initAuth } from '../cloud/auth';
import { watchAdmin } from '../cloud/admin';

const root = document.getElementById('app');
if (!root) throw new Error('#app ontbreekt in index.html');
render(<App />, root);
initAuth();
watchAdmin();
