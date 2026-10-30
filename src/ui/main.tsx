import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource-variable/inter';
import { render } from 'preact';
import { App } from './App';
import { initAuth } from '../cloud/auth';
import { watchAdmin } from '../cloud/admin';
import { initCloudPrefs } from './cloudPrefs';
import { watchTitle } from './title';
import { initMusic } from './music/player';

const root = document.getElementById('app');
if (!root) throw new Error('#app ontbreekt in index.html');
render(<App />, root);
initCloudPrefs();
watchTitle();
initMusic();
initAuth();
watchAdmin();
