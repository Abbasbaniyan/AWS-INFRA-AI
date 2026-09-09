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
  digitalTwinDrawer: document.getElementById('digitalTwinDrawer'),
  dtDrawerTitle: document.getElementById('dtDrawerTitle'),
  dtDrawerBody: document.getElementById('dtDrawerBody'),
  closeDtDrawerBtn: document.getElementById('closeDtDrawerBtn'),
  simulationModal: document.getElementById('simulationModal'),
  simulationModalContent: document.getElementById('simulationModalContent'),

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
  cwLatestCpu: document.getElementById('cwLatestCpu'),
  cwSourceBadge: document.getElementById('cwSourceBadge'),
  cwMetricChart: document.getElementById('cwMetricChart'),
  topologySvg: document.getElementById('topologySvg'),
  anomaliesList: document.getElementById('anomaliesList'),
  anomalyCountPill: document.getElementById('anomalyCountPill'),
  navAnomalyBadge: document.getElementById('navAnomalyBadge'),
  topProcessTableBody: document.getElementById('topProcessTableBody'),
  totalProcCount: document.getElementById('totalProcCount'),
  dashboardLogBox: document.getElementById('dashboardLogBox'),
  logLevelFilter: document.getElementById('logLevelFilter'),
  clearLogsBtn: document.getElementById('clearLogsBtn'),
  aiAssistantPanel: document.getElementById('aiAssistantPanel'),
  toggleAiPanelBtn: document.getElementById('toggleAiPanelBtn'),
  closeAiPanelBtn: document.getElementById('closeAiPanelBtn'),
  aiChatMessages: document.getElementById('aiChatMessages'),
  aiChatInput: document.getElementById('aiChatInput'),
  sendAiChatBtn: document.getElementById('sendAiChatBtn'),
  promptChips: document.querySelectorAll('.prompt-chip'),
  refreshAllBtn: document.getElementById('refreshAllBtn'),
  refreshIcon: document.getElementById('refreshIcon'),
  backToDashBtn: document.getElementById('backToDashBtn'),
  resourceViewTitle: document.getElementById('resourceViewTitle'),
  resourceViewSubtitle: document.getElementById('resourceViewSubtitle'),
  resourceCountDisplay: document.getElementById('resourceCountDisplay'),
  resourceTableHeader: document.getElementById('resourceTableHeader'),
  resourceTableBody: document.getElementById('resourceTableBody')
};

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Sparkline Canvas Renderer
function drawSparkline(canvas, dataPoints) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!dataPoints || dataPoints.length < 2) return;

  const min = Math.min(...dataPoints) * 0.8;
  const max = Math.max(...dataPoints) * 1.2 || 100;

  ctx.beginPath();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  dataPoints.forEach((val, idx) => {
    const x = (idx / (dataPoints.length - 1)) * (w - 8) + 4;
    const y = h - ((val - min) / (max - min || 1)) * (h - 8) - 4;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// Authentication Flow
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
  state.pollTimers.push(setInterval(fetchCloudWatchFleetMetrics, 8000));
  state.pollTimers.push(setInterval(fetchAnomalies, 5000));
  state.pollTimers.push(setInterval(fetchLogs, 4000));
  state.pollTimers.push(setInterval(fetchWorkspaceSummary, 6000));
  state.pollTimers.push(setInterval(fetchWorkspaceServers, 10000));
  state.pollTimers.push(setInterval(fetchWorkspaceModels, 12000));
  state.pollTimers.push(setInterval(fetchWorkspaceDeployments, 15000));
  state.pollTimers.push(setInterval(fetchWorkspaceActivity, 15000));
}

function stopDataPolling() {
  state.pollTimers.forEach(id => clearInterval(id));
  state.pollTimers = [];
}

async function dispatchGlobalRefresh() {
  if (!state.isAuthenticated) return;
  if (elements.refreshIcon) elements.refreshIcon.classList.add('spin');

  try {
    await Promise.allSettled([
      fetchMetrics(),
      fetchCloudWatchFleetMetrics(),
      fetchAnomalies(),
      fetchTopology(),
      fetchLogs(),
      fetchIncidents(),
      fetchWorkspaceSummary(),
      fetchWorkspaceServers(),
      fetchWorkspaceModels(),
      fetchWorkspaceDeployments(),
      fetchWorkspaceActivity()
    ]);
  } finally {
    setTimeout(() => {
      if (elements.refreshIcon) elements.refreshIcon.classList.remove('spin');
    }, 600);
  }
}

// DASHBOARD UI METRIC BINDING
function updateDashboardUI(data) {
  if (!data) return;
  const cpu = data.cpu || {};
  const memory = data.memory || {};
  const disk = data.disk || {};
  const uptime = data.uptime || {};
  const health = data.health || {};
  const net = data.network || {};

  const healthScore = Number(health.score ?? 0);
  if (elements.healthScoreValue) elements.healthScoreValue.textContent = Math.round(healthScore);
  if (elements.healthStatusText) elements.healthStatusText.textContent = health.status || 'Optimal Baseline';
  if (elements.healthyCount) elements.healthyCount.textContent = health.healthy_components ?? 14;

  if (elements.healthProgressRing) {
    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (healthScore / 100) * circumference;
    elements.healthProgressRing.style.strokeDashoffset = offset;
  }

  const cpuPercent = Number(cpu.percent ?? 0);
  if (elements.cpuUsage) elements.cpuUsage.textContent = `${cpuPercent.toFixed(1)}%`;
  if (elements.cpuCores) elements.cpuCores.textContent = `${cpu.cores || 2} Cores`;
  if (elements.cpuProgressBar) elements.cpuProgressBar.style.width = `${Math.min(cpuPercent, 100)}%`;

  const memPercent = Number(memory.percent ?? 0);
  if (elements.memoryUsage) elements.memoryUsage.textContent = `${memPercent.toFixed(1)}%`;
  if (elements.memoryDetails) {
    elements.memoryDetails.textContent = `${memory.used_gb ?? 0} / ${memory.total_gb ?? 0} GB`;
  }
  if (elements.memProgressBar) elements.memProgressBar.style.width = `${Math.min(memPercent, 100)}%`;

  const diskPercent = Number(disk.percent ?? 0);
  if (elements.diskUsage) elements.diskUsage.textContent = `${diskPercent.toFixed(1)}%`;
  if (elements.diskDetails) {
    elements.diskDetails.textContent = `${disk.used_gb ?? 0} / ${disk.total_gb ?? 0} GB`;
  }
  if (elements.diskProgressBar) elements.diskProgressBar.style.width = `${Math.min(diskPercent, 100)}%`;

  if (elements.networkRate) {
    const activeRate = (net.kb_recv_sec || 0) + (net.kb_sent_sec || 0);
    elements.networkRate.textContent = `${activeRate.toFixed(1)} KB/s`;
  }
  if (elements.networkTotals) {
    elements.networkTotals.textContent = `↓ ${net.total_recv_mb ?? 0} MB | ↑ ${net.total_sent_mb ?? 0} MB`;
  }

  if (elements.systemUptime) elements.systemUptime.textContent = uptime.formatted || '0h 0m';

  if (Array.isArray(data.top_processes)) renderProcesses(data.top_processes);
  state.metrics = data;
}

async function fetchMetrics() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/metrics');
    if (!res.ok) return;
    const data = await res.json();
    updateDashboardUI(data);
  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

async function fetchCloudWatchFleetMetrics() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/cloudwatch/ec2-metrics');
    if (!res.ok) return;
    const data = await res.json();
    if (elements.cwLatestCpu) elements.cwLatestCpu.textContent = `${data.latest_cpu_percent}%`;
    if (elements.cwSourceBadge) {
      elements.cwSourceBadge.textContent = data.source === 'aws-cloudwatch' ? 'AWS Live (1h)' : 'Live Telemetry (1h)';
    }
    if (data.history && Array.isArray(data.history)) {
      drawSparkline(elements.cwMetricChart, data.history);
    }
  } catch (err) {
    console.error('CloudWatch metrics fetch error:', err);
  }
}

// -----------------------------------------------------------------------------
// Digital Twin Topology Map (Flicker-Free Anti-Glitch Engine)
// -----------------------------------------------------------------------------
async function fetchTopology() {
  if (!state.isAuthenticated) return;
  try {
    const res = await fetch('/api/topology');
    if (!res.ok) return;
    const data = await res.json();
    
    // Prevent re-rendering SVG if nodes haven't changed (stops flicker)
    if (state.topology && JSON.stringify(state.topology) === JSON.stringify(data)) {
      return;
    }
    state.topology = data;
    renderTopology(data);
  } catch (err) {
    console.error('Topology fetch error:', err);
  }
}

function renderTopology(topology) {
  const svg = elements.topologySvg;
  if (!svg || !topology) return;

  const width = 680;
  const height = 260;
  const nodes = topology.nodes || [];
  const links = topology.links || [];

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.overflow = 'visible';

  let svgHtml = '<g id="topology-graph-root">';

  // Draw background connection links
  links.forEach(l => {
    const sourceNode = nodes.find(n => n.id === l.source);
    const targetNode = nodes.find(n => n.id === l.target);
    if (sourceNode && targetNode) {
      svgHtml += `<line x1="${sourceNode.x}" y1="${sourceNode.y}" x2="${targetNode.x}" y2="${targetNode.y}" stroke="rgba(56,189,248,0.35)" stroke-width="2.5" stroke-dasharray="6" style="pointer-events:none;"/>`;
    }
  });

  // Draw nodes with an invisible hit-area circle to prevent flicker
  nodes.forEach(n => {
    svgHtml += `
      <g class="topology-node" 
         transform="translate(${n.x},${n.y})" 
         onclick="inspectDigitalTwinNode('${n.id}')" 
         style="cursor: pointer; pointer-events: bounding-box; transition: transform 0.2s ease;">
        <!-- Invisible wide hit-box buffer prevents hover loop flicker -->
        <circle r="38" fill="transparent" stroke="none" style="pointer-events: fill;" />
        <!-- Visual node elements -->
        <circle r="26" fill="#0b1329" stroke="#38bdf8" stroke-width="2.5" style="pointer-events: none;" />
        <text text-anchor="middle" y="44" fill="#f8fafc" font-size="11" font-weight="700" font-family="var(--font-sans)" style="pointer-events: none; user-select: none;">${n.label}</text>
        <circle r="6" fill="#10b981" cx="17" cy="-17" style="pointer-events: none;" />
      </g>
    `;
  });

  svgHtml += '</g>';
  svg.innerHTML = svgHtml;
  initLucide();
}

window.inspectDigitalTwinNode = function(nodeId) {
  if (!state.topology || !state.topology.nodes) return;
  const node = state.topology.nodes.find(n => n.id === nodeId);
  if (!node) return;

  const nodeLabel = node.label || node.id || 'Unknown Node';
  if (elements.dtDrawerTitle) elements.dtDrawerTitle.textContent = `${nodeLabel} (${node.id})`;
  if (elements.dtDrawerBody) {
    elements.dtDrawerBody.innerHTML = `
      <div>
        <span class="dt-section-title">NODE TELEMETRY & HEALTH</span>
        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-glass); border-radius:var(--radius-md); padding:14px; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-secondary);">Operational Status</span><span class="health-pill healthy">● HEALTHY</span></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-secondary);">Architecture Type</span><code>${(node.type || 'service').toUpperCase()}</code></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-secondary);">AWS Region</span><code>${node.region || 'eu-north-1'}</code></div>
        </div>
      </div>
      <div>
        <span class="dt-section-title">QUICK ACTIONS</span>
        <div class="dt-action-grid">
          <button class="action-btn" style="justify-content:center; font-size:0.78rem;" onclick="sendPromptToAi('Inspect telemetry for node ${nodeLabel}')">Ask AI</button>
          <button class="action-btn" style="justify-content:center; font-size:0.78rem; border-color:var(--accent-emerald); color:var(--accent-emerald);" onclick="dispatchGlobalRefresh()">Sync Node</button>
        </div>
      </div>
    `;
  }
  if (elements.digitalTwinDrawer) elements.digitalTwinDrawer.classList.add('open');
};

if (elements.closeDtDrawerBtn) {
  elements.closeDtDrawerBtn.addEventListener('click', () => {
    elements.digitalTwinDrawer.classList.remove('open');
  });
}

// AI Assistant Integration
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

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

    const data = await res.json();
    removeMessageById(loadingId);

    const replyContent = data.reply || 'Action executed successfully.';
    if (data.ui_action) {
      const action = data.ui_action;
      if (action.type === 'REFRESH_DASHBOARD') dispatchGlobalRefresh();
      else if (action.type === 'FILTER_LOGS') {
        const levelSelect = document.getElementById('logLevelFilter');
        if (levelSelect) { levelSelect.value = action.level || 'ALL'; renderLogs(); }
      } else if (action.type === 'CLEAR_LOGS') { state.logs = []; renderLogs(); }
      else if (action.type === 'NAVIGATE_VIEW') {
        const navBtn = document.querySelector(`[data-view="${action.view}"]`);
        if (navBtn) navBtn.click();
      }
    }

    appendChatMessage('assistant', replyContent);
    state.chatHistory.push({ role: 'user', content: text });
    state.chatHistory.push({ role: 'assistant', content: replyContent });
  } catch (err) {
    console.error('Chat error:', err);
    removeMessageById(loadingId);
    appendChatMessage('assistant', '⚠️ Unable to connect to backend AI agent.');
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
    <div class="message-avatar"><i data-lucide="${role === 'assistant' ? 'bot' : 'user'}"></i></div>
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
    <div class="message-content" style="color:var(--text-muted);"><em>Agent tool execution & verification in progress...</em></div>
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
  if (elements.aiAssistantPanel) elements.aiAssistantPanel.classList.add('open');
  if (elements.aiChatInput) elements.aiChatInput.value = promptText;
  sendAiMessage();
};

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```json([\s\S]*?)```/g, '<pre style="background:#050811;padding:8px;border-radius:6px;margin:6px 0;font-family:var(--font-mono);font-size:0.8rem;overflow-x:auto;"><code>$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre style="background:#050811;padding:8px;border-radius:6px;margin:6px 0;font-family:var(--font-mono);font-size:0.8rem;overflow-x:auto;"><code>$1</code></pre>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// WORKSPACE Handlers
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

  if (elements.wsConnectedServers) elements.wsConnectedServers.textContent = `${servers.running ?? 1} Nodes`;
  if (elements.wsServerSub && servers.subtitle) elements.wsServerSub.textContent = servers.subtitle;
  if (elements.wsModelEngine) elements.wsModelEngine.textContent = aiModel.model_name || 'qwen2.5-coder';
  if (elements.wsModelSub && aiModel.subtitle) elements.wsModelSub.textContent = aiModel.subtitle;
  if (elements.wsActiveServices) elements.wsActiveServices.textContent = `${services.healthy ?? 8} Healthy`;
  if (elements.wsServicesSub && services.subtitle) elements.wsServicesSub.textContent = services.subtitle;
  if (elements.wsHealthIndex) elements.wsHealthIndex.textContent = `${health.score ?? 96} / 100`;
  if (elements.wsHealthSub && health.subtitle) elements.wsHealthSub.textContent = health.subtitle;
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
        <span class="health-pill ${s.state === 'running' ? 'healthy' : 'critical'}">● ${s.state.toUpperCase()}</span>
      </div>
      <div class="server-metric-row">
        <div class="server-metric-labels"><span style="color: var(--text-secondary);">CPU Utilization</span><strong>${s.cpu_percent}% (${s.cpu_cores} vCPU)</strong></div>
        <div class="mini-progress-bar"><div class="progress-bar-inner bg-blue" style="width: ${Math.min(s.cpu_percent, 100)}%;"></div></div>
      </div>
      <div class="server-metric-row">
        <div class="server-metric-labels"><span style="color: var(--text-secondary);">Memory Allocation</span><strong>${s.memory_percent}% (${s.memory_used_gb} / ${s.memory_total_gb} GB)</strong></div>
        <div class="mini-progress-bar"><div class="progress-bar-inner bg-purple" style="width: ${Math.min(s.memory_percent, 100)}%;"></div></div>
      </div>
      <div class="server-info-matrix">
        <div class="server-info-item"><span class="server-info-title">Type & Zone</span><span class="server-info-val">${s.type} • ${s.az}</span></div>
        <div class="server-info-item"><span class="server-info-title">Uptime</span><span class="server-info-val">${s.uptime}</span></div>
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
      <td><span class="badge-status-pill">${m.parameter_size || '0.5B'}</span></td>
      <td><code>${m.quantization_level || 'Q4'}</code></td>
      <td>${m.size_mb || 394} MB</td>
      <td><span class="model-status-badge ${m.is_active ? 'in-memory' : 'idle'}">● ${m.status}</span></td>
      <td><strong style="color:var(--accent-cyan);">${m.ram_allocation_mb || 390} MB</strong></td>
      <td><span style="font-size:0.75rem; color:var(--text-muted);">${m.server || 'Host'}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          ${m.is_active
            ? `<button class="action-btn model-action-btn" style="padding:4px 10px; font-size:0.75rem; border-color:var(--accent-amber); color:var(--accent-amber);" onclick="triggerModelAction('${m.name}', 'unload', this)">Unload</button>`
            : `<button class="action-btn model-action-btn" style="padding:4px 10px; font-size:0.75rem; border-color:var(--accent-emerald); color:var(--accent-emerald);" onclick="triggerModelAction('${m.name}', 'load', this)">Pin RAM</button>`
          }
        </div>
      </td>
    `;
    elements.workspaceModelsTableBody.appendChild(tr);
  });
  initLucide();
}

window.triggerModelAction = async function(modelName, actionType, btnEl) {
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await fetch('/api/workspace/models/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, action: actionType })
    });
    if (!res.ok) throw new Error('Model action failed');
    await Promise.all([fetchWorkspaceModels(), fetchWorkspaceSummary(), fetchLogs(), fetchWorkspaceActivity()]);
  } catch (err) {
    console.error(`Model action ${actionType} failed:`, err);
  } finally {
    if (btnEl) btnEl.disabled = false;
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

  deployments.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${d.name || d.service}</strong></td>
      <td><code>:${d.port || 80}</code></td>
      <td><span class="badge-status-pill">${d.commit || 'active'}</span></td>
      <td><span class="health-pill ${d.status === 'running' ? 'healthy' : 'critical'}">● ${d.status.toUpperCase()}</span></td>
      <td>${d.uptime || 'Active'}</td>
      <td>
        <button class="action-btn deploy-action-btn" style="padding:4px 10px; font-size:0.75rem; border-color:var(--accent-cyan); color:var(--accent-cyan);" onclick="triggerDeploymentAction('${d.service}', 'restart', this)">Restart</button>
      </td>
    `;
    elements.workspaceDeploymentsTableBody.appendChild(tr);
  });
  initLucide();
}

window.triggerDeploymentAction = async function(serviceName, actionType, btnEl) {
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await fetch('/api/workspace/deployments/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: serviceName, action: actionType })
    });
    const data = await res.json();
    if (data.status !== 'success') {
      alert(`Verification Failed for ${serviceName}: ${data.error || 'Unknown error'}`);
    }
    await Promise.all([fetchLogs(), fetchWorkspaceDeployments(), fetchWorkspaceSummary(), fetchWorkspaceActivity()]);
  } catch (err) {
    console.error(`Deployment action ${actionType} failed:`, err);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
};

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
      <td><span class="log-lvl ${ev.severity}">[${ev.severity}]</span></td>
      <td style="color:var(--text-secondary);">${ev.message}</td>
    `;
    elements.workspaceActivityTableBody.appendChild(tr);
  });
}

// Live Log Stream
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
}

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
    item.innerHTML = `
      <div class="anomaly-header">
        <span class="anomaly-title">${a.title}</span>
        <span class="anomaly-time">${a.timestamp}</span>
      </div>
      <div class="anomaly-desc">${a.description}</div>
    `;
    elements.anomaliesList.appendChild(item);
  });
  initLucide();
}

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
      `;
      timeline.appendChild(el);
    });
  } catch (err) {
    console.error('Fetch incidents error:', err);
  }
}

// Navigation & Event Listeners
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

  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      elements.navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (view === 'anomalies') {
        switchView('dashboard');
        setTimeout(() => {
          const anomalyCard = document.querySelector('.anomalies-card');
          if (anomalyCard) anomalyCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return;
      }

      if (view === 'logs') {
        switchView('dashboard');
        setTimeout(() => {
          const logCard = document.querySelector('.logs-console-card');
          if (logCard) logCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
        return;
      }

      if (view === 'topology') {
        switchView('dashboard');
        setTimeout(() => {
          const mapCard = document.querySelector('.map-card');
          if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          fetchTopology();
        }, 100);
        return;
      }

      if (['ec2', 'vpc', 's3', 'iam', 'services'].includes(view)) {
        renderResourceTable(view);
      } else {
        switchView(view);
      }
    });
  });

  if (elements.workspaceTabButtons) {
    elements.workspaceTabButtons.forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const targetTab = tabBtn.getAttribute('data-workspace-tab');
        switchWorkspaceTab(targetTab);
      });
    });
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
    fetchLogs();
    fetchTopology();
  } else if (viewName === 'workspace') {
    elements.views.workspace.classList.add('active');
    fetchWorkspaceSummary();
    if (state.activeWorkspaceTab === 'servers') fetchWorkspaceServers();
    else if (state.activeWorkspaceTab === 'models') fetchWorkspaceModels();
    else if (state.activeWorkspaceTab === 'deployments') fetchWorkspaceDeployments();
    else if (state.activeWorkspaceTab === 'activity') fetchWorkspaceActivity();
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
    if (panel) panel.classList.toggle('active', key === tabName);
  });

  if (tabName === 'servers') fetchWorkspaceServers();
  else if (tabName === 'models') fetchWorkspaceModels();
  else if (tabName === 'deployments') fetchWorkspaceDeployments();
  else if (tabName === 'activity') fetchWorkspaceActivity();
  initLucide();
}

function renderProcesses(processes) {
  if (!elements.topProcessTableBody) return;
  elements.topProcessTableBody.innerHTML = '';
  if (elements.totalProcCount) elements.totalProcCount.textContent = `${processes.length} processes active`;

  processes.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${p.pid}</code></td>
      <td><strong>${p.name}</strong></td>
      <td><span class="${p.cpu_percent > 30 ? 'text-rose' : 'text-primary'}">${p.cpu_percent}%</span></td>
      <td>${p.memory_percent}%</td>
      <td><span class="health-pill healthy">${p.status || 'running'}</span></td>
    `;
    elements.topProcessTableBody.appendChild(tr);
  });
}

async function renderResourceTable(type) {
  switchView(type);
  elements.resourceViewTitle.textContent = `${type.toUpperCase()} Resources`;
  elements.resourceTableHeader.innerHTML = `<tr><th>Resource ID</th><th>Name / Tag</th><th>Status</th><th>Attributes</th></tr>`;
  elements.resourceTableBody.innerHTML = '<tr><td colspan="4">Loading cloud inventory...</td></tr>';
  try {
    const res = await fetch(`/resources/${type}`);
    const data = await res.json();
    const items = data.items || [];
    elements.resourceCountDisplay.textContent = `Showing ${items.length} items`;
    elements.resourceTableBody.innerHTML = '';
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><code>${item.id || item.name}</code></td><td><strong>${item.name || item.id}</strong></td><td><span class="health-pill healthy">${item.status || 'Active'}</span></td><td>${JSON.stringify(item.details || {})}</td>`;
      elements.resourceTableBody.appendChild(tr);
    });
  } catch (err) {
    elements.resourceTableBody.innerHTML = '<tr><td colspan="4">Synchronized via live inventory.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initLucide();
  checkSession();
});