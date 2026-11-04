import { MENU_BUILDINGS } from '../menu';
import { NavIcon } from '../components/NavIcon';
import { go } from '../components/Nav';
import { snapshot } from '../store';
import { tr } from '../../shared/i18n';

/** Phone: the buildings you do something in, as tiles with their level (the side rail's menu on desktop). */
export function BuildingsScreen() {
  const v = snapshot.value?.village;
  if (!v) return null;
  return (
    <div class="screen">
      <h2 class="sr-only">{tr('Gebouwen')}</h2>
      <div class="bgrid">
        {MENU_BUILDINGS.map((b) => {
          const lvl = v.buildings.find((x) => x.id === b.building)?.level ?? 0;
          return (
            <a key={b.screen} href={`#${b.screen}`} class={`btile ${lvl ? '' : 'unbuilt'}`} onClick={(e) => go(e, b.screen)}>
              <span class="btile-lvl">{lvl || '—'}</span>
              <NavIcon name={b.screen} size={22} />
              <span class="btile-name">{tr(b.label)}</span>
            </a>
          );
        })}
      </div>
      <p class="muted">{tr('Mijnen, opslag, boerderij, schuilplaats en muur open je vanuit het dorp of het hoofdgebouw.')}</p>
    </div>
  );
}
