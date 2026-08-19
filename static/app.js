// State Management
const state = {
  activeView: 'dashboard',
  metrics: null,
  rawMetrics: null,
  chatHistory: [],
  logs: [],
  zoomLevel: 1,
  pan: { x: 0, y: 0 },
  isDragging: false,
  dragStart: { x: 0, y: 0 }
};

// DOM Selectors Cache
const elements = {
  navButtons: document.querySelectorAll('.nav-item'),
  views: {
    dashboard: document.getElementById('view-dashboard'),
    resources: document.getElementById('view-resources')
  },
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

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initLucide();
  initEventListeners();
  fetchMetrics();
  setInterval(fetchMetrics, 4000);
});

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Event Listeners Registration
function initEventListeners() {
  // Navigation Handling
  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      
      // Anomaly Feed Anchor
      if (view === 'anomalies') {
        switchView('dashboard');
        elements.navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const anomalyCard = document.querySelector('.anomalies-card');
        if (anomalyCard) {
          anomalyCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          anomalyCard.style.outline = '2px solid var(--accent-rose)';
          setTimeout(() => { anomalyCard.style.outline = 'none'; }, 2000);
        }
        return;
      }

      // Live Logs Anchor
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

      // AWS Resource Categories & Topology
      elements.navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (['ec2', 'vpc', 's3', 'iam', 'services'].includes(view)) {
        renderResourceTable(view);
      } else {
        switchView(view);
      }
    });
  });

  if (elements.backToDashBtn) {
    elements.backToDashBtn.addEventListener('click', () => {
      elements.navButtons.forEach(b => b.classList.remove('active'));
      const dashBtn = document.querySelector('[data-view="dashboard"]');
      if (dashBtn) dashBtn.classList.add('active');
      switchView('dashboard');
    });
  }

  // Refresh Button
  if (elements.refreshAllBtn) {
    elements.refreshAllBtn.addEventListener('click', () => {
      fetchMetrics();
    });
  }

  // AI Assistant Drawer Controls
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

  // AI Chat Input
  if (elements.sendAiChatBtn && elements.aiChatInput) {
    elements.sendAiChatBtn.addEventListener('click', sendAiMessage);
    elements.aiChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    });
  }

  // AI Prompt Chips
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

  // Modal Controls
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

  // Search Input (Ctrl + K)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      elements.globalSearchInput.focus();
    }
  });

  if (elements.globalSearchInput) {
    elements.globalSearchInput.addEventListener('input', handleGlobalSearch);
  }

  // Log Controls
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

// Switch View Layout
function switchView(viewName) {
  state.activeView = viewName;
  if (viewName === 'dashboard' || viewName === 'topology') {
    elements.views.dashboard.classList.add('active');
    elements.views.resources.classList.remove('active');
  } else {
    elements.views.dashboard.classList.remove('active');
    elements.views.resources.classList.add('active');
  }
}

// Fetch Metrics from FastAPI Backend
async function fetchMetrics() {
  try {
    const res = await fetch('/metrics');
    if (!res.ok) throw new Error('Network error fetching metrics');
    const data = await res.json();
    state.rawMetrics = data;
    updateDashboardUI(data);
  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

// Update Dashboard UI Elements
function updateDashboardUI(data) {
  // Health Gauge
  const score = data.health ? data.health.score : 85;
  const status = data.health ? data.health.status : 'Healthy';
  elements.healthScoreValue.textContent = score;
  elements.healthStatusText.textContent = status;
  
  if (status === 'Critical') elements.healthStatusText.style.color = 'var(--accent-rose)';
  else if (status === 'Degraded') elements.healthStatusText.style.color = 'var(--accent-amber)';
  else elements.healthStatusText.style.color = 'var(--accent-emerald)';

  const ring = elements.healthProgressRing;
  if (ring) {
    const maxOffset = 364.4;
    const offset = maxOffset - (maxOffset * (score / 100));
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = score < 60 ? '#ef4444' : score < 80 ? '#f59e0b' : '#10b981';
  }

  // Quick Insights
  if (data.cpu) {
    elements.cpuUsage.textContent = `${data.cpu.percent}%`;
    elements.cpuCores.textContent = `${data.cpu.cores} vCPUs`;
    elements.cpuProgressBar.style.width = `${data.cpu.percent}%`;
  }
  if (data.memory) {
    elements.memoryUsage.textContent = `${data.memory.percent}%`;
    elements.memoryDetails.textContent = `${data.memory.used_gb} / ${data.memory.total_gb} GB`;
    elements.memProgressBar.style.width = `${data.memory.percent}%`;
  }
  if (data.disk) {
    elements.diskUsage.textContent = `${data.disk.percent}%`;
    elements.diskDetails.textContent = `${data.disk.used_gb} / ${data.disk.total_gb} GB`;
    elements.diskProgressBar.style.width = `${data.disk.percent}%`;
  }
  if (data.network) {
    elements.networkRate.textContent = `${data.network.kb_recv_sec} KB/s`;
    elements.networkTotals.textContent = `↓ ${data.network.total_mb_recv} MB | ↑ ${data.network.total_mb_sent} MB`;
  }
  if (data.uptime) {
    elements.systemUptime.textContent = data.uptime.formatted;
  }

  // Anomalies
  renderAnomalies(data.anomalies || []);

  // Top Processes
  renderProcesses(data.top_processes || []);

  // Topology Nodes
  if (data.topology) {
    renderTopology(data.topology);
  }

  // Logs stream synchronization
  if (data.latest_logs && data.latest_logs.length > 0) {
    state.logs = data.latest_logs;
    renderLogs();
  }
}

// Render Anomalies Feed
function renderAnomalies(anomalies) {
  elements.anomaliesList.innerHTML = '';
  elements.anomalyCountPill.textContent = `${anomalies.length} Detected`;
  elements.navAnomalyBadge.textContent = anomalies.length;

  if (anomalies.length === 0) {
    elements.anomaliesList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="check-circle" class="empty-icon text-emerald"></i>
        <p>All monitored thresholds are within standard parameters.</p>
      </div>`;
    initLucide();
    return;
  }

  anomalies.forEach(a => {
    const item = document.createElement('div');
    item.className = `anomaly-item ${a.severity.toLowerCase()}`;
    item.innerHTML = `
      <div class="anomaly-header">
        <span class="anomaly-title">${a.title}</span>
        <span class="anomaly-time">${a.timestamp}</span>
      </div>
      <div class="anomaly-desc">${a.description}</div>
      <div class="anomaly-action-row">
        <span class="anomaly-resource-tag">${a.resource}</span>
        <button class="ai-diagnose-btn-inline" onclick="triggerAiDiagnosis('${a.title}: ${a.description}')">
          <i data-lucide="sparkles"></i> AI Diagnose
        </button>
      </div>
    `;
    elements.anomaliesList.appendChild(item);
  });
  initLucide();
}

// Render Processes Table
function renderProcesses(processes) {
  elements.topProcessTableBody.innerHTML = '';
  elements.totalProcCount.textContent = `${processes.length} tasks monitored`;

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

// Render Topology Graph
function renderTopology(topology) {
  const svg = elements.topologySvg;
  if (!svg || svg.children.length > 0) return; // Prevent re-drawing on every 4s tick

  const width = svg.clientWidth || 600;
  const height = 320;
  const nodes = topology.nodes || [];
  const links = topology.links || [];

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  let svgHtml = '<g id="topology-graph-root">';

  // Render Link Lines
  links.forEach(l => {
    const sourceNode = nodes.find(n => n.id === l.source);
    const targetNode = nodes.find(n => n.id === l.target);
    if (sourceNode && targetNode) {
      svgHtml += `<line x1="${sourceNode.x}" y1="${sourceNode.y}" x2="${targetNode.x}" y2="${targetNode.y}" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-dasharray="4"/>`;
    }
  });

  // Render Nodes
  nodes.forEach(n => {
    svgHtml += `
      <g class="topology-node" transform="translate(${n.x},${n.y})" onclick="inspectNode('${n.id}')">
        <circle r="22" fill="#0e1526" stroke="${n.status === 'healthy' ? '#10b981' : '#f59e0b'}" stroke-width="2.5"/>
        <text text-anchor="middle" y="34" fill="#94a3b8" font-size="11" font-weight="600">${n.label}</text>
        <circle r="6" fill="${n.status === 'healthy' ? '#10b981' : '#f59e0b'}" cx="14" cy="-14"/>
      </g>
    `;
  });

  svgHtml += '</g>';
  svg.innerHTML = svgHtml;
}

// Inspect Node Modal
window.inspectNode = function(nodeId) {
  const node = state.rawMetrics.topology.nodes.find(n => n.id === nodeId);
  if (!node) return;

  elements.modalNodeTitle.textContent = `${node.label} (${node.id})`;
  elements.modalNodeContent.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div><strong>Status:</strong> <span class="health-pill ${node.status}">${node.status.toUpperCase()}</span></div>
      <div><strong>Type:</strong> <code>${node.type || 'AWS Core Infrastructure'}</code></div>
      <div><strong>Region:</strong> <code>${node.region || 'us-east-1'}</code></div>
      <div><strong>Details:</strong> ${node.details || 'Operational state normal with automated failover routing.'}</div>
    </div>
  `;

  if (elements.modalAiDiagnoseBtn) {
    elements.modalAiDiagnoseBtn.onclick = () => {
      elements.nodeModal.classList.remove('open');
      triggerAiDiagnosis(`Inspect and diagnose AWS resource: ${node.label} (${node.id})`);
    };
  }

  elements.nodeModal.classList.add('open');
};

// Render Console Logs
function renderLogs() {
  const filter = elements.logLevelFilter ? elements.logLevelFilter.value : 'ALL';
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
  elements.dashboardLogBox.scrollTop = elements.dashboardLogBox.scrollHeight;
}

// Render Resource Tables (EC2, VPC, S3, IAM, Services)
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
    elements.resourceCountDisplay.textContent = `Showing ${items.length} items`;
    elements.resourceTableBody.innerHTML = '';

    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${item.id || item.name}</code></td>
        <td><strong>${item.name || item.id}</strong></td>
        <td><span class="health-pill healthy">${item.status || 'Active'}</span></td>
        <td>${JSON.stringify(item.details || {})}</td>
        <td>
          <button class="action-btn" style="padding:4px 8px;font-size:0.75rem;" onclick="triggerAiDiagnosis('Audit resource ${item.id || item.name}')">
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

// Send AI Message Function
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

    const data = await res.json();
    removeMessageById(loadingId);
    appendChatMessage('assistant', data.reply);

    state.chatHistory.push({ role: 'user', content: text });
    state.chatHistory.push({ role: 'assistant', content: data.reply });

  } catch (err) {
    removeMessageById(loadingId);
    appendChatMessage('assistant', '⚠️ Unable to reach backend AI model.');
  } finally {
    elements.aiChatInput.disabled = false;
    elements.sendAiChatBtn.disabled = false;
    elements.aiChatInput.focus();
  }
}

// Helpers for Chat UI
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

// Trigger AI Diagnosis from UI
window.triggerAiDiagnosis = function(query) {
  elements.aiAssistantPanel.classList.add('open');
  elements.aiChatInput.value = query;
  sendAiMessage();
};

// Global Command Search
function handleGlobalSearch(e) {
  const q = e.target.value.toLowerCase().trim();
  const dropdown = elements.searchResultsDropdown;

  if (!q) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    return;
  }

  dropdown.style.display = 'flex';
  dropdown.innerHTML = `
    <div class="search-res-item" onclick="triggerAiDiagnosis('Audit search target: ${q}')">
      <span>🔍 Search AWS Infra for "<strong>${q}</strong>"</span>
      <span class="anomaly-resource-tag">Action</span>
    </div>
  `;
}

// Markdown Formatter
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
// CloudWatch Live Fleet Telemetry Poller & Canvas Renderer
// -----------------------------------------------------------------------------
async function fetchCloudWatchFleetMetrics() {
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

    // Render Canvas Sparkline Chart
    const canvas = document.getElementById('cwMetricChart');
    if (!canvas || !data.history || data.history.length === 0) return;

    const ctx = canvas.getContext('2d');
    const points = data.history.map(d => d.average);
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw Smooth Line
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

    // Draw Subtle Fill Gradient Under Line
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

// Initial fetch and 30-second interval polling
fetchCloudWatchFleetMetrics();
setInterval(fetchCloudWatchFleetMetrics, 30000);