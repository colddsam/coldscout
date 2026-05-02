import { registerPlugin } from '@capacitor/core';

export interface AppInstallerPlugin {
  install(options: { path: string }): Promise<{ started: boolean }>;
  canRequestPackageInstalls(): Promise<{ allowed: boolean }>;
}

export const AppInstaller = registerPlugin<AppInstallerPlugin>('AppInstaller');
