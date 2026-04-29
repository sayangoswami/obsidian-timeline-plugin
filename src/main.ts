import { Plugin, WorkspaceLeaf, addIcon } from 'obsidian';
import { TimelineView, TIMELINE_VIEW_TYPE } from './TimelineView';

export default class TimelinePlugin extends Plugin {
  async onload() {
    // Register the custom view type
    this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new TimelineView(leaf));

    // Ribbon button to open current file as timeline
    this.addRibbonIcon('calendar-range', 'Open as Timeline', () => {
      this.activateView();
    });

    // Command palette entry
    this.addCommand({
      id: 'open-timeline-view',
      name: 'Open current file as Timeline',
      callback: () => this.activateView(),
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
  }

  async activateView() {
    const { workspace } = this.app;
    const existingLeaves = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE);

    if (existingLeaves.length === 0) {
      // Open in a new tab
      const leaf = workspace.getLeaf('tab');
      const activeFile = workspace.getActiveFile();
      await leaf.setViewState({
        type: TIMELINE_VIEW_TYPE,
        state: { file: activeFile?.path },
      });
    }

    workspace.revealLeaf(workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0]);
  }
}