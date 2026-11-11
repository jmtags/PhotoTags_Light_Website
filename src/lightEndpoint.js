export function lightEndpoint(route) {
  const configured = import.meta.env.VITE_LIGHT_API_ORIGIN;
  if (!configured) throw new Error('Light license service is not configured. Set VITE_LIGHT_API_ORIGIN for this website.');
  const url = new URL(configured);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Light license service must use HTTPS.');
  return `${url.origin}/api/light?route=${route}`;
}
