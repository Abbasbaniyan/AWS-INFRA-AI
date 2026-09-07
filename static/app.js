// State Management
const state = {
  activeView: 'dashboard',
  activeWorkspaceTab: 'overview',
  metrics: null,
  rawMetrics: null,
  chatHistory: [],
  logs: [],
  activityList: [],
  topology: null,
  isSimulatedActive: false,
  isAuthenticated: false,
  pollTimers: []
};

// DOM Selectors Cache
const elements = {
  authOverlay: document.getElementById('authOverlay'),
  appLayout: document.getElementById('appLayout'),
  loginForm: document.getElementById('loginForm'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  loginErrorMsg: document.getElementById('loginErrorMsg'),
  loginErrorText: document.getElementById('loginErrorText'),
  loginSubmitBtn: document.getElementById('loginSubmitBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  userAvatar: document.getElementById('userAvatar'),
  userRoleText: document.getElementById('userRoleText'),
  navButtons: document.querySelectorAll('.nav-item'),
  views: {
    dashboard: document.getElementById('view-dashboard'),
    resources: document.getElementById('view-resources'),
    workspace: document.getElementById('view-workspace')
  },
  workspaceTabButtons: document.querySelectorAll('.workspace-tab-btn'),
  workspacePanels: {
    overview: document.getElementById('workspace-panel-overview'),
    servers: document.getElementById('workspace-panel-servers'),
    models: document.getElementById('workspace-panel-models'),
    deployments: document.getElementById('workspace-panel-deployments'),
    activity: document.getElementById('workspace-panel-activity')
  },
  // Workspace elements
  wsConnectedServers: document.getElementById('wsConnectedServers'),
  wsServerSub: document.getElementById('wsServerSub'),
  wsModelEngine: document.getElementById('wsModelEngine'),
  wsModelSub: document.getElementById('wsModelSub'),
  wsActiveServices: document.getElementById('wsActiveServices'),
  wsServicesSub: document.getElementById('wsServicesSub'),
  wsHealthIndex: document.getElementById('wsHealthIndex'),
  wsHealthSub: document.getElementById('wsHealthSub'),
  workspaceServersContainer: document.getElementById('workspaceServersContainer'),
  workspaceModelsTableBody: document.getElementById('workspaceModelsTableBody'),
  workspaceDeploymentsTableBody: document.getElementById('workspaceDeploymentsTableBody'),
  wsDeploymentsCountBadge: document.getElementById('wsDeploymentsCountBadge'),
  workspaceActivityTableBody: document.getElementById('workspaceActivityTableBody'),
  wsActivityCategoryFilter: document.getElementById('wsActivityCategoryFilter'),
  wsRefreshActivityBtn: document.getElementById('wsRefreshActivityBtn'),
  modelPullInput: document.getElementById('modelPullInput'),
  modelPullBtn: document.getElementById('modelPullBtn'),

  healthScoreValue: document.getElementById('healthScoreValue'),
  healthProgressRing: document.getElementById('healthProgressRing'),
  healthStatusText: document.getElementById('healthStatusText'),
  healthyCount: document.getElementById('healthyCount'),
  warningCount: document.getElementById('warningCount'),
  criticalCount: document.getElementById('criticalCount'),
  cpuUsage: document.getElementById('cpuUsage'),
  cpuCores: document.getElementById('cpuCores'),
  cpuProgressBar: document.getElementById('cpuProgressBar'),
  memoryUsage: document.getElementById('memoryUsage'),
  memoryDetails: document.getElementById('memoryDetails'),
  memProgressBar: document.getElementById('memProgressBar'),
  diskUsage: document.getElementById('diskUsage'),
  diskDetails: document.getElementById('diskDetails'),
  diskProgressBar: document.getElementById('diskProgressBar'),
  networkRate: document.getElementById('networkRate'),
  networkTotals: document.getElementById('networkTotals'),
  systemUptime: document.getElementById('systemUptime'),
  topologySvg: document.getElementById('topologySvg'),
  anomaliesList: document.getElementById('anomaliesList'),
  anomalyCountPill: document.getElementById('anomalyCountPill'),
  navAnomalyBadge: document.getElementById('navAnomalyBadge'),
  topProcessTableBody: document.getElementById('topProcessTableBody'),
  totalProcCount: document.getElementById('totalProcCount'),
  dashboardLogBox: document.getElementById('dashboardLogBox'),
  logLevelFilter: document.getElementById('logLevelFilter'),
  clearLogsBtn: document.getElementById('clearLogsBtn'),
  globalSearchInput: document.getElementById('globalSearchInput'),
  searchResultsDropdown: document.getElementById('searchResultsDropdown'),
  aiAssistantPanel: document.getElementById('aiAssistantPanel'),
  toggleAiPanelBtn: document.getElementById('toggleAiPanelBtn'),
  closeAiPanelBtn: document.getElementById('closeAiPanelBtn'),
  aiChatMessages: document.getElementById('aiChatMessages'),
  aiChatInput: document.getElementById('aiChatInput'),
  sendAiChatBtn: document.getElementById('sendAiChatBtn'),
  promptChips: document.querySelectorAll('.prompt-chip'),
  refreshAllBtn: document.getElementById('refreshAllBtn'),
  refreshIcon: document.getElementById('refreshIcon'),
  nodeModal: document.getElementById('nodeModal'),
  modalNodeTitle: document.getElementById('modalNodeTitle'),
  modalNodeContent: document.getElementById('modalNodeContent'),
  closeNodeModalBtn: document.getElementById('closeNodeModalBtn'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  modalAiDiagnoseBtn: document.getElementById('modalAiDiagnoseBtn'),
  backToDashBtn: document.getElementById('backToDashBtn'),
  resourceViewTitle: document.getElementById('resourceViewTitle'),
  resourceViewSubtitle: document.getElementById('resourceViewSubtitle'),
  resourceFilterInput: document.getElementById('resourceFilterInput'),
  resourceCountDisplay: document.getElementById('resourceCountDisplay'),
  resourceTableHeader: document.getElementById('resourceTableHeader'),
  resourceTableBody: document.getElementById('resourceTableBody')
};

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// -----------------------------------------------------------------------------
// Authentication Flow
// -----------------------------------------------------------------------------
window.handleLoginSubmit = async function(e) {
  if (e) e.preventDefault();
  
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value.trim();
  
  if (!username || !password) return;

  elements.loginSubmitBtn.disabled = true;
  elements.loginErrorMsg.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Authentication failed. Please verify credentials.');
    }

    const data = await res.json();
    sessionStorage.setItem('aws_infra_token', data.token || 'authenticated');
    sessionStorage.setItem('aws_infra_user', JSON.stringify(data.user || { username, role: 'DevOps Admin' }));
    
    unlockApplication(data.user);
  } catch (err) {
    elements.loginErrorText.textContent = err.message;
    elements.loginErrorMsg.style.display = 'flex';
  } finally {
    elements.loginSubmitBtn.disabled = false;
    initLucide();
  }
};

function checkSession() {
  const token = sessionStorage.getItem('aws_infra_token');
  const userJson = sessionStorage.getItem('aws_infra_user');
  
  if (token) {
    const user = userJson ? JSON.parse(userJson) : { username: 'admin', role: 'DevOps Admin' };
    unlockApplication(user);
  } else {
    lockApplication();
  }
}

function unlockApplication(user) {
  state.isAuthenticated = true;
  if (elements.authOverlay) elements.authOverlay.style.display = 'none';
  if (elements.appLayout) elements.appLayout.style.display = 'flex';
  
  if (user) {
    if (elements.userAvatar) elements.userAvatar.textContent = user.username.substring(0, 2).toUpperCase();
    if (elements.userRoleText) elements.userRoleText.textContent = user.role || 'DevOps Admin';
  }

  startDataPolling();
  initLucide();
}

function lockApplication() {
  state.isAuthenticated = false;
  stopDataPolling();
  if (elements.appLayout) elements.appLayout.style.display = 'none';
  if (elements.authOverlay) elements.authOverlay.style.display = 'flex';
  if (elements.loginPassword) elements.loginPassword.value = '';
  initLucide();
}

function startDataPolling() {
  stopDataPolling();
  
  dispatchGlobalRefresh();

  state.pollTimers.push(setInterval(fetchMetrics, 3000));
  state.pollTimers.push(setInterval(fetchAnomalies, 4000));
  state.pollTimers.push(setInterval(fetchLogs, 5000));
  state.pollTimers.push(setInterval(fetchWorkspaceSummary, 6000));
  state.pollTimers.push(setInterval(fetchWorkspaceServers, 10000));
  state.pollTimers.push(setInterval(fetchWorkspaceModels, 12000));
  state.pollTimers.push(setInterval(fetchWorkspaceDeployments, 15000));
  state.pollTimers.push(setInterval(fetchWorkspaceActivity, 15000));
  state.pollTimers.push(setInterval(fetchCloudWatchFleetMetrics, 30000));
}

function stopDataPolling() {
  state.pollTimers.forEach(id => clearInterval(id));
  state.pollTimers = [];
}

// -----------------------------------------------------------------------------
// Global Manual Refresh Handler
// -----------------------------------------------------------------------------
async function dispatchGlobalRefresh() {
  if (!state.isAuthenticated) return;

  if (elements.refreshIcon) {
    elements.refreshIcon.classList.add('spin');
  }

  try {
    await Promise.allSettled([
      fetchMetrics(),
      fetchAnomalies(),
      fetchTopology(),
      fetchLogs(),
      fetchCloudWatchFleetMetrics(),
      fetchIncidents(),
      fetchWorkspaceSummary(),
      fetchWorkspaceServers(),
      fetchWorkspaceModels(),
      fetchWorkspaceDeployments(),
      fetchWorkspaceActivity()
    ]);
  } finally {
    setTimeout(() => {
      if (elements.refreshIcon) {
        elements.refreshIcon.classList.remove('spin');
      }
    }, 600);
  }
}

// -----------------------------------------------------------------------------
// WORKSPACE: Summary, Fleet, Models, Deployments & Activity
// -----------------------------------------------------------------------------
async function fetchWorkspaceSummary() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/workspace/summary');
    if (!res.ok) return;
    const data = await res.json();
    updateWorkspaceSummaryUI(data);
  } catch (err) {
    console.error('Workspace summary fetch error:', err);
  }
}

function updateWorkspaceSummaryUI(data) {
  if (!data) return;

  const servers = data.servers || {};
  const aiModel = data.ai_model || {};
  const services = data.services || {};
  const health = data.health || {};

  if (elements.wsConnectedServers) {
    elements.wsConnectedServers.textContent = `${servers.running ?? servers.total ?? 2} Nodes`;
  }
  if (elements.wsServerSub && servers.subtitle) {
    elements.wsServerSub.textContent = servers.subtitle;
  }

  if (elements.wsModelEngine) {
    elements.wsModelEngine.textContent = aiModel.model_name || 'qwen2.5-coder';
  }
  if (elements.wsModelSub && aiModel.subtitle) {
    elements.wsModelSub.textContent = aiModel.subtitle;
  }

  if (elements.wsActiveServices) {
    elements.wsActiveServices.textContent = `${services.healthy ?? 4} Healthy`;
  }
  if (elements.wsServicesSub && services.subtitle) {
    elements.wsServicesSub.textContent = services.subtitle;
  }

  if (elements.wsHealthIndex) {
    elements.wsHealthIndex.textContent = `${health.score ?? 96} / 100`;
  }
  if (elements.wsHealthSub && health.subtitle) {
    elements.wsHealthSub.textContent = health.subtitle;
  }
}

async function fetchWorkspaceServers() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/workspace/servers');
    if (!res.ok) return;
    const data = await res.json();
    renderWorkspaceServersUI(data.servers || []);
  } catch (err) {
    console.error('Workspace servers fetch error:', err);
  }
}

function renderWorkspaceServersUI(servers) {
  if (!elements.workspaceServersContainer) return;
  elements.workspaceServersContainer.innerHTML = '';

  if (servers.length === 0) {
    elements.workspaceServersContainer.innerHTML = `
      <div class="card glass-card" style="padding: 24px; grid-column: 1 / -1; text-align: center;">
        <p style="color: var(--text-muted); font-size: 0.85rem;">No active servers found in this region.</p>
      </div>`;
    return;
  }

  servers.forEach(s => {
    const card = document.createElement('div');
    card.className = 'card glass-card server-fleet-card';
    card.innerHTML = `
      <div class="server-card-top">
        <div class="server-identity-wrap">
          <div class="server-node-avatar">
            <i data-lucide="${s.is_local_host ? 'hard-drive' : 'server'}"></i>
          </div>
          <div>
            <div class="server-node-name">${s.name}</div>
            <div class="server-node-role">${s.role} • <code>${s.id}</code></div>
          </div>
        </div>
        <span class="health-pill ${s.state === 'running' ? 'healthy' : 'critical'}">
          ● ${s.state.toUpperCase()}
        </span>
      </div>

      <div class="server-metric-row">
        <div class="server-metric-labels">
          <span style="color: var(--text-secondary);">CPU Utilization</span>
          <strong>${s.cpu_percent}% (${s.cpu_cores} vCPU)</strong>
        </div>
        <div class="mini-progress-bar">
          <div class="progress-bar-inner bg-blue" style="width: ${Math.min(s.cpu_percent, 100)}%;"></div>
        </div>
      </div>

      <div class="server-metric-row">
        <div class="server-metric-labels">
          <span style="color: var(--text-secondary);">Memory Allocation</span>
          <strong>${s.memory_percent}% (${s.memory_used_gb} / ${s.memory_total_gb} GB)</strong>
        </div>
        <div class="mini-progress-bar">
          <div class="progress-bar-inner bg-purple" style="width: ${Math.min(s.memory_percent, 100)}%;"></div>
        </div>
      </div>

      <div class="server-info-matrix">
        <div class="server-info-item">
          <span class="server-info-title">Type & Zone</span>
          <span class="server-info-val">${s.type} • ${s.az}</span>
        </div>
        <div class="server-info-item">
          <span class="server-info-title">Uptime</span>
          <span class="server-info-val">${s.uptime}</span>
        </div>
        <div class="server-info-item">
          <span class="server-info-title">Private IPv4</span>
          <span class="server-info-val">${s.private_ip}</span>
        </div>
        <div class="server-info-item">
          <span class="server-info-title">Public IPv4</span>
          <span class="server-info-val">${s.public_ip}</span>
        </div>
      </div>

      <div class="server-actions-row">
        <button class="action-btn" style="padding: 6px 12px; font-size: 0.78rem;" onclick="sendPromptToAi('Audit telemetry for server ${s.name} (${s.id})')">
          <i data-lucide="sparkles" style="width: 14px; height: 14px;"></i>
          <span>Diagnose Node</span>
        </button>
        <span class="badge-status-pill" style="font-size: 0.7rem;">
          ${s.is_local_host ? 'Host Master' : 'Compute Worker'}
        </span>
      </div>
    `;
    elements.workspaceServersContainer.appendChild(card);
  });

  initLucide();
}

async function fetchWorkspaceModels() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/workspace/models');
    if (!res.ok) return;
    const data = await res.json();
    renderWorkspaceModelsUI(data.models || []);
  } catch (err) {
    console.error('Workspace models fetch error:', err);
  }
}

function renderWorkspaceModelsUI(models) {
  if (!elements.workspaceModelsTableBody) return;
  elements.workspaceModelsTableBody.innerHTML = '';

  if (models.length === 0) {
    elements.workspaceModelsTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No models found in repository.</td></tr>';
    return;
  }

  models.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong><code>${m.name}</code></strong></td>
      <td><span class="badge-status-pill">${m.parameter_size}</span></td>
      <td><code>${m.quantization_level}</code></td>
      <td>${m.size_mb} MB</td>
      <td>
        <span class="model-status-badge ${m.is_active ? 'in-memory' : 'idle'}">
          ● ${m.status}
        </span>
      </td>
      <td><strong style="color:var(--accent-cyan);">${m.ram_allocation_mb} MB</strong></td>
      <td><span style="font-size:0.75rem; color:var(--text-muted);">${m.server}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          ${
            m.is_active
              ? `<button class="action-btn" style="padding:4px 10px; font-size:0.75rem; border-color:var(--accent-amber); color:var(--accent-amber);" onclick="triggerModelAction('${m.name}', 'unload')">
                  <i data-lucide="power" style="width:12px; height:12px;"></i> Unload
                 </button>`
              : `<button class="action-btn" style="padding:4px 10px; font-size:0.75rem; border-color:var(--accent-emerald); color:var(--accent-emerald);" onclick="triggerModelAction('${m.name}', 'load')">
                  <i data-lucide="zap" style="width:12px; height:12px;"></i> Pin RAM
                 </button>`
          }
          <button class="action-btn" style="padding:4px 8px; font-size:0.75rem;" onclick="sendPromptToAi('Benchmark latency and token throughput for model: ${m.name}')">
            <i data-lucide="sparkles" style="width:12px; height:12px;"></i>
          </button>
        </div>
      </td>
    `;
    elements.workspaceModelsTableBody.appendChild(tr);
  });

  initLucide();
}

window.triggerModelAction = async function(modelName, actionType) {
  try {
    const res = await fetch('/api/workspace/models/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, action: actionType })
    });
    const data = await res.json();
    fetchWorkspaceModels();
    fetchWorkspaceSummary();
    fetchLogs();
    fetchWorkspaceActivity();
  } catch (err) {
    console.error(`Model action ${actionType} failed:`, err);
  }
};

async function fetchWorkspaceDeployments() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/workspace/deployments');
    if (!res.ok) return;
    const data = await res.json();
    renderWorkspaceDeploymentsUI(data.deployments || []);
  } catch (err) {
    console.error('Workspace deployments fetch error:', err);
  }
}

function renderWorkspaceDeploymentsUI(deployments) {
  if (!elements.workspaceDeploymentsTableBody) return;
  elements.workspaceDeploymentsTableBody.innerHTML = '';

  if (elements.wsDeploymentsCountBadge) {
    elements.wsDeploymentsCountBadge.textContent = `${deployments.length} Services Live`;
  }

  if (deployments.length === 0) {
    elements.workspaceDeploymentsTableBody.innerHTML = '<tr><td colspan="8" class="text-center">No active service deployments found.</td></tr>';
    return;
  }

  deployments.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex; flex-direction:column;">
          <strong>${d.name}</strong>
          <code style="font-size:0.72rem; color:var(--text-muted);">${d.service}</code>
        </div>
      </td>
      <td><code>:${d.port}</code></td>
      <td><span style="font-size:0.78rem; color:var(--text-secondary);">${d.runtime}</span></td>
      <td><span class="badge-status-pill">${d.commit}</span></td>
      <td>
        <span class="health-pill ${d.status === 'running' ? 'healthy' : 'critical'}">
          ● ${d.status.toUpperCase()}
        </span>
      </td>
      <td>${d.uptime}</td>
      <td><span style="font-size:0.75rem; color:var(--text-muted);">${d.target_host}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="action-btn" style="padding:4px 10px; font-size:0.75rem; border-color:var(--accent-cyan); color:var(--accent-cyan);" onclick="triggerDeploymentAction('${d.service}', 'restart', this)">
            <i data-lucide="rotate-cw" style="width:12px; height:12px;"></i> Restart
          </button>
          <button class="action-btn" style="padding:4px 8px; font-size:0.75rem;" onclick="sendPromptToAi('Inspect service logs and deployment state for: ${d.name} (${d.service})')">
            <i data-lucide="sparkles" style="width:12px; height:12px;"></i>
          </button>
        </div>
      </td>
    `;
    elements.workspaceDeploymentsTableBody.appendChild(tr);
  });

  initLucide();
}

window.triggerDeploymentAction = async function(serviceName, actionType, btnElement) {
  let originalHtml = '';
  if (btnElement) {
    btnElement.disabled = true;
    originalHtml = btnElement.innerHTML;
    btnElement.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:12px; height:12px;"></i> Restarting...`;
    initLucide();
  }

  try {
    await fetch('/api/workspace/deployments/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: serviceName, action: actionType })
    });
    await fetchLogs();
    await fetchWorkspaceDeployments();
    await fetchWorkspaceSummary();
    await fetchWorkspaceActivity();
  } catch (err) {
    console.error(`Deployment action ${actionType} failed:`, err);
  } finally {
    if (btnElement) {
      setTimeout(() => {
        btnElement.disabled = false;
        btnElement.innerHTML = originalHtml;
        initLucide();
      }, 700);
    }
  }
};

// -----------------------------------------------------------------------------
// WORKSPACE PHASE 6: Unified Activity Ledger Handlers
// -----------------------------------------------------------------------------
async function fetchWorkspaceActivity() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/workspace/activity?limit=40');
    if (!res.ok) return;
    const data = await res.json();
    state.activityList = data.activity || [];
    renderWorkspaceActivityUI();
  } catch (err) {
    console.error('Workspace activity fetch error:', err);
  }
}

function renderWorkspaceActivityUI() {
  if (!elements.workspaceActivityTableBody) return;
  elements.workspaceActivityTableBody.innerHTML = '';

  const filter = elements.wsActivityCategoryFilter ? elements.wsActivityCategoryFilter.value : 'ALL';
  const filtered = filter === 'ALL' ? state.activityList : state.activityList.filter(a => a.category === filter);

  if (filtered.length === 0) {
    elements.workspaceActivityTableBody.innerHTML = '<tr><td colspan="5" class="text-center">No recorded activity for this filter.</td></tr>';
    return;
  }

  filtered.forEach(ev => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-muted);">${ev.timestamp}</td>
      <td><span class="badge-status-pill">${ev.category}</span></td>
      <td><strong style="color:var(--accent-purple);">${ev.source}</strong></td>
      <td>
        <span class="log-lvl ${ev.severity}" style="font-weight:700; font-size:0.74rem;">[${ev.severity}]</span>
      </td>
      <td style="color:var(--text-secondary); word-break:break-word;">${ev.message}</td>
    `;
    elements.workspaceActivityTableBody.appendChild(tr);
  });
}

// -----------------------------------------------------------------------------
// Live Log Stream
// -----------------------------------------------------------------------------
async function fetchLogs() {
  if (!state.isAuthenticated) return;
  try {
    const filter = elements.logLevelFilter ? elements.logLevelFilter.value : 'ALL';
    const res = await fetch(`/api/logs?level=${filter}`);
    if (!res.ok) return;
    const data = await res.json();
    state.logs = data.logs || [];
    renderLogs();
  } catch (err) {
    console.error('Logs fetch error:', err);
  }
}

function renderLogs() {
  const filter = elements.logLevelFilter ? elements.logLevelFilter.value : 'ALL';
  if (!elements.dashboardLogBox) return;
  elements.dashboardLogBox.innerHTML = '';

  const filtered = filter === 'ALL' ? state.logs : state.logs.filter(l => l.level === filter);

  filtered.forEach(log => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="log-ts">${log.timestamp}</span>
      <span class="log-lvl ${log.level}">[${log.level}]</span>
      <span class="log-src">${log.source}:</span>
      <span class="log-msg">${log.message}</span>
    `;
    elements.dashboardLogBox.appendChild(row);
  });
  
  elements.dashboardLogBox.scrollTop = 0;
}

// -----------------------------------------------------------------------------
// AWS Resource Catalog Tables
// -----------------------------------------------------------------------------
async function renderResourceTable(type) {
  switchView(type);
  elements.resourceViewTitle.textContent = `${type.toUpperCase()} Resources`;
  elements.resourceViewSubtitle.textContent = `Managing live AWS cloud inventory catalog for ${type.toUpperCase()}`;

  elements.resourceTableHeader.innerHTML = `
    <tr>
      <th>Resource ID</th>
      <th>Name / Tag</th>
      <th>Status</th>
      <th>Attributes</th>
      <th>Action</th>
    </tr>
  `;
  elements.resourceTableBody.innerHTML = '<tr><td colspan="5">Loading cloud inventory...</td></tr>';

  try {
    const res = await fetch(`/resources/${type}`);
    const data = await res.json();
    const items = data.items || [];
    elements.resourceCountDisplay.textContent = `Showing ${items.length} items (${data.source || 'inventory'})`;
    elements.resourceTableBody.innerHTML = '';

    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${item.id || item.name}</code></td>
        <td><strong>${item.name || item.id}</strong></td>
        <td><span class="health-pill healthy">${item.status || 'Active'}</span></td>
        <td>${JSON.stringify(item.details || {})}</td>
        <td>
          <button class="action-btn" style="padding:4px 8px;font-size:0.75rem;" onclick="sendPromptToAi('Audit resource ${item.id || item.name}')">
            Audit
          </button>
        </td>
      `;
      elements.resourceTableBody.appendChild(tr);
    });
  } catch (err) {
    elements.resourceTableBody.innerHTML = '<tr><td colspan="5">Resource details synchronized via live inventory.</td></tr>';
  }
}

// -----------------------------------------------------------------------------
// AI SRE Assistant with Action Runbook Detection (Phase 6)
// -----------------------------------------------------------------------------
async function sendAiMessage() {
  const text = elements.aiChatInput.value.trim();
  if (!text) return;

  appendChatMessage('user', text);
  elements.aiChatInput.value = '';
  elements.aiChatInput.disabled = true;
  elements.sendAiChatBtn.disabled = true;

  const loadingId = appendLoadingMessage();

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: state.chatHistory,
        include_system_context: true
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: Server returned an invalid response.`);
    }

    const data = await res.json();
    removeMessageById(loadingId);

    const replyContent = data.reply || 'No response returned from the assistant.';
    
    // Check if user prompt requests an infrastructure action to append a runbook approval card
    let runbookActionHtml = '';
    const lowerP = text.toLowerCase();
    if (lowerP.includes('restart nginx')) {
      runbookActionHtml = `
        <div class="ai-action-runbook-card">
          <div class="ai-runbook-header">
            <span>⚡ SRE RUNBOOK ACTION RECOMMENDED</span>
            <span>nginx.service</span>
          </div>
          <p style="font-size:0.78rem; color:var(--text-secondary); margin:0;">Target: Ingress reverse proxy port :80 on host node.</p>
          <button class="ai-runbook-btn" onclick="triggerDeploymentAction('nginx', 'restart'); this.disabled=true; this.textContent='✓ Executed';">
            Approve & Execute Restart
          </button>
        </div>`;
    } else if (lowerP.includes('restart api') || lowerP.includes('restart fastapi')) {
      runbookActionHtml = `
        <div class="ai-action-runbook-card">
          <div class="ai-runbook-header">
            <span>⚡ SRE RUNBOOK ACTION RECOMMENDED</span>
            <span>aws-infra-api</span>
          </div>
          <p style="font-size:0.78rem; color:var(--text-secondary); margin:0;">Target: Core FastAPI AI Engine port :8000 on host node.</p>
          <button class="ai-runbook-btn" onclick="triggerDeploymentAction('aws-infra-api', 'restart'); this.disabled=true; this.textContent='✓ Executed';">
            Approve & Execute Restart
          </button>
        </div>`;
    }

    appendChatMessage('assistant', replyContent + runbookActionHtml);

    state.chatHistory.push({ role: 'user', content: text });
    state.chatHistory.push({ role: 'assistant', content: replyContent });

  } catch (err) {
    console.error('Chat error:', err);
    removeMessageById(loadingId);
    appendChatMessage('assistant', '⚠️ Unable to connect to backend AI model. Please verify your backend server and Ollama instance are running.');
  } finally {
    elements.aiChatInput.disabled = false;
    elements.sendAiChatBtn.disabled = false;
    elements.aiChatInput.focus();
  }
}

function appendChatMessage(role, content) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${role}`;
  msgDiv.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="${role === 'assistant' ? 'bot' : 'user'}"></i>
    </div>
    <div class="message-content">${formatMarkdown(content)}</div>
  `;
  elements.aiChatMessages.appendChild(msgDiv);
  elements.aiChatMessages.scrollTop = elements.aiChatMessages.scrollHeight;
  initLucide();
}

function appendLoadingMessage() {
  const id = 'loading-' + Date.now();
  const msgDiv = document.createElement('div');
  msgDiv.id = id;
  msgDiv.className = 'chat-message assistant';
  msgDiv.innerHTML = `
    <div class="message-avatar"><i data-lucide="bot"></i></div>
    <div class="message-content" style="color:var(--text-muted);">
      <em>Analyzing telemetry and formulating runbook...</em>
    </div>
  `;
  elements.aiChatMessages.appendChild(msgDiv);
  elements.aiChatMessages.scrollTop = elements.aiChatMessages.scrollHeight;
  initLucide();
  return id;
}

function removeMessageById(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

window.sendPromptToAi = function(promptText) {
  if (elements.aiAssistantPanel) {
    elements.aiAssistantPanel.classList.add('open');
  }
  if (elements.aiChatInput) {
    elements.aiChatInput.value = promptText;
  }
  sendAiMessage();
};

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```bash([\s\S]*?)```/g, '<pre style="background:#050811;padding:8px;border-radius:6px;margin:6px 0;font-family:var(--font-mono);font-size:0.8rem;overflow-x:auto;"><code>$1</code></pre>')
    .replace(/```json([\s\S]*?)```/g, '<pre style="background:#050811;padding:8px;border-radius:6px;margin:6px 0;font-family:var(--font-mono);font-size:0.8rem;overflow-x:auto;"><code>$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:#050811;padding:8px;border-radius:6px;margin:6px 0;font-family:var(--font-mono);font-size:0.8rem;overflow-x:auto;"><code>$1</code></pre>')
    .replace(/^#### (.*$)/gim, '<h5 style="color:var(--accent-cyan);margin:8px 0 4px 0;font-size:0.86rem;">$1</h5>')
    .replace(/^### (.*$)/gim, '<h4 style="color:#fff;margin:10px 0 6px 0;font-size:0.95rem;font-weight:700;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="color:#fff;margin:12px 0 6px 0;font-size:1.05rem;font-weight:700;">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\s*-\s+(.*$)/gim, '<li style="margin-left:14px;list-style-type:disc;">$1</li>')
    .replace(/\n/g, '<br>');
}

// -----------------------------------------------------------------------------
// CloudWatch Fleet Metrics
// -----------------------------------------------------------------------------
async function fetchCloudWatchFleetMetrics() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/cloudwatch/ec2-metrics');
    if (!res.ok) return;
    const data = await res.json();

    const cpuEl = document.getElementById('cwLatestCpu');
    const badgeEl = document.getElementById('cwSourceBadge');
    
    if (cpuEl) cpuEl.textContent = `${data.latest_cpu_percent}%`;
    if (badgeEl) {
      badgeEl.textContent = data.source === 'aws-cloudwatch' ? 'AWS Live (1h)' : 'Simulated (1h)';
      badgeEl.style.color = data.source === 'aws-cloudwatch' ? 'var(--accent-emerald)' : 'var(--accent-amber)';
    }

    const canvas = document.getElementById('cwMetricChart');
    if (!canvas || !data.history || data.history.length === 0) return;

    const ctx = canvas.getContext('2d');
    const points = data.history.map(d => d.average);
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const step = width / (points.length - 1 || 1);
    const maxVal = Math.max(...points, 100);

    points.forEach((val, i) => {
      const x = i * step;
      const y = height - (val / maxVal) * (height - 10) - 5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

  } catch (err) {
    console.error('CloudWatch metrics fetch error:', err);
  }
}

// -----------------------------------------------------------------------------
// Incident Audit Timeline
// -----------------------------------------------------------------------------
async function fetchIncidents() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/incidents');
    const data = await res.json();
    const timeline = document.getElementById('incidentTimeline');
    const pill = document.getElementById('incidentCountPill');
    if (!timeline) return;

    if (pill) pill.textContent = `${data.incidents.length} Records`;
    timeline.innerHTML = '';

    if (!data.incidents || data.incidents.length === 0) {
      timeline.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">No incidents logged.</p>';
      return;
    }

    data.incidents.forEach(inc => {
      const el = document.createElement('div');
      el.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.06); padding:8px 0; font-size:0.8rem;';
      el.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <strong style="color:var(--accent-emerald);">⚡ Action: ${inc.action} (${inc.target})</strong>
          <span style="color:var(--text-muted);">${inc.end_time}</span>
        </div>
        <div style="color:var(--text-secondary); margin-top:2px;">${inc.details}</div>
        <div style="color:var(--accent-cyan); font-size:0.75rem; margin-top:2px;">Post-Health Score: ${inc.health_post_action}/100</div>
      `;
      timeline.appendChild(el);
    });
  } catch (err) {
    console.error('Fetch incidents error:', err);
  }
}

// -----------------------------------------------------------------------------
// Navigation & Event Listeners
// -----------------------------------------------------------------------------
function initEventListeners() {
  const refreshBtn = document.getElementById('refreshAllBtn');
  if (refreshBtn) {
    refreshBtn.onclick = function(e) {
      e.preventDefault();
      dispatchGlobalRefresh();
    };
  }

  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('aws_infra_token');
      sessionStorage.removeItem('aws_infra_user');
      lockApplication();
    });
  }

  // Sidebar primary navigation
  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      
      if (view === 'anomalies') {
        switchView('dashboard');
        elements.navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const anomalyCard = document.querySelector('.anomalies-card');
        if (anomalyCard) {
          anomalyCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      if (view === 'logs') {
        switchView('dashboard');
        elements.navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const logCard = document.querySelector('.logs-console-card');
        if (logCard) {
          logCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      elements.navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (['ec2', 'vpc', 's3', 'iam', 'services'].includes(view)) {
        renderResourceTable(view);
      } else {
        switchView(view);
      }
    });
  });

  // Workspace sub-tabs navigation
  if (elements.workspaceTabButtons) {
    elements.workspaceTabButtons.forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const targetTab = tabBtn.getAttribute('data-workspace-tab');
        switchWorkspaceTab(targetTab);
      });
    });
  }

  // Model Hub pull action
  if (elements.modelPullBtn && elements.modelPullInput) {
    elements.modelPullBtn.addEventListener('click', () => {
      const targetModel = elements.modelPullInput.value.trim();
      if (!targetModel) return;
      triggerModelAction(targetModel, 'pull');
      elements.modelPullInput.value = '';
    });
  }

  // Activity Ledger Category Filter & Refresh
  if (elements.wsActivityCategoryFilter) {
    elements.wsActivityCategoryFilter.addEventListener('change', renderWorkspaceActivityUI);
  }
  if (elements.wsRefreshActivityBtn) {
    elements.wsRefreshActivityBtn.addEventListener('click', fetchWorkspaceActivity);
  }

  if (elements.backToDashBtn) {
    elements.backToDashBtn.addEventListener('click', () => {
      elements.navButtons.forEach(b => b.classList.remove('active'));
      const dashBtn = document.querySelector('[data-view="dashboard"]');
      if (dashBtn) dashBtn.classList.add('active');
      switchView('dashboard');
    });
  }

  if (elements.toggleAiPanelBtn) {
    elements.toggleAiPanelBtn.addEventListener('click', () => {
      elements.aiAssistantPanel.classList.toggle('open');
    });
  }

  if (elements.closeAiPanelBtn) {
    elements.closeAiPanelBtn.addEventListener('click', () => {
      elements.aiAssistantPanel.classList.remove('open');
    });
  }

  if (elements.sendAiChatBtn && elements.aiChatInput) {
    elements.sendAiChatBtn.addEventListener('click', sendAiMessage);
    elements.aiChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    });
  }

  elements.promptChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        elements.aiChatInput.value = prompt;
        elements.aiAssistantPanel.classList.add('open');
        sendAiMessage();
      }
    });
  });

  if (elements.closeNodeModalBtn) {
    elements.closeNodeModalBtn.addEventListener('click', () => {
      elements.nodeModal.classList.remove('open');
    });
  }
  if (elements.modalCloseBtn) {
    elements.modalCloseBtn.addEventListener('click', () => {
      elements.nodeModal.classList.remove('open');
    });
  }

  if (elements.logLevelFilter) {
    elements.logLevelFilter.addEventListener('change', renderLogs);
  }
  if (elements.clearLogsBtn) {
    elements.clearLogsBtn.addEventListener('click', () => {
      state.logs = [];
      renderLogs();
    });
  }
}

function switchView(viewName) {
  state.activeView = viewName;
  
  if (elements.views.dashboard) elements.views.dashboard.classList.remove('active');
  if (elements.views.resources) elements.views.resources.classList.remove('active');
  if (elements.views.workspace) elements.views.workspace.classList.remove('active');

  if (viewName === 'dashboard' || viewName === 'topology') {
    elements.views.dashboard.classList.add('active');
  } else if (viewName === 'workspace') {
    elements.views.workspace.classList.add('active');
    fetchWorkspaceSummary();
    if (state.activeWorkspaceTab === 'servers') {
      fetchWorkspaceServers();
    } else if (state.activeWorkspaceTab === 'models') {
      fetchWorkspaceModels();
    } else if (state.activeWorkspaceTab === 'deployments') {
      fetchWorkspaceDeployments();
    } else if (state.activeWorkspaceTab === 'activity') {
      fetchWorkspaceActivity();
    }
    initLucide();
  } else {
    elements.views.resources.classList.add('active');
  }
}

function switchWorkspaceTab(tabName) {
  state.activeWorkspaceTab = tabName;

  elements.workspaceTabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-workspace-tab') === tabName);
  });

  Object.keys(elements.workspacePanels).forEach(key => {
    const panel = elements.workspacePanels[key];
    if (panel) {
      panel.classList.toggle('active', key === tabName);
    }
  });

  if (tabName === 'servers') {
    fetchWorkspaceServers();
  } else if (tabName === 'models') {
    fetchWorkspaceModels();
  } else if (tabName === 'deployments') {
    fetchWorkspaceDeployments();
  } else if (tabName === 'activity') {
    fetchWorkspaceActivity();
  }

  initLucide();
}

// -----------------------------------------------------------------------------
// Live Metrics Engine
// -----------------------------------------------------------------------------
function updateDashboardUI(data) {
  if (!data) return;

  const cpu = data.cpu || {};
  const memory = data.memory || {};
  const disk = data.disk || {};
  const uptime = data.uptime || {};
  const health = data.health || {};
  const network = data.network || {};

  const healthScore = Number(health.score ?? 0);
  if (elements.healthScoreValue) elements.healthScoreValue.textContent = Math.round(healthScore);
  if (elements.healthStatusText) elements.healthStatusText.textContent = health.status || 'Unknown';
  if (elements.healthyCount) elements.healthyCount.textContent = health.healthy_components ?? 0;
  if (elements.warningCount) elements.warningCount.textContent = health.warning_components ?? 0;
  if (elements.criticalCount) elements.criticalCount.textContent = health.critical_components ?? 0;

  if (elements.healthProgressRing) {
    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    elements.healthProgressRing.style.strokeDasharray = `${circumference}`;
    elements.healthProgressRing.style.strokeDashoffset = `${circumference * (1 - healthScore / 100)}`;
    if (health.color) elements.healthProgressRing.style.stroke = health.color;
  }

  const cpuPercent = Number(cpu.percent ?? 0);
  if (elements.cpuUsage) elements.cpuUsage.textContent = `${cpuPercent.toFixed(1)}%`;
  if (elements.cpuCores) elements.cpuCores.textContent = `${cpu.cores ?? 0} Cores`;
  if (elements.cpuProgressBar) elements.cpuProgressBar.style.width = `${Math.min(cpuPercent, 100)}%`;

  const memoryPercent = Number(memory.percent ?? 0);
  if (elements.memoryUsage) elements.memoryUsage.textContent = `${memoryPercent.toFixed(1)}%`;
  if (elements.memoryDetails) elements.memoryDetails.textContent = `${memory.used_gb ?? 0} GB / ${memory.total_gb ?? 0} GB`;
  if (elements.memProgressBar) elements.memProgressBar.style.width = `${Math.min(memoryPercent, 100)}%`;

  const diskPercent = Number(disk.percent ?? 0);
  if (elements.diskUsage) elements.diskUsage.textContent = `${diskPercent.toFixed(1)}%`;
  if (elements.diskDetails) elements.diskDetails.textContent = `${disk.used_gb ?? 0} GB / ${disk.total_gb ?? 0} GB`;
  if (elements.diskProgressBar) elements.diskProgressBar.style.width = `${Math.min(diskPercent, 100)}%`;

  if (elements.networkRate) elements.networkRate.textContent = `${Number(network.kb_sent_sec ?? 0).toFixed(1)} KB/s`;
  if (elements.networkTotals) elements.networkTotals.textContent = `↑ ${Number(network.total_sent_mb ?? 0).toFixed(2)} MB  |  ↓ ${Number(network.total_recv_mb ?? 0).toFixed(2)} MB`;
  if (elements.systemUptime) elements.systemUptime.textContent = uptime.formatted || '0h 0m 0s';

  if (Array.isArray(data.top_processes)) renderProcesses(data.top_processes);
  state.metrics = data;
}

async function fetchMetrics() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/metrics');
    if (!res.ok) return;
    const data = await res.json();
    state.rawMetrics = data;
    updateDashboardUI(data);
  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

// -----------------------------------------------------------------------------
// Anomaly Engine & Auto-Remediation
// -----------------------------------------------------------------------------
async function fetchAnomalies() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/anomalies');
    if (!res.ok) return;
    const data = await res.json();
    renderAnomalies(data.anomalies || []);
  } catch (err) {
    console.error('Error fetching anomalies:', err);
  }
}

window.triggerSimulation = async function() {
  try {
    state.isSimulatedActive = true;
    const res = await fetch('/api/simulate-anomaly', { method: 'POST' });
    const data = await res.json();
    if (data.anomalies) {
      renderAnomalies(data.anomalies);
    }
  } catch (err) {
    console.error("Simulation trigger failed:", err);
  }
};

window.triggerRemediation = async function(anomalyId, actionType, target) {
  try {
    state.isSimulatedActive = false;
    await fetch('/api/remediate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anomaly_id: anomalyId,
        action_type: actionType,
        target: target
      })
    });
    dispatchGlobalRefresh();
  } catch (err) {
    console.error('Remediation error:', err);
  }
};

function renderAnomalies(anomalies) {
  if (!elements.anomaliesList) return;
  
  if (elements.anomalyCountPill) elements.anomalyCountPill.textContent = `${anomalies.length} Detected`;
  if (elements.navAnomalyBadge) elements.navAnomalyBadge.textContent = anomalies.length;

  if (anomalies.length === 0) {
    elements.anomaliesList.innerHTML = `
      <div class="empty-state" style="padding: 20px; text-align: center;">
        <i data-lucide="check-circle" class="empty-icon text-emerald" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
        <p style="color: var(--text-muted); font-size: 0.82rem;">All monitored thresholds are within standard parameters.</p>
      </div>`;
    initLucide();
    return;
  }

  elements.anomaliesList.innerHTML = '';
  anomalies.forEach(a => {
    const item = document.createElement('div');
    item.className = `anomaly-item ${a.severity ? a.severity.toLowerCase() : 'critical'}`;
    
    let actionType = 'purge_cache';
    if (a.id && a.id.includes('cpu')) actionType = 'restart_service';
    if (a.id && a.id.includes('mem')) actionType = 'purge_cache';
    if (a.id && a.id.includes('disk')) actionType = 'purge_cache';
    if (a.id && a.id.includes('ec2')) actionType = 'reboot_ec2';

    item.innerHTML = `
      <div class="anomaly-header">
        <span class="anomaly-title">${a.title}</span>
        <span class="anomaly-time">${a.timestamp}</span>
      </div>
      <div class="anomaly-desc">${a.description}</div>
      <div class="anomaly-action-row" style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px;">
        <span class="anomaly-resource-tag">${a.resource || 'Host'}</span>
        <div style="display: flex; gap: 6px;">
          <button class="ai-diagnose-btn-inline" onclick="sendPromptToAi('${a.ai_prompt || a.title}')">
            <i data-lucide="sparkles" style="width: 13px; height: 13px;"></i> AI Plan
          </button>
          <button class="ai-diagnose-btn-inline" style="border-color: var(--accent-emerald); color: var(--accent-emerald);" 
                  onclick="triggerRemediation('${a.id}', '${actionType}', '${a.resource_id || 'nginx'}')">
            <i data-lucide="zap" style="width: 13px; height: 13px;"></i> Remediate
          </button>
        </div>
      </div>
    `;
    elements.anomaliesList.appendChild(item);
  });
  initLucide();
}

// -----------------------------------------------------------------------------
// Top Processes Table
// -----------------------------------------------------------------------------
function renderProcesses(processes) {
  if (!elements.topProcessTableBody) return;
  elements.topProcessTableBody.innerHTML = '';
  if (elements.totalProcCount) elements.totalProcCount.textContent = `${processes.length} tasks monitored`;

  processes.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${p.pid}</code></td>
      <td><strong>${p.name}</strong></td>
      <td><span class="${p.cpu_percent > 30 ? 'text-rose' : 'text-primary'}">${p.cpu_percent}%</span></td>
      <td>${p.memory_percent}%</td>
      <td><span class="health-pill healthy">${p.status}</span></td>
    `;
    elements.topProcessTableBody.appendChild(tr);
  });
}

// -----------------------------------------------------------------------------
// Infrastructure Topology Map
// -----------------------------------------------------------------------------
async function fetchTopology() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/topology');
    if (!res.ok) return;
    const data = await res.json();
    state.topology = data;
    renderTopology(data);
  } catch (err) {
    console.error('Topology fetch error:', err);
  }
}

function renderTopology(topology) {
  const svg = elements.topologySvg;
  if (!svg || !topology) return;

  const width = svg.clientWidth || 600;
  const height = 320;
  const nodes = topology.nodes || [];
  const links = topology.links || [];

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  let svgHtml = '<g id="topology-graph-root">';

  links.forEach(l => {
    const sourceNode = nodes.find(n => n.id === l.source);
    const targetNode = nodes.find(n => n.id === l.target);
    if (sourceNode && targetNode) {
      svgHtml += `<line x1="${sourceNode.x}" y1="${sourceNode.y}" x2="${targetNode.x}" y2="${targetNode.y}" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="4"/>`;
    }
  });

  nodes.forEach(n => {
    svgHtml += `
      <g class="topology-node" transform="translate(${n.x},${n.y})" onclick="inspectNode('${n.id}')">
        <circle r="20" fill="#0e1526" stroke="#38bdf8" stroke-width="2.5"/>
        <text text-anchor="middle" y="32" fill="#94a3b8" font-size="10" font-weight="600">${n.label}</text>
        <circle r="5" fill="#10b981" cx="12" cy="-12"/>
      </g>
    `;
  });

  svgHtml += '</g>';
  svg.innerHTML = svgHtml;
}

window.inspectNode = function(nodeId) {
  if (!state.topology) return;
  const node = state.topology.nodes.find(n => n.id === nodeId);
  if (!node) return;

  elements.modalNodeTitle.textContent = `${node.label} (${node.id})`;
  elements.modalNodeContent.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div><strong>Status:</strong> <span class="health-pill ${node.status}">${node.status.toUpperCase()}</span></div>
      <div><strong>Type:</strong> <code>${node.type || 'AWS Core Infrastructure'}</code></div>
      <div><strong>Region:</strong> <code>${node.region || 'eu-north-1'}</code></div>
      <div><strong>Details:</strong> ${node.details || 'Operational state normal.'}</div>
    </div>
  `;

  if (elements.modalAiDiagnoseBtn) {
    elements.modalAiDiagnoseBtn.onclick = () => {
      elements.nodeModal.classList.remove('open');
      sendPromptToAi(`Explain and diagnose AWS resource: ${node.label} (${node.id})`);
    };
  }

  elements.nodeModal.classList.add('open');
};

// -----------------------------------------------------------------------------
// Application Initialization
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initLucide();
  checkSession();
});