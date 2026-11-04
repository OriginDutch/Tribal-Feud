import { NEWS_ICON } from '../../sim/news';
import { formatGameTime } from '../../shared/time';
import { screen, snapshot } from '../store';
import { newsStyle } from '../newsStyle';
import { tr, txt } from '../../shared/i18n';

/** A thin bar at the bottom: the latest world news scrolls by. Click to open the news screen. */
export function NewsTicker() {
  const news = snapshot.value?.news ?? [];
  if (!news.length) return null;
  const style = newsStyle.value;
  const items = news.map((n) => (
    <span class="ticker-item" key={n.id}>
      <span class="ticker-time">{formatGameTime(n.time)}</span> {NEWS_ICON[n.kind]} {txt(style === 'dry' ? n.dry : n.head)}
    </span>
  ));
  // the text runs twice in a row, so the loop has no gap; speed follows the length
  const seconds = Math.max(40, news.reduce((sum, n) => sum + txt(style === 'dry' ? n.dry : n.head).length, 0) / 9);
  return (
    <button class="news-ticker" onClick={() => (screen.value = 'news')} title={tr('Naar het nieuws')} aria-label={tr('Laatste nieuws, open het nieuwsoverzicht')}>
      <span class="ticker-label">{tr('Nieuws')}</span>
      <span class="ticker-window">
        <span class="ticker-run" style={{ animationDuration: `${seconds}s` }} key={news[0]!.id}>
          {items}
          <span aria-hidden="true">{items}</span>
        </span>
      </span>
    </button>
  );
}
