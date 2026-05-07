import { TimelineData, TimelineTask, Swimlane, SubSwimlane } from './types';
import TimelinePlugin from './main';

// ─── Layout constants ─────────────────────────────────────────────────────────

const LABEL_WIDTH   = 220;
const ROW_HEIGHT    = 28;  // height of one stacked task bar
const ROW_PADDING   = 6;   // vertical padding above/below stack in a group
const HEADER_HEIGHT = 48;
const MIN_DAY_PX    = 4;
const MAX_DAY_PX    = 120;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Stack packing ────────────────────────────────────────────────────────────
// Assigns each task a row index within its group so bars never overlap.
// Returns { task, row } pairs and the total number of rows needed.

interface StackedTask {
  task: TimelineTask;
  row: number;
}

function stackTasks(tasks: TimelineTask[]): { stacked: StackedTask[]; rowCount: number } {
  // Each slot tracks the end date of the last task placed in that row
  const rowEnds: Date[] = [];
  const stacked: StackedTask[] = [];

  for (const task of tasks) {
    // Find the first row where this task fits (starts after the row's last end)
    let placed = false;
    for (let r = 0; r < rowEnds.length; r++) {
      if (task.startDate >= rowEnds[r]) {
        stacked.push({ task, row: r });
        rowEnds[r] = task.endDate;
        placed = true;
        break;
      }
    }
    if (!placed) {
      stacked.push({ task, row: rowEnds.length });
      rowEnds.push(task.endDate);
    }
  }

  return { stacked, rowCount: Math.max(1, rowEnds.length) };
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class TimelineRenderer {
  private container: HTMLElement;
  private data: TimelineData;
  private plugin: TimelinePlugin;
  private filePath: string;

  private dayPx    = 28;   // pixels per day (current zoom)
  private offsetPx = 0;    // pan offset in pixels
  private minDate: Date;
  private maxDate: Date;
  private totalDays: number;

  // DOM refs rebuilt on each render
  private canvas!: HTMLElement;
  private labelsCol!: HTMLElement;
  private gridEl!: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    container: HTMLElement,
    data: TimelineData,
    plugin: TimelinePlugin,
    filePath: string
  ) {
    this.container = container;
    this.data      = data;
    this.plugin    = plugin;
    this.filePath  = filePath;
  
    const today = new Date();
  
    // Always include today in the visible range
    const dataMin = data.minDate < today ? data.minDate : today;
    const dataMax = data.maxDate > today ? data.maxDate : today;
  
    // Pad 7 days either side
    this.minDate   = addDays(dataMin, -7);
    this.maxDate   = addDays(dataMax, 7);
    this.totalDays = daysBetween(this.minDate, this.maxDate);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  render() {
    this.container.empty();
    this.container.addClass('tl-root');

    this.buildToolbar();
    this.buildGrid();
    this.fitToContainer();

    this.resizeObserver = new ResizeObserver(() => this.fitToContainer());
    this.resizeObserver.observe(this.container);
  }

  redraw() {
    this.fitToContainer();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────────

  private buildToolbar() {
    const bar = this.container.createDiv('tl-toolbar');

    const btn = (label: string, fn: () => void) => {
      const b = bar.createEl('button', { text: label, cls: 'tl-btn' });
      b.addEventListener('click', fn);
    };

    btn('Today',   () => this.scrollToDate(new Date()));
    btn('Fit All', () => this.fitToContainer());
    btn('＋',      () => this.zoom(1.3));
    btn('－',      () => this.zoom(1 / 1.3));
  }

  // ── Grid ────────────────────────────────────────────────────────────────────
  // One CSS grid: [labels] [scrollable canvas]
  // Both share identical row definitions so they can never drift.

  private buildGrid() {
    const wrap = this.container.createDiv('tl-grid-wrap');

    // Left: sticky label column
    this.labelsCol = wrap.createDiv('tl-labels');

    // Right: scrollable canvas
    const scroll = wrap.createDiv('tl-scroll');
    this.canvas   = scroll.createDiv('tl-canvas');

    // Pan by dragging the canvas
    this.attachPan(scroll);

    // Zoom with ctrl+wheel
    scroll.addEventListener('wheel', (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    this.drawEverything();
  }

  // ── Draw ────────────────────────────────────────────────────────────────────

  private drawEverything() {
    this.canvas.empty();
    this.labelsCol.empty();

    // Compute total canvas width
    const canvasWidth = this.totalDays * this.dayPx;
    this.canvas.style.width = `${canvasWidth}px`;

    // Rows: header + one row per group (L2 + L3)
    const rowDefs: string[] = [`${HEADER_HEIGHT}px`]; // header row

    // Pre-compute stacks so we know row heights before drawing
    interface GroupInfo {
      type: 'l2' | 'l3';
      label: string;
      stacked: StackedTask[];
      rowCount: number;
      height: number;
    }

    const groups: GroupInfo[] = [];

    for (const sl of this.data.swimlanes) {
      const { stacked, rowCount } = stackTasks(sl.tasks);
      const height = rowCount * ROW_HEIGHT + ROW_PADDING * 2;
      groups.push({ type: 'l2', label: sl.label, stacked, rowCount, height });
      rowDefs.push(`${height}px`);

      for (const sub of sl.subSwimlanes) {
        const { stacked: ss, rowCount: rc } = stackTasks(sub.tasks);
        const h = rc * ROW_HEIGHT + ROW_PADDING * 2;
        groups.push({ type: 'l3', label: sub.label, stacked: ss, rowCount: rc, height: h });
        rowDefs.push(`${h}px`);
      }
    }

    // Apply identical grid-template-rows to both columns
    const gridRows = rowDefs.join(' ');
    this.canvas.style.display       = 'grid';
    this.canvas.style.gridTemplateRows = gridRows;
    this.labelsCol.style.display       = 'grid';
    this.labelsCol.style.gridTemplateRows = gridRows;

    // ── Date header ──
    this.drawDateHeader(canvasWidth);
    this.labelsCol.createDiv('tl-label-header'); // blank cell to align with header

    // ── Today line ──
    const todayOffset = daysBetween(this.minDate, new Date()) * this.dayPx;
    const todayLine = this.canvas.createDiv('tl-today-line');
    todayLine.style.left   = `${todayOffset}px`;
    todayLine.style.height = `${rowDefs.reduce((s, r) => s + parseInt(r), 0)}px`;

    // ── Group rows ──
    for (const g of groups) {
      this.drawLaneLabel(g.label, g.type, g.height);
      this.drawLaneRow(g.stacked, g.height, canvasWidth);
    }
  }

  // ── Date header ─────────────────────────────────────────────────────────────

  private drawDateHeader(canvasWidth: number) {
    const header = this.canvas.createDiv('tl-date-header');
    header.style.width    = `${canvasWidth}px`;
    header.style.height   = `${HEADER_HEIGHT}px`;
    header.style.position = 'relative';

    // Walk months
    const cursor = new Date(this.minDate);
    cursor.setDate(1);

    while (cursor <= this.maxDate) {
      const offsetPx = daysBetween(this.minDate, cursor) * this.dayPx;
      if (offsetPx > canvasWidth) break;

      const label = header.createDiv('tl-month-label');
      label.setText(cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      label.style.left = `${Math.max(0, offsetPx)}px`;

      // Week ticks
      for (let w = 0; w < 6; w++) {
        const tickDate = new Date(cursor);
        tickDate.setDate(tickDate.getDate() + w * 7);
        const tickPx = daysBetween(this.minDate, tickDate) * this.dayPx;
        if (tickPx < 0 || tickPx > canvasWidth) continue;

        const tick = header.createDiv('tl-week-tick');
        tick.style.left = `${tickPx}px`;
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // ── Lane label ───────────────────────────────────────────────────────────────

  private drawLaneLabel(label: string, type: 'l2' | 'l3', height: number) {
    const el = this.labelsCol.createDiv(`tl-lane-label tl-lane-label--${type}`);
    el.style.height = `${height}px`;
    el.createSpan({ text: label });
  }

  // ── Lane row ─────────────────────────────────────────────────────────────────

  private drawLaneRow(stacked: StackedTask[], height: number, canvasWidth: number) {
    const row = this.canvas.createDiv('tl-lane-row');
    row.style.height   = `${height}px`;
    row.style.width    = `${canvasWidth}px`;
    row.style.position = 'relative';

    // Alternating grid lines
    const bg = row.createDiv('tl-row-bg');
    bg.style.width = `${canvasWidth}px`;

    for (const { task, row: stackRow } of stacked) {
      this.drawTask(row, task, stackRow);
    }
  }

  // ── Task bar ─────────────────────────────────────────────────────────────────

  private drawTask(row: HTMLElement, task: TimelineTask, stackRow: number) {
    const startPx   = daysBetween(this.minDate, task.startDate) * this.dayPx;
    const endPx     = daysBetween(this.minDate, task.endDate)   * this.dayPx;
    const widthPx   = Math.max(task.isRange ? endPx - startPx : 10, 8);
    const topPx     = ROW_PADDING + stackRow * ROW_HEIGHT;
    const barHeight = ROW_HEIGHT - 4;
  
    const icon = { done: '✓ ', 'in-progress': '◑ ', blocked: '✕ ', pending: '' }[task.status];
    const labelText = icon + task.label;
  
    const tip = [
      task.label,
      task.status !== 'pending' ? `Status: ${task.status}` : '',
      task.isRange
        ? `${formatDate(task.startDate)} → ${formatDate(task.endDate)}`
        : formatDate(task.startDate),
      task.tags.map(t => `#${t}`).join(' '),
      task.note ?? '',
      task.unresolvedRef ? `⚠ ref "${task.unresolvedRef}" not found` : '',
    ].filter(Boolean).join('\n');
  
    const bar = row.createDiv('tl-task');
    bar.style.left   = `${startPx}px`;
    bar.style.top    = `${topPx}px`;
    bar.style.width  = `${widthPx}px`;
    bar.style.height = `${barHeight}px`;
    bar.setAttribute('title', tip);
  
    bar.addClass(`tl-${task.status}`);
    if (task.tags.length)   bar.addClass(`tl-tag-${task.tags[0]}`);
    if (!task.isRange)      bar.addClass('tl-point');
    if (task.unresolvedRef) bar.addClass('tl-unresolved');
  
    bar.addEventListener('click', () => this.jumpToSource(task));
  
    // Label clipped inside bar — tooltip shows full text on hover
    bar.createSpan({ text: labelText, cls: 'tl-task-label' });
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────────

  private zoom(factor: number) {
    const next = Math.min(MAX_DAY_PX, Math.max(MIN_DAY_PX, this.dayPx * factor));
    if (next === this.dayPx) return;
    this.dayPx = next;
    this.drawEverything();
  }

  // ── Fit to container ─────────────────────────────────────────────────────────

  private fitToContainer() {
    const availableWidth = this.container.offsetWidth - LABEL_WIDTH - 24;
    if (availableWidth <= 0) return;
    this.dayPx = Math.min(MAX_DAY_PX, Math.max(MIN_DAY_PX,
      availableWidth / this.totalDays
    ));
    this.drawEverything();
  }

  // ── Scroll to date ────────────────────────────────────────────────────────────

  private scrollToDate(date: Date) {
    const scroll = this.container.querySelector('.tl-scroll') as HTMLElement;
    if (!scroll) return;
    const offsetPx = daysBetween(this.minDate, date) * this.dayPx;
    scroll.scrollLeft = offsetPx - scroll.clientWidth / 2;
  }

  // ── Pan ───────────────────────────────────────────────────────────────────────

  private attachPan(scroll: HTMLElement) {
    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    scroll.addEventListener('mousedown', (e: MouseEvent) => {
      // Only pan on middle mouse or if not clicking a task bar
      if ((e.target as HTMLElement).closest('.tl-task')) return;
      dragging = true;
      startX = e.pageX;
      startScrollLeft = scroll.scrollLeft;
      scroll.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragging) return;
      scroll.scrollLeft = startScrollLeft - (e.pageX - startX);
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
      scroll.style.cursor = '';
    });
  }

  // ── Jump to source ────────────────────────────────────────────────────────────

  private async jumpToSource(task: TimelineTask) {
    const { workspace, vault } = this.plugin.app;
    const file = vault.getAbstractFileByPath(this.filePath);
    if (!file) return;

    const leaf = workspace.getLeaf('tab');
    await leaf.openFile(file as import('obsidian').TFile);
    workspace.revealLeaf(leaf);

    const content = await vault.read(file as import('obsidian').TFile);
    const lines   = content.split('\n');
    const lineIdx = lines.findIndex(l => l.includes(task.label) && l.includes('|'));
    if (lineIdx === -1) return;

    const view = leaf.view as any;
    if (view?.editor) {
      view.editor.setCursor({ line: lineIdx, ch: 0 });
      view.editor.scrollIntoView(
        { from: { line: lineIdx, ch: 0 }, to: { line: lineIdx, ch: 0 } },
        true
      );
    }
  }
}