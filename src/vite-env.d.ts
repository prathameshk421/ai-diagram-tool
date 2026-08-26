/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OMNIROUTE_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
