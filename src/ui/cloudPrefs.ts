/**
 * Worlds this device keeps out of the cloud (the player switched them off). Kept in the browser and
 * handed to the worker, so an autosave never puts a switched-off world back.
 */
import { signal } from '@preact/signals';
import { send } from './store';

const KEY = 'tf-cloud-off';
export const cloudOff = signal<string[]>((() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; } catch { return []; }
})());

export function setCloudOff(key: string, off: boolean): void {
  const next = off ? [...new Set([...cloudOff.value, key])] : cloudOff.value.filter((k) => k !== key);
  cloudOff.value = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* fine */ }
  send({ type: 'cloudPrefs', off: next });
}

export function initCloudPrefs(): void {
  send({ type: 'cloudPrefs', off: cloudOff.value });
}
