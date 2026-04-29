import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';
import TimelinePlugin from './main';

export interface TagColor {
  tag: string;
  color: string;
}

export interface TimelineSettings {
  tagColors: TagColor[];
}

export const DEFAULT_SETTINGS: TimelineSettings = {
  tagColors: [
    { tag: 'teaching', color: '#e07b39' },
    { tag: 'research',   color: '#4a9edd' },
    { tag: 'learning',    color: '#9b59b6' },
    { tag: 'service',  color: '#27ae60' },
  ],
};

export class TimelineSettingTab extends PluginSettingTab {
  plugin: TimelinePlugin;

  constructor(app: App, plugin: TimelinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Timeline View Settings' });
    containerEl.createEl('h3', { text: 'Tag Colours' });
    containerEl.createEl('p', {
      text: 'Assign a colour to each tag. The tag name must match exactly what you use in your Markdown (without the # symbol).',
      cls: 'setting-item-description',
    });

    const { tagColors } = this.plugin.settings;

    // Render one row per tag
    tagColors.forEach((entry, index) => {
      const setting = new Setting(containerEl)
        .addText(text => text
          .setPlaceholder('tag name')
          .setValue(entry.tag)
          .onChange(async (value) => {
            this.plugin.settings.tagColors[index].tag = value.trim();
            await this.plugin.saveSettings();
          }))
        .addColorPicker(picker => picker
          .setValue(entry.color)
          .onChange(async (value) => {
            this.plugin.settings.tagColors[index].color = value;
            await this.plugin.saveSettings();
            this.plugin.applyTagStyles();
          }))
        .addButton((btn: ButtonComponent) => btn
          .setIcon('trash')
          .setTooltip('Remove')
          .onClick(async () => {
            this.plugin.settings.tagColors.splice(index, 1);
            await this.plugin.saveSettings();
            this.plugin.applyTagStyles();
            this.display(); // re-render the settings panel
          }));

      setting.settingEl.style.borderBottom = '1px solid var(--background-modifier-border)';
    });

    // Add new tag button
    new Setting(containerEl)
      .addButton((btn: ButtonComponent) => btn
        .setButtonText('+ Add tag colour')
        .onClick(async () => {
          this.plugin.settings.tagColors.push({ tag: '', color: '#888888' });
          await this.plugin.saveSettings();
          this.display();
        }));
  }
}