import { txt, type Txt } from '../shared/i18n';
/**
 * World news: wars, peace, treaties, tribes, big conquests and the ranking, for the news ticker
 * and the news screen. Every item has a dry text and a headline; the player picks the style.
 * Kept in the save (the last NEWS_KEPT items). Picking a headline variant never touches the
 * world's random generator, so news can't change how the game plays.
 */
import { hashFloat } from './rng';
import { addLog, type WorldState } from './state';

export const NEWS_KEPT = 2000;

export type NewsKind =
  | 'war'
  | 'peace'
  | 'treaty'
  | 'talks'
  | 'talksFailed'
  | 'outlaw'
  | 'nap'
  | 'ally'
  | 'allyEnd'
  | 'tribeNew'
  | 'tribeEnd'
  | 'leader'
  | 'conquest'
  | 'wiped'
  | 'ranking';

export interface NewsItem {
  id: number;
  time: number;
  kind: NewsKind;
  dry: Txt;
  head: Txt;
  /** Tribes and players it is about (for "my tribe"). */
  tribes?: number[];
  players?: number[];
  /** Where it happened (for "near me"). */
  x?: number;
  y?: number;
}

export const NEWS_ICON: Record<NewsKind, string> = {
  war: '⚔️',
  peace: '🕊️',
  treaty: '📜',
  talks: '🕊️',
  talksFailed: '💢',
  outlaw: '🏴',
  nap: '🤝',
  ally: '🤝',
  allyEnd: '💔',
  tribeNew: '🏰',
  tribeEnd: '🏚️',
  leader: '👑',
  conquest: '🏹',
  wiped: '💀',
  ranking: '📈',
};

/** Which filter group a kind belongs to on the news screen. */
export const NEWS_GROUP: Record<NewsKind, 'war' | 'conquest' | 'tribe'> = {
  war: 'war',
  peace: 'war',
  treaty: 'war',
  talks: 'war',
  talksFailed: 'war',
  outlaw: 'war',
  nap: 'war',
  ally: 'war',
  allyEnd: 'war',
  tribeNew: 'tribe',
  tribeEnd: 'tribe',
  leader: 'tribe',
  ranking: 'tribe',
  conquest: 'conquest',
  wiped: 'conquest',
};

type Item = Omit<NewsItem, 'id' | 'time' | 'head'> & { head?: Txt | Txt[] };

/** Adds a news item (and its dry text to the world log). */
export function addNews(state: WorldState, item: Item): NewsItem {
  const id = (state.newsSeq = (state.newsSeq ?? 0) + 1);
  const heads = item.head === undefined ? [item.dry] : Array.isArray(item.head) ? item.head : [item.head];
  // a variant by hash: the same event always reads the same, and the game's rng is left alone
  const head = heads[Math.floor(hashFloat(state.config.seed, id, 97) * heads.length)] ?? item.dry;
  const news: NewsItem = { ...item, id, time: state.time, head };
  (state.news ??= []).push(news);
  if (state.news.length > NEWS_KEPT) state.news.splice(0, state.news.length - NEWS_KEPT);
  addLog(state, { time: state.time, text: txt(item.dry) });
  (state.tribeNews ??= []).push({ time: state.time, text: item.dry });
  if (state.tribeNews.length > 60) state.tribeNews.splice(0, state.tribeNews.length - 60);
  return news;
}

/** The latest news, newest first. */
export function latestNews(state: WorldState, n: number): NewsItem[] {
  return (state.news ?? []).slice(-n).reverse();
}
