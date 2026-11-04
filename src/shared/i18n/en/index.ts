/** All English dictionaries (Dutch -> English), one file per area. */
import { addEnglish } from '../index';
import { common, terms } from './terms';
import { ui0 } from './ui0';
import { ui1 } from './ui1';
import { ui2 } from './ui2';
import { ui3 } from './ui3';
import { ui4 } from './ui4';
import { ui5 } from './ui5';
import { sim } from './sim';
import { simA } from './simA';
import { simB } from './simB';
import { simC } from './simC';
import { simD } from './simD';
import { simE } from './simE';
import { fixes } from './fixes';

// later files win on a clash; the game's own terms go last so they always hold
for (const d of [ui0, ui1, ui2, ui3, ui4, ui5, sim, simA, simB, simC, simD, simE, fixes, common, terms]) addEnglish(d);
