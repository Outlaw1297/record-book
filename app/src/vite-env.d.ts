/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_DROPBOX_APP_KEY?: string;
  readonly VITE_RANCH_API_URL?: string;
  readonly VITE_RANCH_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
