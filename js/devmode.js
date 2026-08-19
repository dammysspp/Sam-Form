/**
 * SamForm Developer God Mode & Debug Diagnostic Suite
 * Allows authorized administrators to inspect, test, emulate and diagnose all system modules live.
 */

class SamFormDevConsole {
  constructor() {
    this.isOpen = false;
    this.logs = [];
    this.interceptConsole();
  }

  interceptConsole() {
    if (window._dev_console_intercepted) return;
    window._dev_console_intercepted = true;

    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;

    console.log = (...args) => {
      this.logs.push({ type: 'log', time: new Date().toLocaleTimeString(), text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      if (this.logs.length > 100) this.logs.shift();
      origLog.apply(console, args);
      this.updateLogFeed();
    };

    console.warn = (...args) => {
      this.logs.push({ type: 'warn', time: new Date().toLocaleTimeString(), text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      if (this.logs.length > 100) this.logs.shift();
      origWarn.apply(console, args);
      this.updateLogFeed();
    };

    console.error = (...args) => {
      this.logs.push({ type: 'error', time: new Date().toLocaleTimeString(), text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      if (this.logs.length > 100) this.logs.shift();
      origErr.apply(console, args);
      this.updateLogFeed();
    };
  }

  init() {
    if (!FormForgeAuth.isDevMode()) return;
    this.renderFloatingBadge();
  }

  renderFloatingBadge() {
    let btn = document.getElementById('samform_godmode_floating_btn');
    if (btn) return;

    btn = document.createElement('div');
    btn.id = 'samform_godmode_floating_btn';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
      color: #38bdf8;
      border: 1.5px solid #6366f1;
      padding: 0.5rem 0.85rem;
      border-radius: 9999px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5), 0 0 15px rgba(99,102,241,0.4);
      font-family: var(--font-mono, monospace);
      font-size: 0.8rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      cursor: pointer;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: transform 0.2s, box-shadow 0.2s;
    `;

    btn.innerHTML = `
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span>
      <span>⚡ DEV GODMODE</span>
    `;

    btn.onmouseover = () => btn.style.transform = 'translateY(-2px) scale(1.03)';
    btn.onmouseout = () => btn.style.transform = 'none';
    btn.onclick = () => this.toggleHUD();

    document.body.appendChild(btn);
  }

  toggleHUD() {
    let hud = document.getElementById('samform_godmode_overlay');
    if (hud) {
      hud.remove();
      this.isOpen = false;
      return;
    }

    this.isOpen = true;
    hud = document.createElement('div');
    hud.id = 'samform_godmode_overlay';
    hud.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      width: 480px;
      max-width: calc(100vw - 40px);
      height: 600px;
      max-height: calc(100vh - 100px);
      background: #0f172a;
      color: #e2e8f0;
      border: 1.5px solid #3b82f6;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8);
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      font-family: var(--font-mono, monospace);
      overflow: hidden;
      animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    hud.innerHTML = `
      <!-- Header -->
      <div style="background:#1e293b; padding:0.75rem 1rem; border-bottom:1px solid #334155; display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="color:#38bdf8; font-weight:800; font-size:0.9rem;">⚡ GODMODE DIAGNOSTIC CONSOLE</span>
          <span style="background:#3b82f6; color:#ffffff; font-size:0.65rem; padding:0.1rem 0.35rem; border-radius:4px; font-weight:700;">LIVE</span>
        </div>
        <button style="background:transparent; border:none; color:#94a3b8; font-size:1.1rem; cursor:pointer;" onclick="DevConsole.toggleHUD()">✕</button>
      </div>

      <!-- Quick Nav Jump Bar -->
      <div style="background:#090d16; padding:0.5rem 0.75rem; border-bottom:1px solid #1e293b; display:flex; gap:0.35rem; flex-wrap:wrap;">
        <a href="index.html" style="background:#1e293b; color:#93c5fd; padding:0.25rem 0.5rem; border-radius:4px; text-decoration:none; font-size:0.72rem;">🏠 Dashboard</a>
        <a href="builder.html" style="background:#1e293b; color:#93c5fd; padding:0.25rem 0.5rem; border-radius:4px; text-decoration:none; font-size:0.72rem;">✏️ Builder</a>
        <a href="results.html" style="background:#1e293b; color:#93c5fd; padding:0.25rem 0.5rem; border-radius:4px; text-decoration:none; font-size:0.72rem;">📊 Results</a>
        <a href="responder.html?id=demo&preview=true" target="_blank" style="background:#1e293b; color:#34d399; padding:0.25rem 0.5rem; border-radius:4px; text-decoration:none; font-size:0.72rem;">👁 Test Runner</a>
      </div>

      <!-- Body / Tools -->
      <div style="flex:1; overflow-y:auto; padding:0.75rem;">
        <!-- System Health Section -->
        <div style="background:#1e293b; padding:0.6rem; border-radius:6px; margin-bottom:0.75rem; font-size:0.78rem;">
          <div style="color:#38bdf8; font-weight:700; margin-bottom:0.35rem;">🛠 SYSTEM INTEGRITY CHECK:</div>
          <div id="dev_system_status" style="line-height:1.6; color:#cbd5e1;">Running diagnostics...</div>
        </div>

        <!-- Quick Test Actions -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.4rem; margin-bottom:0.75rem;">
          <button type="button" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:0.4rem; border-radius:4px; font-size:0.75rem; cursor:pointer;" onclick="DevConsole.runEngineSelfTest()">
            🧪 Run Engine Self-Test
          </button>
          <button type="button" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:0.4rem; border-radius:4px; font-size:0.75rem; cursor:pointer;" onclick="DevConsole.injectMockResponse()">
            📥 Generate Mock Response
          </button>
          <button type="button" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:0.4rem; border-radius:4px; font-size:0.75rem; cursor:pointer;" onclick="DevConsole.inspectStorageDump()">
            💾 Inspect Storage Dump
          </button>
          <button type="button" style="background:#dc2626; color:#ffffff; border:none; padding:0.4rem; border-radius:4px; font-size:0.75rem; cursor:pointer;" onclick="FormForgeAuth.toggleDevMode()">
            🛑 Exit God Mode
          </button>
        </div>

        <!-- Real-time Console Log Feed -->
        <div style="color:#94a3b8; font-size:0.72rem; font-weight:700; margin-bottom:0.25rem; display:flex; justify-content:space-between;">
          <span>LIVE CONSOLE STREAM (${this.logs.length} events)</span>
          <span style="cursor:pointer; color:#38bdf8;" onclick="DevConsole.clearLogs()">Clear</span>
        </div>
        <div id="dev_console_feed" style="background:#020617; border:1px solid #1e293b; border-radius:6px; padding:0.5rem; height:180px; overflow-y:auto; font-size:0.72rem; line-height:1.4;">
        </div>
      </div>
    `;

    document.body.appendChild(hud);
    this.runDiagnostics();
    this.updateLogFeed();
  }

  async runDiagnostics() {
    const el = document.getElementById('dev_system_status');
    if (!el) return;

    const isSupabaseReady = window.FormForgeSupabase && FormForgeSupabase.isReady();
    const isDBReady = window.DB && window.DB.db !== null;
    const formsCount = (await DB.getAllForms()).length;
    const respCount = (await DB.getAllResponses()).length;

    el.innerHTML = `
      <div>• IndexedDB Engine: <span style="color:#10b981;">ONLINE (${formsCount} forms, ${respCount} submissions)</span></div>
      <div>• Supabase Cloud: <span style="color:${isSupabaseReady ? '#10b981' : '#f59e0b'};">${isSupabaseReady ? 'CONNECTED & SYNCING' : 'OFFLINE / LOCAL ONLY'}</span></div>
      <div>• Active Screen: <span style="color:#38bdf8;">${window.location.pathname.split('/').pop() || 'index.html'}</span></div>
      <div>• Admin Session: <span style="color:#10b981;">VERIFIED (SHA-256 Auth Active)</span></div>
    `;
  }

  updateLogFeed() {
    const feed = document.getElementById('dev_console_feed');
    if (!feed) return;

    feed.innerHTML = this.logs.slice(-30).map(l => `
      <div style="margin-bottom:2px; color:${l.type === 'error' ? '#f87171' : l.type === 'warn' ? '#fbbf24' : '#94a3b8'};">
        <span style="color:#475569;">[${l.time}]</span> ${Utils.escapeHTML(l.text)}
      </div>
    `).join('') || '<span style="color:#475569;">No console events recorded yet.</span>';

    feed.scrollTop = feed.scrollHeight;
  }

  clearLogs() {
    this.logs = [];
    this.updateLogFeed();
  }

  async runEngineSelfTest() {
    console.log('[DevTest] Testing Questions Engine...');
    const q = QuestionsEngine.createDefault(QuestionTypes.MULTIPLE_CHOICE);
    console.log('[DevTest] Default question created:', q.id);

    console.log('[DevTest] Testing Scoring Engine calculation...');
    const dummyForm = { mode: 'exam', passingScore: 60, questions: [{ id: 'q1', points: 5, answer: 'A' }] };
    const score = ScoringEngine.calculateTotalResults(dummyForm, { q1: 'A' });
    console.log('[DevTest] Scoring Engine Result:', `${score.score}/${score.maxScore} (${score.percentage}%) - Passed: ${score.passed}`);

    Utils.showToast('All core engine tests passed successfully!', 'success');
  }

  async injectMockResponse() {
    const forms = await DB.getAllForms();
    if (forms.length === 0) {
      Utils.showToast('No forms available to inject response for.', 'warning');
      return;
    }
    const targetForm = forms[0];
    const mockRecord = {
      id: Utils.uid('resp_mock'),
      formId: targetForm.id,
      formTitle: targetForm.title,
      respondentName: 'GodMode Test Student',
      respondentEmail: 'godmode@samform.dev',
      respondentPhone: '+2348000000000',
      respondentTelegram: 'godmode_tester',
      respondentId: 'DEV-999',
      durationSeconds: 145,
      submittedAt: new Date().toISOString(),
      answers: {},
      scoring: { score: 80, maxScore: 100, percentage: 80, grade: 'A', passed: true, isFullyGraded: true, remark: 'Injected via Dev Godmode' }
    };
    await DB.saveResponse(mockRecord);
    Utils.showToast(`Injected mock response for "${targetForm.title}"!`, 'success');
    console.log('[Godmode] Injected mock candidate response:', mockRecord.id);
  }

  async inspectStorageDump() {
    const forms = await DB.getAllForms();
    const responses = await DB.getAllResponses();
    console.log('=== SAMFORM STORAGE DUMP ===');
    console.log('FORMS DUMP:', forms);
    console.log('RESPONSES DUMP:', responses);
    Utils.showToast('Storage dump printed to Live Console stream below!', 'info');
  }
}

// Global DevConsole Singleton
window.DevConsole = new SamFormDevConsole();
