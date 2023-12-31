import { App, Notice, Plugin, PluginManifest, PluginSettingTab, Setting } from 'obsidian';
import type { BrowserWindow } from 'electron';

interface ReplicatePluginSettings {
  syncBaseUrl: string;
  publishBaseUrl: string;
}

const DEFAULT_SETTINGS: ReplicatePluginSettings = {
  syncBaseUrl: 'https://api.obsidian.md',
  publishBaseUrl: 'https://publish.obsidian.md',
};

export default class ReplicatePlugin extends Plugin {
  settings: ReplicatePluginSettings;
  private getHostOrigin: any;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);

    const syncInstance = this.getInternalPluginInstance('sync');
    this.getHostOrigin = syncInstance.getHost.bind(syncInstance);
  }

  async onload() {
    await this.loadSettings();

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ReplicateSettingTab(this.app, this));

    try {
      /*eslint @typescript-eslint/no-explicit-any: off */
      (<BrowserWindow>(window as any).electronWindow).webContents.session.webRequest.onBeforeRequest(
        { urls: ['https://api.obsidian.md/*'] },
        async ({ url }, callback) => {
          const orgUrl = url;
          // Replace api url with sync api url
          if (url.startsWith('https://api.obsidian.md')) {
            url = url.replace('https://api.obsidian.md', this.settings.syncBaseUrl || DEFAULT_SETTINGS.syncBaseUrl);
          } else if (url.startsWith('https://publish.obsidian.md')) {
            url = url.replace(
              'https://publish.obsidian.md',
              this.settings.publishBaseUrl || DEFAULT_SETTINGS.publishBaseUrl
            );
          }

          console.log('[sync]', orgUrl, url);
          callback({ redirectURL: url });
        }
      );
    } catch (e) {
      new Notice('Failed to intercept requests. The error was: ' + e);
    }

    // overide getHost function
    this.getInternalPluginInstance('sync').getHost = () => {
      let url = this.getHostOrigin();
      const syncBaseUrl = this.settings.syncBaseUrl;

      if (syncBaseUrl) {
        const scheme = syncBaseUrl.startsWith('http:') ? 'ws' : 'wss';
        const syncBaseUrlWithoutScheme = syncBaseUrl.replace(/^https?:\/\//, '');
        url = `${scheme}://${syncBaseUrlWithoutScheme}/ws.obsidian.md`;
      }

      console.log('[sync] Websocket URL:', url);
      return url;
    };
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private getInternalPluginInstance(id: string) {
    // @ts-ignore: Property 'internalPlugins' does not exist on type 'App'.
    return this.app.internalPlugins.getPluginById(id).instance;
  }
}

class ReplicateSettingTab extends PluginSettingTab {
  plugin: ReplicatePlugin;

  constructor(app: App, plugin: ReplicatePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Sync Base Url')
      .setDesc("It's a sync base url")
      .addText((text) =>
        text
          .setPlaceholder('Enter your sync base url')
          .setValue(this.plugin.settings.syncBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.syncBaseUrl = value;
            this.plugin.settings.publishBaseUrl = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
