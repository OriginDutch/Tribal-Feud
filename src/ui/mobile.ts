/** Phone layout: a bottom bar instead of the side rail, a compact top bar. Below this width. */
import { signal } from '@preact/signals';

export const MOBILE_QUERY = '(max-width: 720px)';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
export const isMobile = signal<boolean>(mq?.matches ?? false);
mq?.addEventListener('change', (e) => (isMobile.value = e.matches));

/** Which sheet is open over the phone layout. */
export const mobileSheet = signal<'more' | 'speed' | 'villages' | null>(null);
