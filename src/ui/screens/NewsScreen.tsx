import { useEffect, useState } from 'preact/hooks';
import { NEWS_GROUP, NEWS_ICON, type NewsItem } from '../../sim/news';
import { formatGameTime } from '../../shared/time';
import { newsList, ranking, send, snapshot } from '../store';
import { PlayerLink } from '../components/PlayerLink';
import { newsStyle, setNewsStyle } from '../newsStyle';
import { useSaved } from '../useSaved';
import { tr } from '../../shared/i18n';
import { trx } from '../i18n';

type Filter = 'all' | 'mine' | 'near' | 'war' | 'conquest' | 'tribe';
const FILTERS: [Filter, string][] = [
  ['all', 'Alles'],
  ['mine', 'Mijn stam'],
  ['near', 'In mijn buurt'],
  ['war', 'Oorlog & vrede'],
  ['conquest', 'Veroveringen'],
  ['tribe', 'Stammen & ranglijst'],
];
const PAGE = 100;

/** All world news: wars, peace, treaties, tribes, big conquests. */
export function NewsScreen() {
  useEffect(() => {
    send({ type: 'getNews' });
    send({ type: 'getRanking' });
    const poll = window.setInterval(() => send({ type: 'getNews' }), 5000);
    return () => window.clearInterval(poll);
  }, []);
  const [filter, setFilter] = useSaved<Filter>('news-filter', 'all');
  const [radius, setRadius] = useSaved('news-radius', 40);
  const [shown, setShown] = useState(PAGE);
  const s = snapshot.value;
  const style = newsStyle.value;
  const myTribe = s?.myTribe ?? null;
  const me = s?.me ?? null;

  const keep = (n: NewsItem): boolean => {
    switch (filter) {
      case 'all': return true;
      case 'mine': return (myTribe !== null && !!n.tribes?.includes(myTribe)) || !!n.players?.includes(0);
      case 'near': return !!me && n.x !== undefined && n.y !== undefined && Math.hypot(n.x - me.x, n.y - me.y) <= radius;
      default: return NEWS_GROUP[n.kind] === filter;
    }
  };
  const list = newsList.value.filter(keep);
  const names = new Map(ranking.value.map((r) => [r.id, r.name]));

  return (
    <div class="screen news-screen">
      <header class="screen-head">
        <h2 style={{ margin: 0, flex: 1 }}>{tr('Nieuws')}</h2>
        <div class="news-style" role="group" aria-label={tr('Stijl')}>
          <button class={`chip ${style === 'dry' ? 'on' : ''}`} onClick={() => setNewsStyle('dry')}>{tr('Droog')}</button>
          <button class={`chip ${style === 'head' ? 'on' : ''}`} onClick={() => setNewsStyle('head')}>{tr('Krantenkop')}</button>
        </div>
      </header>
      <div class="news-filters">
        {FILTERS.map(([id, label]) => (
          <button key={id} class={`chip ${filter === id ? 'on' : ''}`} onClick={() => { setFilter(id); setShown(PAGE); }} disabled={id === 'mine' && myTribe === null}>
            {tr(label)}
          </button>
        ))}
        {filter === 'near' && (
          <label class="news-radius">
            {trx('binnen {input} velden', { input: <input type="number" min={5} max={500} step={5} value={radius} onInput={(e) => setRadius(Math.max(5, Number(e.currentTarget.value) || 40))} /> })}
          </label>
        )}
      </div>
      {list.length === 0 ? (
        <p class="muted">{filter !== 'all' ? tr('Nog geen nieuws met dit filter.') : tr('Nog geen nieuws.')}</p>
      ) : (
        <ol class="news-list">
          {list.slice(0, shown).map((n) => (
            <li key={n.id} class={`news-item kind-${n.kind} ${myTribe !== null && n.tribes?.includes(myTribe) ? 'mine' : ''}`}>
              <span class="news-icon" aria-hidden="true">{NEWS_ICON[n.kind]}</span>
              <span class="news-text">
                {style === 'dry' ? n.dry : n.head}
                {n.players?.length ? (
                  <span class="news-players">
                    {n.players.map((pid) => {
                      const p = names.get(pid);
                      return p ? <PlayerLink key={pid} id={pid} name={p} /> : null;
                    })}
                  </span>
                ) : null}
              </span>
              <span class="news-meta">
                {formatGameTime(n.time)}
                {n.x !== undefined && n.y !== undefined ? ` · ${n.x}|${n.y}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      {list.length > shown && <button onClick={() => setShown(shown + PAGE)}>{tr('Meer laden ({n} over)', { n: list.length - shown })}</button>}
    </div>
  );
}
