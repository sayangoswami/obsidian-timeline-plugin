import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { parseMarkdown } from './parser';
import { TimelineRenderer } from './renderer';

export const TIMELINE_VIEW_TYPE = 'timeline-view';

export class TimelineView extends TextFileView {
  private renderer: TimelineRenderer | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return TIMELINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? 'Timeline';
  }

  getIcon(): string {
    return 'calendar-range'; // Obsidian Lucide icon
  }

  // Called whenever the file content changes
  onLoadFile(): Promise<void> {
    this.renderTimeline();
    return Promise.resolve();
  }

  setViewData(data: string, clear: boolean): void {
    this.data = data;
    this.renderTimeline();
  }

  clear(): void {
    this.contentEl.empty();
  }

  getViewData(): string {
    return this.data;
  }

  private renderTimeline() {
    const timelineData = parseMarkdown(this.data);
    this.contentEl.empty();
    this.renderer = new TimelineRenderer(this.contentEl, timelineData);
    this.renderer.render();
  }
}