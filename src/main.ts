import { Plugin, TFile, Notice } from 'obsidian';
import { TimelineView, TIMELINE_VIEW_TYPE } from './TimelineView';
import { TimelineSettings, DEFAULT_SETTINGS, TimelineSettingTab } from './settings';

export default class TimelinePlugin extends Plugin {
  settings: TimelineSettings = DEFAULT_SETTINGS;
  private styleEl: HTMLStyleElement | null = null;

  async onload() {
    await this.loadSettings();

    this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new TimelineView(leaf, this));

    this.addRibbonIcon('calendar-range', 'Open as Timeline', () => this.activateView());

    this.addCommand({
      id: 'open-timeline-view',
      name: 'Open current file as Timeline',
      callback: () => this.activateView(),
    });

    this.addSettingTab(new TimelineSettingTab(this.app, this));

    // Inject tag colour styles on load
    this.applyTagStyles();

    // Live re-render on file save
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile)) return;
        this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).forEach(leaf => {
          const view = leaf.view as TimelineView;
          if (view.file?.path === file.path) {
            this.app.vault.read(file).then(content => {
              view.setViewData(content, false);
            });
          }
        });
      })
    );
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
    this.styleEl?.remove();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Injects a <style> block with one CSS rule per tag into the document head.
  // Called on load and whenever settings change.
  applyTagStyles() {
    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'timeline-tag-styles';
      document.head.appendChild(this.styleEl);
    }

    this.styleEl.textContent = this.settings.tagColors
      .filter(e => e.tag)
      .map(e => `
        .tl-tag-${e.tag}.vis-item,
        .tl-tag-${e.tag}.vis-item.vis-line,
        .tl-tag-${e.tag}.vis-item.vis-dot {
          background: ${e.color} !important;
          border-color: ${e.color} !important;
        }
      `).join('\n');
  }

  async activateView() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file to open as timeline.');
      return;
    }

    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).find(
      leaf => (leaf.view as TimelineView).file?.path === activeFile.path
    );

    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }

    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({
      type: TIMELINE_VIEW_TYPE,
      active: true,
      state: { file: activeFile.path },
    });

    workspace.revealLeaf(leaf);
  }
}