import { Timeline, DataSet } from 'vis-timeline/standalone';
import type { TimelineOptions, TimelineGroup, TimelineItem } from 'vis-timeline';
import { TimelineData, TimelineTask } from './types';

export class TimelineRenderer {
  private container: HTMLElement;
  private data: TimelineData;
  private timeline: Timeline | null = null;

  constructor(container: HTMLElement, data: TimelineData) {
    this.container = container;
    this.data = data;
  }

  render() {
    this.container.empty();

    // ── Groups (swimlanes) ──────────────────────────────────
    const groups: TimelineGroup[] = [];
    const items: TimelineItem[] = [];
    let itemId = 0;
    let groupId = 0;

    for (const sl of this.data.swimlanes) {
      const slGroupId = groupId++;

      // L2 swimlane — nestedGroups lists its children
      const childIds: number[] = [];

      // Direct tasks go in the L2 group itself
      for (const task of sl.tasks) {
        items.push(this.taskToItem(task, slGroupId, itemId++));
      }

      // L3 sub-swimlanes
      for (const sub of sl.subSwimlanes) {
        const subGroupId = groupId++;
        childIds.push(subGroupId);

        groups.push({
          id: subGroupId,
          content: `<span class="tl-group-l3">${sub.label}</span>`,
        });

        for (const task of sub.tasks) {
          items.push(this.taskToItem(task, subGroupId, itemId++));
        }
      }

      groups.push({
        id: slGroupId,
        content: `<span class="tl-group-l2">${sl.label}</span>`,
        nestedGroups: childIds.length ? childIds : undefined,
        showNested: true,
      });
    }

    // vis-timeline wants groups in id order for nesting to work correctly
    groups.sort((a, b) => (a.id as number) - (b.id as number));

    const groupsDs = new DataSet(groups);
    const itemsDs  = new DataSet(items);

    // ── Visible window: pad 1 week either side ──────────────
    const start = new Date(this.data.minDate);
    start.setDate(start.getDate() - 7);
    const end = new Date(this.data.maxDate);
    end.setDate(end.getDate() + 7);

    // ── Options ─────────────────────────────────────────────
    const options: TimelineOptions = {
        start,
        end,
        stack: true,
        stackSubgroups: true,
        orientation: { axis: 'top' },
        zoomMin: 1000 * 60 * 60 * 24 * 3,
        zoomMax: 1000 * 60 * 60 * 24 * 365 * 3,
        moveable: true,
        zoomable: true,
        selectable: true,
        groupHeightMode: 'fitItems',  // ← key change: shrink each row to its content
        margin: { item: { horizontal: 4, vertical: 4 }, axis: 6 },
        tooltip: { followMouse: true, overflowMethod: 'cap' },
        // height: null,        // ← let vis size itself by content, not the container
        minHeight: '100%',   // ← still fills the pane when content is small
    };

    // ── Mount ───────────────────────────────────────────────
    const wrapper = this.container.createDiv('tl-wrapper');
    this.timeline = new Timeline(wrapper, itemsDs, groupsDs, options);

    // ── Today button ────────────────────────────────────────
    const toolbar = this.container.createDiv('tl-toolbar');
    toolbar.style.cssText = 'position:absolute;top:8px;right:12px;z-index:100;display:flex;gap:6px;';

    const btn = (label: string, fn: () => void) => {
      const b = toolbar.createEl('button', { text: label, cls: 'tl-btn' });
      b.onclick = fn;
    };

    btn('Today', () => this.timeline!.moveTo(new Date()));
    btn('Fit All', () => this.timeline!.fit());

    this.container.style.position = 'relative';
    this.container.appendChild(toolbar);
  }

  private taskToItem(task: TimelineTask, groupId: number, id: number): TimelineItem {
    const tagClass = task.tags.length ? `tl-tag-${task.tags[0]}` : '';
    const doneClass = task.status === 'done' ? 'tl-done' : '';
    const tooltip = [
      `<b>${task.label}</b>`,
      task.isRange
        ? `${task.startDate.toDateString()} → ${task.endDate.toDateString()}`
        : task.startDate.toDateString(),
      task.tags.map(t => `#${t}`).join(' '),
      task.note ?? '',
    ].filter(Boolean).join('<br>');

    return {
      id,
      group: groupId,
      content: `<span class="tl-item-label">${task.label}</span>`,
      start: task.startDate,
      // vis needs end > start even for point events; use type:'point' instead
      end: task.isRange ? task.endDate : undefined,
      type: task.isRange ? 'range' : 'point',
      title: tooltip,               // shown as tooltip on hover
      className: `tl-item ${doneClass} ${tagClass}`.trim(),
    };
  }

  destroy() {
    this.timeline?.destroy();
    this.timeline = null;
  }
}