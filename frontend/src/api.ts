export async function fetchHealth(): Promise<boolean> {
  const response = await fetch("/api/health");
  if (!response.ok) return false;
  const body = (await response.json()) as { ok?: boolean };
  return body.ok === true;
}
