import { AppState, Lang } from './types';
const pending = new Map<string, string>();
async function request(path: string, options: RequestInit = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch('/api/v1' + path, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('Timeout');
    if (response.ok && data === null) throw new Error('Réponse locale invalide.');
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}
export async function loadState(): Promise<AppState> {
  const { response, data } = await request('/state');
  if (!response.ok)
    throw new Error('Impossible d’ouvrir les données locales. Relancez Inventory et réessayez.');
  return data;
}
export async function command(path: string, body: unknown = {}, method = 'POST') {
  const signature = method + path + JSON.stringify(body),
    key = pending.get(signature) || crypto.randomUUID();
  pending.set(signature, key);
  let result: Awaited<ReturnType<typeof request>>;
  try {
    result = await request(
      path,
      {
        method,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(body),
      },
      30000,
    );
  } catch {
    throw new Error(
      'Le service local est indisponible. Vous pouvez réessayer la même action sans risque de doublon.',
    );
  }
  const { response: r, data } = result;
  // A timed-out write keeps its key: retrying it cannot create a second sale/payment.
  if (r.ok || r.status < 500) pending.delete(signature);
  if (!r.ok)
    throw new Error(
      typeof data?.detail === 'string' ? data.detail : 'Vérifiez les valeurs saisies.',
    );
  return data;
}
export async function getBackups() {
  const { response, data } = await request('/backups');
  if (!response.ok) throw new Error('Impossible de charger les sauvegardes.');
  return data;
}
export async function getPreferences(): Promise<{
  language: Lang;
}> {
  const { response, data } = await request('/preferences', {}, 5000);
  if (!response.ok) throw new Error('Préférences indisponibles.');
  return { language: 'fr' };
}
export async function saveLanguage(language: Lang) {
  await command('/preferences', { language }, 'PATCH');
}
