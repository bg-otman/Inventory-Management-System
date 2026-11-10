export {};
declare global {
  interface Window {
    inventoryDesktop?: {
      language: 'fr';
      ready: () => void;
      reportError: (message: string) => void;
      openLog: () => Promise<void>;
      importBackup: () => Promise<{
        name: string;
        created_at: string;
      } | null>;
      exportBackup: (name: string) => Promise<boolean>;
      openDataFolder: () => Promise<void>;
    };
  }
}
