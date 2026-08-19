const state = {
  currentView: 'dashboard',
  cachedTopology: null,
  cachedResources: null,
  isAiPanelOpen: false,
  selectedNode: null,
  chatHistory: []
};

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
  backToDashBtn: document.getElementById('backToDashBtn')
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  
  initNavigation();
  initSearch();
  initAiAssistant();
  initTopologyControls();
  
  fetchLiveMetrics();
  fetchAnomalies();
  fetchTopology();
  fetchLogs();
  fetchResources();

  setInterval(() => {
    fetchLiveMetrics();
    fetchAnomalies();
    fetchLogs();
  }, 4000);

  elements.refreshAllBtn.addEventListener('click', () => {
    const icon = document.getElementById('refreshIcon');
    icon.classList.add('spinning');
    Promise.all([fetchLiveMetrics(), fetchAnomalies(), fetchLogs(), fetchTopology()]).then(() => {
      setTimeout(() => icon.classList.remove('spinning'), 600);
    });
  });
});

function initNavigation() {
  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewKey = btn.getAttribute('data-view');
      elements.navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (viewKey === 'dashboard') {
        elements.views.dashboard.classList.add('active');
        elements.views.resources.classList.remove('active');
      } else {
        openResourceView(viewKey);
      }
    });
  });

  elements.backToDashBtn.addEventListener('click', () => {
    elements.navButtons.forEach(b => {
      if (b.getAttribute('data-view') === 'dashboard') b.classList.add('active');
      else b.classList.remove('active');
    });
    elements.views.dashboard.classList.add('active');
    elements.views.resources.classList.remove('active');
  });
}

function openResourceView(viewKey) {
  elements.views.dashboard.classList.remove('active');
  elements.views.resources.classList.add('active');

  const titleElem = document.getElementById('resourceViewTitle');
  const subTitleElem = document.getElementById('resourceViewSubtitle');
  const thead = document.getElementById('resourceTableHeader');
  const tbody = document.getElementById('resourceTableBody');

  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (viewKey === 'ec2') {
    titleElem.innerText = 'EC2 Compute Instances';
    subTitleElem.innerText = 'Monitored elastic compute instances, utilization & private IP topology';
    thead.innerHTML = `<tr><th>Instance ID</th><th>Name</th><th>Type</th><th>Zone</th><th>State</th><th>CPU %</th><th>Health</th><th>Action</th></tr>`;
    renderEc2Table(tbody);
  } else if (viewKey === 'vpc') {
    titleElem.innerText = 'VPC & Networking Infrastructure';
    subTitleElem.innerText = 'Virtual Private Clouds, CIDR blocks, Subnets and Gateway routing';
    thead.innerHTML = `<tr><th>VPC ID</th><th>Name</th><th>CIDR Block</th><th>Subnets</th><th>NAT Gateways</th><th>IGW</th><th>Status</th></tr>`;
    renderVpcTable(tbody);
  } else if (viewKey === 's3') {
    titleElem.innerText = 'S3 Cloud Storage Buckets';
    subTitleElem.innerText = 'Object storage, bucket replication, encryption and storage tiering';
    thead.innerHTML = `<tr><th>Bucket Name</th><th>Region</th><th>Object Count</th><th>Total Size</th><th>Encryption</th><th>Public Access</th></tr>`;
    renderS3Table(tbody);
  } else if (viewKey === 'services') {
    titleElem.innerText = 'System Daemons & Container Services';
    subTitleElem.innerText = 'Manage background processes, Nginx web engine, and Docker status';
    thead.innerHTML = `<tr><th>Service Name</th><th>Current Status</th><th>Health Indicator</th><th>Actions</th></tr>`;
    renderServicesTable(tbody);
  } else {
    titleElem.innerText = `${viewKey.toUpperCase()} Resources`;
    subTitleElem.innerText = 'Active inventory catalog';
    thead.innerHTML = `<tr><th>Resource Key</th><th>Status</th><th>Telemetry</th></tr>`;
    tbody.innerHTML = `<tr><td colspan="3">Resource details synchronized via live inventory.</td></tr>`;
  }
}

async function fetchLiveMetrics() {
  try {
    const res = await fetch('/metrics');
    if (!res.ok) return;
    const data = await res.json();

    const score = data.health.score;
    elements.healthScoreValue.innerText = score;
    elements.healthStatusText.innerText = data.health.status;
    elements.healthStatusText.style.color = data.health.color;

    const maxOffset = 364.4;
    const strokeOffset = maxOffset - (score / 100) * maxOffset;
    elements.healthProgressRing.style.strokeDashoffset = strokeOffset;
    elements.healthProgressRing.style.stroke = data.health.color;

    elements.healthyCount.innerText = data.health.healthy_components;
    elements.warningCount.innerText = data.health.warning_components;
    elements.criticalCount.innerText = data.health.critical_components;

    elements.cpuUsage.innerText = `${data.cpu.percent}%`;
    elements.cpuCores.innerText = `${data.cpu.cores} vCPUs`;
    elements.cpuProgressBar.style.width = `${Math.min(100, data.cpu.percent)}%`;

    elements.memoryUsage.innerText = `${data.memory.percent}%`;
    elements.memoryDetails.innerText = `${data.memory.used_gb} / ${data.memory.total_gb} GB`;
    elements.memProgressBar.style.width = `${Math.min(100, data.memory.percent)}%`;

    elements.diskUsage.innerText = `${data.disk.percent}%`;
    elements.diskDetails.innerText = `${data.disk.used_gb} / ${data.disk.total_gb} GB`;
    elements.diskProgressBar.style.width = `${Math.min(100, data.disk.percent)}%`;

    elements.networkRate.innerText = `${data.network.kb_recv_sec} KB/s`;
    elements.networkTotals.innerText = `↓ ${data.network.total_recv_mb} MB | ↑ ${data.network.total_sent_mb} MB`;
    elements.systemUptime.innerText = data.uptime.formatted;

    elements.totalProcCount.innerText = `${data.active_processes_count} active processes`;
    elements.topProcessTableBody.innerHTML = data.top_processes.map(proc => `
      <tr>
        <td><code>${proc.pid}</code></td>
        <td><strong>${proc.name}</strong></td>
        <td><span class="text-${proc.cpu_percent > 50 ? 'rose' : 'cyan'}">${proc.cpu_percent}%</span></td>
        <td>${proc.memory_percent}%</td>
        <td><span class="health-pill healthy">${proc.status}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.warn('Metrics polling error:', err);
  }
}

async function fetchAnomalies() {
  try {
    const res = await fetch('/api/anomalies');
    if (!res.ok) return;
    const data = await res.json();

    elements.anomalyCountPill.innerText = `${data.count} Active`;
    elements.navAnomalyBadge.innerText = data.count;

    if (!data.anomalies || data.anomalies.length === 0) {
      elements.anomaliesList.innerHTML = `
        <div class="empty-state">
          <i data-lucide="check-circle" class="empty-icon text-emerald"></i>
          <p>All monitored thresholds are within standard parameters.</p>
        </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }

    elements.anomaliesList.innerHTML = data.anomalies.map(anom => `
      <div class="anomaly-item ${anom.severity.toLowerCase()}">
        <div class="anomaly-header">
          <span class="anomaly-title">${anom.title}</span>
          <span class="anomaly-time">${anom.timestamp}</span>
        </div>
        <div class="anomaly-desc">${anom.description}</div>
        <div class="anomaly-action-row">
          <span class="anomaly-resource-tag">${anom.resource} (${anom.resource_id})</span>
          <button class="ai-diagnose-btn-inline" onclick="triggerAiPrompt('${escape(anom.ai_prompt)}')">
            <i data-lucide="sparkles"></i> AI Diagnose
          </button>
        </div>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.warn('Anomaly error:', err);
  }
}

async function fetchTopology() {
  try {
    const res = await fetch('/api/topology');
    if (!res.ok) return;
    state.cachedTopology = await res.json();
    renderTopology(state.cachedTopology);
  } catch (err) {
    console.warn('Topology error:', err);
  }
}

function renderTopology(topo) {
  const svg = elements.topologySvg;
  svg.innerHTML = '';

  const positions = {
    'node-internet': { x: 80, y: 160, color: '#38bdf8', icon: '🌐' },
    'node-cf': { x: 220, y: 160, color: '#6366f1', icon: '⚡' },
    'node-alb': { x: 380, y: 160, color: '#a855f7', icon: '⚖️' },
    'node-ec2-cluster': { x: 550, y: 160, color: '#3b82f6', icon: '🖥️' },
    'node-rds': { x: 720, y: 90, color: '#10b981', icon: '🗄️' },
    'node-s3': { x: 720, y: 230, color: '#f59e0b', icon: '📦' }
  };

  topo.links.forEach(link => {
    const src = positions[link.source];
    const tgt = positions[link.target];
    if (!src || !tgt) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', src.x);
    line.setAttribute('y1', src.y);
    line.setAttribute('x2', tgt.x);
    line.setAttribute('y2', tgt.y);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '4');
    svg.appendChild(line);
  });

  topo.nodes.forEach(node => {
    const pos = positions[node.id] || { x: 100, y: 100, color: '#38bdf8', icon: '⚙️' };

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'topology-node');
    g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
    g.addEventListener('click', () => openNodeModal(node));

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '26');
    circle.setAttribute('fill', '#0e1526');
    circle.setAttribute('stroke', pos.color);
    circle.setAttribute('stroke-width', '2');
    g.appendChild(circle);

    const textIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textIcon.setAttribute('text-anchor', 'middle');
    textIcon.setAttribute('dy', '6');
    textIcon.setAttribute('font-size', '16');
    textIcon.textContent = pos.icon;
    g.appendChild(textIcon);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('y', '42');
    label.setAttribute('fill', '#94a3b8');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '500');
    label.textContent = node.label;
    g.appendChild(label);

    svg.appendChild(g);
  });
}

function initTopologyControls() {
  document.getElementById('mapZoomIn').addEventListener('click', () => {
    elements.topologySvg.style.transform = 'scale(1.15)';
  });
  document.getElementById('mapZoomOut').addEventListener('click', () => {
    elements.topologySvg.style.transform = 'scale(0.9)';
  });
  document.getElementById('mapReset').addEventListener('click', () => {
    elements.topologySvg.style.transform = 'scale(1)';
  });
}

function openNodeModal(node) {
  state.selectedNode = node;
  elements.modalNodeTitle.innerText = `${node.label} (${node.type.toUpperCase()})`;
  elements.modalNodeContent.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div><strong>Region:</strong> ${node.region}</div>
      <div><strong>Status:</strong> <span class="health-pill healthy">${node.status}</span></div>
      <div><strong>Telemetry:</strong> ${node.meta}</div>
      <div><strong>Internal Resource ID:</strong> <code>${node.id}</code></div>
    </div>
  `;
  elements.nodeModal.classList.add('open');
}

elements.closeNodeModalBtn.addEventListener('click', () => elements.nodeModal.classList.remove('open'));
elements.modalCloseBtn.addEventListener('click', () => elements.nodeModal.classList.remove('open'));
elements.modalAiDiagnoseBtn.addEventListener('click', () => {
  elements.nodeModal.classList.remove('open');
  if (state.selectedNode) {
    triggerAiPrompt(`Provide a full health, security, and scaling analysis for ${state.selectedNode.label} (${state.selectedNode.type}) located in ${state.selectedNode.region}.`);
  }
});

async function fetchLogs() {
  try {
    const level = elements.logLevelFilter.value;
    const res = await fetch(`/api/logs?level=${level}`);
    if (!res.ok) return;
    const data = await res.json();

    elements.dashboardLogBox.innerHTML = data.logs.map(l => `
      <div class="log-entry">
        <span class="log-ts">[${l.timestamp.split(' ')[1]}]</span>
        <span class="log-lvl ${l.level}">${l.level}</span>
        <span class="log-src">&lt;${l.source}&gt;</span>
        <span class="log-msg">${l.message}</span>
      </div>
    `).join('');
  } catch (err) {
    console.warn('Logs error:', err);
  }
}

elements.logLevelFilter.addEventListener('change', fetchLogs);
elements.clearLogsBtn.addEventListener('click', () => {
  elements.dashboardLogBox.innerHTML = '<div class="log-entry text-muted">Console output cleared.</div>';
});

async function fetchResources() {
  try {
    const res = await fetch('/api/resources');
    if (!res.ok) return;
    state.cachedResources = await res.json();
  } catch (err) {
    console.warn('Resources fetch error:', err);
  }
}

function renderEc2Table(tbody) {
  if (!state.cachedResources || !state.cachedResources.ec2) return;
  tbody.innerHTML = state.cachedResources.ec2.map(inst => `
    <tr>
      <td><code>${inst.id}</code></td>
      <td><strong>${inst.name}</strong></td>
      <td><span class="health-pill healthy">${inst.type}</span></td>
      <td>${inst.zone}</td>
      <td><span class="health-pill ${inst.state === 'running' ? 'healthy' : 'warning'}">${inst.state}</span></td>
      <td>${inst.cpu}%</td>
      <td>${inst.health}</td>
      <td>
        <button class="ai-diagnose-btn-inline" onclick="triggerAiPrompt('Investigate EC2 instance ${inst.name} (${inst.id}) running on ${inst.type}')">
          <i data-lucide="sparkles"></i> Inspect
        </button>
      </td>
    </tr>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

function renderVpcTable(tbody) {
  if (!state.cachedResources || !state.cachedResources.vpc) return;
  tbody.innerHTML = state.cachedResources.vpc.map(vpc => `
    <tr>
      <td><code>${vpc.id}</code></td>
      <td><strong>${vpc.name}</strong></td>
      <td><code>${vpc.cidr}</code></td>
      <td>${vpc.subnets} Subnets</td>
      <td>${vpc.nat_gateways} Gateways</td>
      <td>${vpc.igw}</td>
      <td><span class="health-pill healthy">${vpc.state}</span></td>
    </tr>
  `).join('');
}

function renderS3Table(tbody) {
  if (!state.cachedResources || !state.cachedResources.s3) return;
  tbody.innerHTML = state.cachedResources.s3.map(b => `
    <tr>
      <td><strong>${b.name}</strong></td>
      <td>${b.region}</td>
      <td>${b.objects}</td>
      <td>${b.size}</td>
      <td><code>${b.encryption}</code></td>
      <td><span class="health-pill healthy">${b.public}</span></td>
    </tr>
  `).join('');
}

async function renderServicesTable(tbody) {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    tbody.innerHTML = Object.entries(data.services).map(([name, status]) => `
      <tr>
        <td><strong>${name}</strong></td>
        <td><span class="health-pill ${status === 'running' ? 'healthy' : 'critical'}">${status.toUpperCase()}</span></td>
        <td>${status === 'running' ? '● Active Daemon' : '✖ Service Inactive'}</td>
        <td>
          <button class="action-btn" onclick="triggerServiceAction('${name}', '${status === 'running' ? 'restart' : 'start'}')">
            ${status === 'running' ? 'Restart' : 'Start'}
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.warn('Services error:', err);
  }
}

async function triggerServiceAction(serviceName, action) {
  try {
    await fetch(`/api/services/${serviceName}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    fetchLogs();
    renderServicesTable(document.getElementById('resourceTableBody'));
  } catch (err) {
    alert('Action failed');
  }
}

function initAiAssistant() {
  elements.toggleAiPanelBtn.addEventListener('click', toggleAiPanel);
  elements.closeAiPanelBtn.addEventListener('click', toggleAiPanel);

  elements.sendAiChatBtn.addEventListener('click', sendAiMessage);
  elements.aiChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAiMessage();
    }
  });

  elements.promptChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      triggerAiPrompt(prompt);
    });
  });
}

function toggleAiPanel() {
  state.isAiPanelOpen = !state.isAiPanelOpen;
  if (state.isAiPanelOpen) {
    elements.aiAssistantPanel.classList.add('open');
    elements.aiChatInput.focus();
  } else {
    elements.aiAssistantPanel.classList.remove('open');
  }
}

window.triggerAiPrompt = function(promptText) {
  const decoded = unescape(promptText);
  if (!state.isAiPanelOpen) toggleAiPanel();
  elements.aiChatInput.value = decoded;
  sendAiMessage();
};

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
    appendChatMessage('assistant', '⚠️ Unable to connect to backend AI server.');
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
  if (window.lucide) lucide.createIcons();
}

function appendLoadingMessage() {
  const id = `loading-${Date.now()}`;
  const msgDiv = document.createElement('div');
  msgDiv.id = id;
  msgDiv.className = 'chat-message assistant';
  msgDiv.innerHTML = `
    <div class="message-avatar"><i data-lucide="bot"></i></div>
    <div class="message-content"><em>Analyzing system telemetry & synthesizing runbook...</em></div>
  `;
  elements.aiChatMessages.appendChild(msgDiv);
  elements.aiChatMessages.scrollTop = elements.aiChatMessages.scrollHeight;
  if (window.lucide) lucide.createIcons();
  return id;
}

function removeMessageById(id) {
  const elem = document.getElementById(id);
  if (elem) elem.remove();
}

function formatMarkdown(text) {
  if (!text) return '';
  let out = text
    // Code blocks
    .replace(/```bash([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/```json([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Headers
    .replace(/^#### (.*$)/gim, '<h5 style="color:var(--accent-cyan);margin:8px 0 4px 0;font-size:0.86rem;">$1</h5>')
    .replace(/^### (.*$)/gim, '<h4 style="color:#fff;margin:10px 0 6px 0;font-size:0.95rem;font-weight:700;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="color:#fff;margin:12px 0 6px 0;font-size:1.05rem;font-weight:700;">$1</h3>')
    // Bolding & Italics
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Bullet points
    .replace(/^\s*-\s+(.*$)/gim, '<li style="margin-left:14px;list-style-type:disc;">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br>');
  return out;
}

function initSearch() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      elements.globalSearchInput.focus();
    }
  });

  elements.globalSearchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (!val) {
      elements.searchResultsDropdown.style.display = 'none';
      return;
    }

    const matches = [];
    if (state.cachedResources) {
      Object.entries(state.cachedResources).forEach(([cat, list]) => {
        list.forEach(item => {
          const str = JSON.stringify(item).toLowerCase();
          if (str.includes(val)) {
            matches.push({ category: cat.toUpperCase(), title: item.name || item.id });
          }
        });
      });
    }

    if (matches.length === 0) {
      elements.searchResultsDropdown.innerHTML = '<div class="search-res-item text-muted">No matching resources found.</div>';
    } else {
      elements.searchResultsDropdown.innerHTML = matches.slice(0, 6).map(m => `
        <div class="search-res-item" onclick="triggerAiPrompt('Show deep telemetry analysis for ${m.title}')">
          <span><strong>[${m.category}]</strong> ${m.title}</span>
          <span class="text-cyan">Ask AI →</span>
        </div>
      `).join('');
    }
    elements.searchResultsDropdown.style.display = 'flex';
  });

  document.addEventListener('click', (e) => {
    if (!elements.globalSearchInput.contains(e.target) && !elements.searchResultsDropdown.contains(e.target)) {
      elements.searchResultsDropdown.style.display = 'none';
    }
  });
}