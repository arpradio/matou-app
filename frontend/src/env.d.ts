/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** KERIA Admin API URL (default: http://localhost:3901) */
  readonly VITE_KERIA_ADMIN_URL?: string;
  /** KERIA Boot API URL (default: http://localhost:3903) */
  readonly VITE_KERIA_BOOT_URL?: string;
  /** KERIA CESR/OOBI API URL (default: http://localhost:3902) */
  readonly VITE_KERIA_CESR_URL?: string;
  /** Config server URL (default: http://localhost:3904) */
  readonly VITE_CONFIG_SERVER_URL?: string;
  /** Schema server URL as seen by KERIA inside Docker (default: http://schema-server:7723) */
  readonly VITE_SCHEMA_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
