import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { parseMarkdown } from './parser';
import { TimelineRenderer } from './renderer';

export const TIMELINE_VIEW_TYPE = 'timeline-view';

export class TimelineView extends TextFileView {
  private renderer: TimelineRenderer | null = null;
  data: string = '';

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return TIMELINE_VIEW_TYPE; }
  getDisplayText(): string { return this.file?.basename ?? 'Timeline'; }
  getIcon(): string { return 'calendar-range'; }

  // TextFileView requires this — return current in-memory content
  getViewData(): string {
    return this.data;
  }

  // Called by Obsidian whenever the file is loaded or reloaded
  setViewData(data: string, clear: boolean): void {
    this.data = data;
    // Guard: contentEl must be attached to the DOM
    if (!this.contentEl.isConnected) return;
    this.renderTimeline();
  }

  clear(): void {
    this.data = '';
    this.contentEl.empty();
  }

  // Called once when the view's DOM is ready — safe to render here
  async onOpen(): Promise<void> {
    this.contentEl.addClass('timeline-view-container');
  }

  // Called after the file is fully loaded into the view
  async onLoadFile(file: import('obsidian').TFile): Promise<void> {
    await super.onLoadFile(file);
    this.renderTimeline();
  }

  private renderTimeline() {
  if (!this.data) return;
  try {
    // Destroy previous instance before re-rendering
    this.renderer?.destroy();

    const timelineData = parseMarkdown(this.data);
    this.contentEl.empty();
    this.renderer = new TimelineRenderer(this.contentEl, timelineData);
    this.renderer.render();
  } catch (e) {
    this.contentEl.empty();
    this.contentEl.createEl('pre', {
      text: `Timeline render error:\n${e.message}`,
      cls: 'timeline-error'
    });
  }
}
}