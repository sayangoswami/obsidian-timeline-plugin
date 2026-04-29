import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { TimelineView, TIMELINE_VIEW_TYPE } from './TimelineView';

export default class TimelinePlugin extends Plugin {
  async onload() {
    this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new TimelineView(leaf));

    this.addRibbonIcon('calendar-range', 'Open as Timeline', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-timeline-view',
      name: 'Open current file as Timeline',
      callback: () => this.activateView(),
    });

    // Re-render on file save
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).forEach(leaf => {
          const view = leaf.view as TimelineView;
          if (view.file?.path === file.path) {
            this.app.vault.read(file as TFile).then(content => {
              view.setViewData(content, false);
            });
          }
        });
      })
    );
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
  }

  async activateView() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file to open as timeline.');
      return;
    }

    const { workspace } = this.app;

    // Check if this file is already open as a timeline
    const existing = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).find(
      leaf => (leaf.view as TimelineView).file?.path === activeFile.path
    );

    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }

    // Open in a new tab and set the file — this is what actually loads content
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({
      type: TIMELINE_VIEW_TYPE,
      active: true,
      state: { file: activeFile.path },  // ← this is the critical missing piece
    });

    workspace.revealLeaf(leaf);
  }
}