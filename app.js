/**
 * Jenkins Pipeline Dashboard — app.js
 *
 * Architecture overview:
 *  - DataService   → fetches / mocks pipeline data (swap fetchFromJenkins to go live)
 *  - DashboardUI   → renders tiles and header stats
 *  - FilterManager → search + status filter
 *  - ToastManager  → failure notifications
 *  - ClockManager  → live clock
 *  - App           → orchestrates everything, drives auto-refresh
 */

'use strict';

/* ─────────────────────────────────────────────────────────
   MOCK DATA
   Replace this array (or call fetchFromJenkins) for real data.
   ───────────────────────────────────────────────────────── */
const MOCK_PIPELINES = [
  {
    id: 'payments-service',
    name: 'Payments Service',
    status: 'success',
    buildNumber: 142,
    duration: '3m 22s',
    lastUpdated: new Date(Date.now() - 4 * 60 * 1000),   // 4 min ago
    branch: 'main',
    url: 'https://jenkins.example.com/job/payments-service/142/',
    message: null,
    progress: null,
  },
  {
    id: 'auth-service',
    name: 'Auth Service',
    status: 'failed',
    buildNumber: 89,
    duration: '1m 47s',
    lastUpdated: new Date(Date.now() - 11 * 60 * 1000),  // 11 min ago
    branch: 'feature/oauth2',
    url: 'https://jenkins.example.com/job/auth-service/89/',
    message: 'Step "Run Tests" failed: NullPointerException at AuthController.java:72',
    progress: null,
  },
  {
    id: 'frontend-app',
    name: 'Frontend App',
    status: 'running',
    buildNumber: 217,
    duration: '—',
    lastUpdated: new Date(Date.now() - 2 * 60 * 1000),   // 2 min ago
    branch: 'release/3.4',
    url: 'https://jenkins.example.com/job/frontend-app/217/',
    message: null,
    progress: 62,  // percentage 0-100
  },
  {
    id: 'inventory-api',
    name: 'Inventory API',
    status: 'unstable',
    buildNumber: 55,
    duration: '5m 10s',
    lastUpdated: new Date(Date.now() - 23 * 60 * 1000),
    branch: 'main',
    url: 'https://jenkins.example.com/job/inventory-api/55/',
    message: '3 test(s) unstable — coverage dropped below 70%',
    progress: null,
  },
  {
    id: 'order-processor',
    name: 'Order Processor',
    status: 'success',
    buildNumber: 303,
    duration: '2m 04s',
    lastUpdated: new Date(Date.now() - 35 * 60 * 1000),
    branch: 'main',
    url: 'https://jenkins.example.com/job/order-processor/303/',
    message: null,
    progress: null,
  },
  {
    id: 'notification-service',
    name: 'Notification Service',
    status: 'failed',
    buildNumber: 76,
    duration: '4m 33s',
    lastUpdated: new Date(Date.now() - 8 * 60 * 1000),
    branch: 'hotfix/email-retry',
    url: 'https://jenkins.example.com/job/notification-service/76/',
    message: 'Docker build failed: base image not found — registry timeout',
    progress: null,
  },
  {
    id: 'user-service',
    name: 'User Service',
    status: 'running',
    buildNumber: 130,
    duration: '—',
    lastUpdated: new Date(Date.now() - 1 * 60 * 1000),
    branch: 'develop',
    url: 'https://jenkins.example.com/job/user-service/130/',
    message: null,
    progress: 28,
  },
  {
    id: 'reporting-dashboard',
    name: 'Reporting Dashboard',
    status: 'success',
    buildNumber: 61,
    duration: '6m 51s',
    lastUpdated: new Date(Date.now() - 55 * 60 * 1000),
    branch: 'main',
    url: 'https://jenkins.example.com/job/reporting-dashboard/61/',
    message: null,
    progress: null,
  },
  {
    id: 'data-pipeline',
    name: 'Data Pipeline',
    status: 'unstable',
    buildNumber: 22,
    duration: '12m 18s',
    lastUpdated: new Date(Date.now() - 90 * 60 * 1000),
    branch: 'feature/spark-upgrade',
    url: 'https://jenkins.example.com/job/data-pipeline/22/',
    message: 'Spark job completed with warnings — 12 records skipped',
    progress: null,
  },
  {
    id: 'search-service',
    name: 'Search Service',
    status: 'success',
    buildNumber: 188,
    duration: '1m 55s',
    lastUpdated: new Date(Date.now() - 18 * 60 * 1000),
    branch: 'main',
    url: 'https://jenkins.example.com/job/search-service/188/',
    message: null,
    progress: null,
  },
];

/* ─────────────────────────────────────────────────────────
   DATA SERVICE
   ───────────────────────────────────────────────────────── */
const DataService = {
  /**
   * Returns mock data with a simulated async delay.
   * To go live: replace this with fetchFromJenkins().
   */
  async fetchPipelines() {
    await DataService._delay(600);
    return DataService._simulateLiveUpdates([...MOCK_PIPELINES]);
  },

  /**
   * Live Jenkins integration template (disabled).
   * Uncomment and configure JENKINS_BASE_URL + credentials to activate.
   *
   * async fetchFromJenkins() {
   *   const JENKINS_BASE_URL = 'https://your-jenkins.example.com';
   *   const token = btoa('user:api-token');
   *   const res = await fetch(`${JENKINS_BASE_URL}/api/json?tree=jobs[name,lastBuild[number,result,duration,timestamp,url]]`, {
   *     headers: { Authorization: `Basic ${token}` },
   *   });
   *   if (!res.ok) throw new Error(`Jenkins API error: ${res.status}`);
   *   const data = await res.json();
   *   return data.jobs.map(DataService._normalizeJenkinsJob);
   * },
   *
   * _normalizeJenkinsJob(job) {
   *   const b = job.lastBuild ?? {};
   *   return {
   *     id: job.name,
   *     name: job.name,
   *     status: DataService._mapJenkinsResult(b.result),
   *     buildNumber: b.number ?? '—',
   *     duration: DataService._fmtDuration(b.duration),
   *     lastUpdated: b.timestamp ? new Date(b.timestamp) : new Date(),
   *     branch: 'main',
   *     url: b.url ?? '#',
   *     message: null,
   *     progress: null,
   *   };
   * },
   *
   * _mapJenkinsResult(result) {
   *   const map = { SUCCESS: 'success', FAILURE: 'failed', UNSTABLE: 'unstable', null: 'running' };
   *   return map[result] ?? 'running';
   * },
   *
   * _fmtDuration(ms) {
   *   if (!ms) return '—';
   *   const s = Math.floor(ms / 1000);
   *   return s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;
   * },
   */

  /** Adds minor random variation to progress bars on each poll. */
  _simulateLiveUpdates(pipelines) {
    return pipelines.map(p => {
      if (p.status === 'running' && p.progress !== null) {
        p.progress = Math.min(99, p.progress + Math.floor(Math.random() * 5));
      }
      return p;
    });
  },

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

/* ─────────────────────────────────────────────────────────
   TOAST MANAGER
   ───────────────────────────────────────────────────────── */
const ToastManager = {
  container: null,
  shown: new Set(),  // prevent duplicate toasts per refresh cycle

  init() {
    this.container = document.getElementById('toast-container');
  },

  show({ type = 'info', title, message, duration = 5000 }) {
    const icons = { error: '🔴', warning: '🟡', info: '🔵', success: '🟢' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] ?? '🔵'}</span>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-msg">${message}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss notification">×</button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => this._dismiss(toast));
    this.container.prepend(toast);

    if (duration > 0) {
      setTimeout(() => this._dismiss(toast), duration);
    }
  },

  _dismiss(toast) {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  },

  /** Notify about newly failed pipelines (avoids repeating across refreshes). */
  notifyFailures(pipelines) {
    pipelines
      .filter(p => p.status === 'failed')
      .forEach(p => {
        const key = `${p.id}-${p.buildNumber}`;
        if (!this.shown.has(key)) {
          this.shown.add(key);
          this.show({
            type: 'error',
            title: `Pipeline Failed: ${p.name}`,
            message: p.message ?? 'Build failed. Click the tile for details.',
          });
        }
      });
  },
};

/* ─────────────────────────────────────────────────────────
   FILTER MANAGER
   ───────────────────────────────────────────────────────── */
const FilterManager = {
  searchQuery: '',
  statusFilter: 'all',

  init() {
    const searchInput = document.getElementById('search-input');
    const statusSelect = document.getElementById('status-filter');

    searchInput.addEventListener('input', e => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      App.renderFiltered();
    });

    statusSelect.addEventListener('change', e => {
      this.statusFilter = e.target.value;
      App.renderFiltered();
    });
  },

  apply(pipelines) {
    return pipelines.filter(p => {
      const matchName   = p.name.toLowerCase().includes(this.searchQuery);
      const matchStatus = this.statusFilter === 'all' || p.status === this.statusFilter;
      return matchName && matchStatus;
    });
  },
};

/* ─────────────────────────────────────────────────────────
   DASHBOARD UI
   ───────────────────────────────────────────────────────── */
const DashboardUI = {
  grid: null,
  template: null,
  loadingOverlay: null,
  emptyState: null,

  init() {
    this.grid          = document.getElementById('pipeline-grid');
    this.template      = document.getElementById('tile-template');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.emptyState    = document.getElementById('empty-state');
  },

  showLoading() {
    this.loadingOverlay.classList.remove('hidden');
    this.grid.innerHTML = '';
  },

  hideLoading() {
    this.loadingOverlay.classList.add('hidden');
  },

  /** Render skeleton tiles while data is loading. */
  showSkeletons(count = 6) {
    this.grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'skeleton-tile';
      el.innerHTML = `
        <div class="skeleton-line short"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line thin"></div>
      `;
      this.grid.appendChild(el);
    }
  },

  /** Full render of the tile grid. */
  renderTiles(pipelines) {
    this.grid.innerHTML = '';

    if (pipelines.length === 0) {
      this.emptyState.classList.remove('hidden');
      return;
    }
    this.emptyState.classList.add('hidden');

    pipelines.forEach(p => {
      const tile = this._buildTile(p);
      this.grid.appendChild(tile);
    });
  },

  /** Update header stat chips. */
  updateStats(pipelines) {
    const count = (s) => pipelines.filter(p => p.status === s).length;
    document.getElementById('count-total').textContent   = pipelines.length;
    document.getElementById('count-running').textContent = count('running');
    document.getElementById('count-failed').textContent  = count('failed');
    document.getElementById('count-success').textContent = count('success');
  },

  /** Update the "last updated" label in the toolbar. */
  updateTimestamp() {
    document.getElementById('last-updated').textContent =
      `Last updated: ${new Date().toLocaleTimeString()}`;
  },

  _buildTile(pipeline) {
    const clone = this.template.content.cloneNode(true);
    const article = clone.querySelector('.tile');

    article.dataset.status = pipeline.status;
    article.setAttribute('aria-label', `${pipeline.name} — ${pipeline.status}`);

    // Open Jenkins URL on click / keyboard
    article.addEventListener('click', e => {
      if (e.target.closest('.tile-refresh-btn')) return;
      window.open(pipeline.url, '_blank', 'noopener,noreferrer');
    });
    article.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.tile-refresh-btn')) {
        window.open(pipeline.url, '_blank', 'noopener,noreferrer');
      }
    });

    // Tile-level refresh button
    const refreshBtn = article.querySelector('.tile-refresh-btn');
    refreshBtn.addEventListener('click', async e => {
      e.stopPropagation();
      refreshBtn.classList.add('spinning');
      await App.refresh();
      refreshBtn.classList.remove('spinning');
    });

    // Populate fields
    article.querySelector('.tile-name').textContent          = pipeline.name;
    article.querySelector('.tile-status-badge').textContent  = pipeline.status.toUpperCase();
    article.querySelector('.tile-build-number').textContent  = `#${pipeline.buildNumber}`;
    article.querySelector('.tile-duration').textContent      = pipeline.duration;
    article.querySelector('.tile-updated').textContent       = DashboardUI._timeAgo(pipeline.lastUpdated);
    article.querySelector('.tile-branch-name').textContent   = pipeline.branch;

    // Progress bar (running jobs only)
    if (pipeline.status === 'running' && pipeline.progress !== null) {
      const wrap = article.querySelector('.progress-wrap');
      wrap.classList.remove('hidden');
      article.querySelector('.progress-fill').style.width  = `${pipeline.progress}%`;
      article.querySelector('.progress-label').textContent = `${pipeline.progress}% complete`;
    }

    // Failure/warning message
    if (pipeline.message) {
      const msg = article.querySelector('.tile-message');
      msg.classList.remove('hidden');
      msg.textContent = pipeline.message;
    }

    return article;
  },

  _timeAgo(date) {
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60)         return 'just now';
    if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  },
};

/* ─────────────────────────────────────────────────────────
   CLOCK MANAGER
   ───────────────────────────────────────────────────────── */
const ClockManager = {
  el: null,
  init() {
    this.el = document.getElementById('live-clock');
    this._tick();
    setInterval(() => this._tick(), 1000);
  },
  _tick() {
    this.el.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  },
};

/* ─────────────────────────────────────────────────────────
   THEME MANAGER
   ───────────────────────────────────────────────────────── */
const ThemeManager = {
  current: 'dark',
  init() {
    const saved = localStorage.getItem('jw-theme') ?? 'dark';
    this.set(saved);

    document.getElementById('theme-toggle').addEventListener('click', () => {
      this.set(this.current === 'dark' ? 'light' : 'dark');
    });
  },
  set(theme) {
    this.current = theme;
    document.documentElement.dataset.theme = theme;
    document.getElementById('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('jw-theme', theme);
  },
};

/* ─────────────────────────────────────────────────────────
   APP — main orchestrator
   ───────────────────────────────────────────────────────── */
const App = {
  pipelines: [],
  refreshInterval: null,
  AUTO_REFRESH_MS: 30_000,

  async init() {
    DashboardUI.init();
    FilterManager.init();
    ToastManager.init();
    ClockManager.init();
    ThemeManager.init();

    // Global refresh button
    const globalRefreshBtn = document.getElementById('global-refresh');
    globalRefreshBtn.addEventListener('click', async () => {
      globalRefreshBtn.classList.add('spinning');
      await this.refresh();
      globalRefreshBtn.classList.remove('spinning');
    });

    // Initial load (show skeletons for a nicer first paint)
    DashboardUI.showSkeletons();
    await this.refresh();

    // Auto-refresh
    this.refreshInterval = setInterval(() => this.refresh(), this.AUTO_REFRESH_MS);
  },

  /** Fetch data → update state → re-render. */
  async refresh() {
    try {
      const data = await DataService.fetchPipelines();
      this.pipelines = data;
      DashboardUI.hideLoading();
      DashboardUI.updateStats(data);
      DashboardUI.updateTimestamp();
      this.renderFiltered();
      ToastManager.notifyFailures(data);
    } catch (err) {
      console.error('[JenkinsWatch] Fetch error:', err);
      ToastManager.show({
        type: 'error',
        title: 'Refresh failed',
        message: err.message ?? 'Could not fetch pipeline data.',
      });
    }
  },

  /** Apply current filters and re-render tiles only (no API call). */
  renderFiltered() {
    const filtered = FilterManager.apply(this.pipelines);
    DashboardUI.renderTiles(filtered);
  },
};

/* ─────────────────────────────────────────────────────────
   BOOT
   ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.init());
