/** OmniRoute `provider/model` id from `.env`. Not a secret; not chosen in Settings. */
export function envOmnirouteModel(): string {
  if (typeof process !== "undefined") {
    const fromProcess = process.env.OMNIROUTE_MODEL?.trim();
    if (fromProcess) return fromProcess;
  }
  const fromVite = import.meta.env.OMNIROUTE_MODEL;
  if (typeof fromVite === "string" && fromVite.trim()) {
    return fromVite.trim();
  }
  return "";
}
