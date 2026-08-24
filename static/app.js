// State Management
const state = {
  activeView: 'dashboard',
  metrics: null,
  rawMetrics: null,
  chatHistory: [],
  logs: [],
  topology: null,
  isSimulatedActive: false
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

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// -----------------------------------------------------------------------------
// Navigation & Event Listeners
// -----------------------------------------------------------------------------
function initEventListeners() {
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

  if (elements.backToDashBtn) {
    elements.backToDashBtn.addEventListener('click', () => {
      elements.navButtons.forEach(b => b.classList.remove('active'));
      const dashBtn = document.querySelector('[data-view="dashboard"]');
      if (dashBtn) dashBtn.classList.add('active');
      switchView('dashboard');
    });
  }

  if (elements.refreshAllBtn) {
    elements.refreshAllBtn.addEventListener('click', () => {
      fetchMetrics();
      fetchAnomalies();
      fetchTopology();
      fetchLogs();
      fetchCloudWatchFleetMetrics();
      fetchIncidents();
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

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      elements.globalSearchInput.focus();
    }
  });

  if (elements.globalSearchInput) {
    elements.globalSearchInput.addEventListener('input', handleGlobalSearch);
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
  if (viewName === 'dashboard' || viewName === 'topology') {
    elements.views.dashboard.classList.add('active');
    elements.views.resources.classList.remove('active');
  } else {
    elements.views.dashboard.classList.remove('active');
    elements.views.resources.classList.add('active');
  }
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
    fetchIncidents();
    fetchAnomalies();
    fetchLogs();
    fetchMetrics();
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

  // Ensure explicit spaces between viewBox values
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
// Live Log Stream
// -----------------------------------------------------------------------------
async function fetchLogs() {
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
  elements.dashboardLogBox.scrollTop = elements.dashboardLogBox.scrollHeight;
}

// -----------------------------------------------------------------------------
// AWS Resource Catalog Tables (EC2, VPC, S3, IAM, Services)
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
// AI SRE Assistant
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
    <div class="search-res-item" onclick="sendPromptToAi('Audit search target: ${q}')">
      <span>🔍 Search AWS Infra for "<strong>${q}</strong>"</span>
      <span class="anomaly-resource-tag">Action</span>
    </div>
  `;
}

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
// Application Initialization
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initLucide();
  
  fetchMetrics();
  fetchAnomalies();
  fetchTopology();
  fetchLogs();
  fetchCloudWatchFleetMetrics();
  fetchIncidents();

  setInterval(fetchMetrics, 3000);
  setInterval(fetchAnomalies, 4000);
  setInterval(fetchLogs, 5000);
  setInterval(fetchCloudWatchFleetMetrics, 30000);
});