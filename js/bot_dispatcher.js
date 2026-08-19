/**
 * SamForm Dedicated Multi-Channel Automated Bot Dispatcher
 * Supports:
 * 1. WhatsApp Web Gateway (Baileys / WPPConnect microservice - Option B)
 * 2. Official Telegram Bot API (Free unlimited)
 * 3. Email Gateway (Resend / EmailJS / Webhook)
 */

class BotDispatcher {
  constructor() {
    this.CONFIG_KEY = 'samform_bot_config';
    this.initCloudSync();
  }

  async initCloudSync() {
    // Attempt cloud pull on startup
    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      try {
        const cloudConfig = await FormForgeSupabase.fetchSettingsFromCloud(this.CONFIG_KEY);
        if (cloudConfig) {
          localStorage.setItem(this.CONFIG_KEY, JSON.stringify(cloudConfig));
        }
      } catch (e) {}
    }
  }

  getConfig() {
    const defaultCfg = {
      // WhatsApp Gateway (Option B - Self-hosted Baileys / WPPConnect server)
      whatsappGatewayUrl: '', // e.g. https://my-wa-gateway.onrender.com
      whatsappApiKey: '', // Optional secret auth key
      enableAutoWhatsApp: false,

      // Telegram Bot API (100% Free official token)
      telegramBotToken: '', // e.g. 7842918234:AAHkL...
      enableAutoTelegram: false,

      // Telegram User Account Gateway (Personal MTProto userbot)
      enableAutoTelegramUser: false,

      // EmailJS Automation (100% Free 200 emails/month tier)
      emailjsServiceId: '', // e.g. service_xxxxxx
      emailjsTemplateId: '', // e.g. template_xxxxxx
      emailjsPublicKey: '', // e.g. user_xxxxxxxx or public key
      enableAutoEmailJS: false,

      // Auto-dispatch rule: triggers automatically upon final manual grade saving
      autoDispatchOnReviewComplete: true
    };

    try {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      return stored ? { ...defaultCfg, ...JSON.parse(stored) } : defaultCfg;
    } catch (e) {
      return defaultCfg;
    }
  }

  async saveConfig(cfg) {
    localStorage.setItem(this.CONFIG_KEY, JSON.stringify(cfg));

    // Persist to Supabase Cloud Database so settings persist across all devices & browsers
    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      await FormForgeSupabase.syncSettingsToCloud(this.CONFIG_KEY, cfg);
    }

    if (window.Utils) Utils.showToast('Bot & Email automation settings saved to Cloud & Local!', 'success');
  }

  // --- 1. WHATSAPP GATEWAY DISPATCH (Option B) ---
  async sendWhatsAppMessage(phone, text) {
    const cfg = this.getConfig();
    if (!cfg.whatsappGatewayUrl) {
      console.warn('[BotDispatcher] WhatsApp Gateway URL is not configured. Falling back to native WhatsApp protocol link.');
      return { success: false, fallback: true, reason: 'No Gateway URL' };
    }

    // Clean phone number (strip +, spaces, dashes)
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      return { success: false, reason: 'Invalid phone number' };
    }

    try {
      const endpoint = `${cfg.whatsappGatewayUrl.replace(/\/+$/, '')}/send-message`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.whatsappApiKey ? { 'Authorization': `Bearer ${cfg.whatsappApiKey}` } : {})
        },
        body: JSON.stringify({
          phone: cleanPhone,
          message: text
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errData = await response.text();
        return { success: false, reason: errData || response.statusText };
      }
    } catch (err) {
      console.error('[BotDispatcher] WhatsApp Gateway error:', err);
      return { success: false, reason: err.message };
    }
  }

  // --- 2. TELEGRAM DISPATCH (Both Personal MTProto Gateway & Bot API) ---
  async sendTelegramMessage(chatIdOrUser, text) {
    const cfg = this.getConfig();
    const cleanTarget = chatIdOrUser.trim().replace(/^@/, '');
    if (!cleanTarget) {
      return { success: false, reason: 'Invalid Telegram identifier' };
    }

    // 1. Try Gateway Telegram Userbot First (Can message ANY phone number directly without /start!)
    if (cfg.whatsappGatewayUrl && cfg.telegramApiId && cfg.telegramApiHash) {
      try {
        const endpoint = `${cfg.whatsappGatewayUrl.replace(/\/+$/, '')}/send-telegram-user`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneOrUsername: cleanTarget,
            message: text,
            apiId: cfg.telegramApiId,
            apiHash: cfg.telegramApiHash
          })
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.success) return { success: true };
        }
      } catch (e) {
        console.warn('[BotDispatcher] Telegram userbot gateway notice:', e.message);
      }
    }

    // 2. Try Telegram Bot API (@BotFather token)
    if (cfg.telegramBotToken) {
      try {
        let finalChatId = cleanTarget;

        // If target is a username or not purely numeric, resolve chatId from recent bot updates
        if (isNaN(finalChatId)) {
          try {
            const updatesRes = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/getUpdates`);
            const updatesData = await updatesRes.json();
            if (updatesData.ok && updatesData.result && updatesData.result.length > 0) {
              // Find matching username in recent updates or pick latest sender
              const match = updatesData.result.reverse().find(u => {
                const chat = u.message?.chat || u.my_chat_member?.chat;
                const uname = (chat?.username || '').toLowerCase();
                return uname === cleanTarget.toLowerCase();
              });

              if (match) {
                finalChatId = (match.message?.chat || match.my_chat_member?.chat).id;
              } else {
                // If single candidate active, use latest subscriber ID
                const latest = updatesData.result[0];
                const chat = latest.message?.chat || latest.my_chat_member?.chat;
                if (chat?.id) finalChatId = chat.id;
              }
            }
          } catch (resErr) {
            console.warn('[BotDispatcher] Could not query getUpdates:', resErr);
          }
        }

        const endpoint = `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: finalChatId,
            text: text,
            parse_mode: 'HTML'
          })
        });

        const data = await response.json();
        if (data.ok) {
          return { success: true, data };
        } else {
          return { success: false, reason: data.description };
        }
      } catch (err) {
        console.error('[BotDispatcher] Telegram Bot error:', err);
        return { success: false, reason: err.message };
      }
    }

    return { success: false, fallback: true, reason: 'No Telegram Bot Token or Gateway configured' };
  }

  // --- 3. EMAILJS AUTOMATION DISPATCH (100% Free Direct REST API) ---
  async sendEmailJS(toEmail, candidateName, formTitle, scoreResult, durationSeconds) {
    const cfg = this.getConfig();
    if (!cfg.emailjsServiceId || !cfg.emailjsTemplateId || !cfg.emailjsPublicKey) {
      return { success: false, fallback: true, reason: 'EmailJS credentials incomplete' };
    }

    if (!toEmail || !toEmail.includes('@')) {
      return { success: false, reason: 'Invalid recipient email' };
    }

    const s = scoreResult || {};
    const statusText = s.isFullyGraded ? (s.passed ? 'PASSED ✓' : 'FAILED') : 'PENDING REVIEW';

    const templateParams = {
      to_email: toEmail,
      recipient_email: toEmail,
      candidate_name: candidateName,
      assessment_title: formTitle,
      score: `${s.score || 0} / ${s.maxScore || 0}`,
      percentage: `${s.percentage || 0}%`,
      grade: s.grade || 'N/A',
      status: statusText,
      duration: Utils.formatTime(durationSeconds || 0),
      remarks: s.remark || 'N/A',
      message: `Your score for ${formTitle} is ${s.score || 0}/${s.maxScore || 0} (${s.percentage || 0}%). Grade: ${s.grade || 'N/A'}. Status: ${statusText}.`
    };

    // 1. Try Server-Side Gateway Email Proxy (Bypasses all browser extensions and CORS blocks)
    if (cfg.whatsappGatewayUrl) {
      try {
        const proxyEndpoint = `${cfg.whatsappGatewayUrl.replace(/\/+$/, '')}/send-email`;
        const proxyRes = await fetch(proxyEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceId: cfg.emailjsServiceId,
            templateId: cfg.emailjsTemplateId,
            publicKey: cfg.emailjsPublicKey,
            templateParams: templateParams
          })
        });

        if (proxyRes.ok) {
          return { success: true };
        }
      } catch (proxyErr) {
        console.warn('[BotDispatcher] Email gateway proxy notice:', proxyErr);
      }
    }

    // 2. Try official EmailJS SDK if loaded on the page
    if (window.emailjs && typeof window.emailjs.send === 'function') {
      try {
        if (typeof window.emailjs.init === 'function') {
          window.emailjs.init(cfg.emailjsPublicKey);
        }
        const res = await window.emailjs.send(cfg.emailjsServiceId, cfg.emailjsTemplateId, templateParams, cfg.emailjsPublicKey);
        if (res.status === 200 || res.text === 'OK') {
          return { success: true };
        }
      } catch (sdkErr) {
        console.warn('[BotDispatcher] EmailJS SDK notice:', sdkErr);
      }
    }

    // 2. Direct REST API Fallback
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: cfg.emailjsServiceId,
          template_id: cfg.emailjsTemplateId,
          user_id: cfg.emailjsPublicKey,
          template_params: templateParams
        })
      });

      if (response.ok) {
        return { success: true };
      } else {
        const errText = await response.text();
        return { success: false, reason: errText || response.statusText };
      }
    } catch (err) {
      console.error('[BotDispatcher] EmailJS error:', err);
      return { success: false, reason: err.message };
    }
  }

  // --- AUTOMATED FULL DISPATCH FOR A COMPLETED SUBMISSION ---
  async autoDispatchAll(form, responseRecord) {
    const cfg = this.getConfig();
    const s = responseRecord.scoring || {};
    const candidateName = responseRecord.respondentName || 'Candidate';
    const formTitle = form.title || 'Assessment';
    const statusText = s.isFullyGraded ? (s.passed ? 'PASSED ✓' : 'FAILED') : 'PENDING REVIEW';

    const plainText = `🎓 SAMSCO COMMUNICATIONS — ASSESSMENT RESULT\n\n` +
      `Hello ${candidateName},\n` +
      `Your submission for "${formTitle}" has been graded.\n\n` +
      `📊 SCORE REPORT:\n` +
      `• Total Score: ${s.score || 0} / ${s.maxScore || 0}\n` +
      `• Percentage: ${s.percentage || 0}%\n` +
      `• Letter Grade: ${s.grade || 'N/A'}\n` +
      `• Result Status: ${statusText}\n` +
      `• Duration: ${Utils.formatTime(responseRecord.durationSeconds || 0)}\n\n` +
      (s.remark ? `📝 EXAMINER REMARKS:\n"${s.remark}"\n\n` : '') +
      `Generated securely via SamForm.`;

    const htmlText = `🎓 <b>SAMSCO COMMUNICATIONS — ASSESSMENT RESULT</b>\n\n` +
      `Hello <b>${Utils.escapeHTML(candidateName)}</b>,\n` +
      `Your submission for <b>"${Utils.escapeHTML(formTitle)}"</b> has been graded.\n\n` +
      `📊 <b>SCORE REPORT:</b>\n` +
      `• Total Score: <b>${s.score || 0} / ${s.maxScore || 0}</b>\n` +
      `• Percentage: <b>${s.percentage || 0}%</b>\n` +
      `• Letter Grade: <b>${s.grade || 'N/A'}</b>\n` +
      `• Result Status: <b>${statusText}</b>\n` +
      `• Duration: ${Utils.formatTime(responseRecord.durationSeconds || 0)}\n\n` +
      (s.remark ? `📝 <b>EXAMINER REMARKS:</b>\n<i>"${Utils.escapeHTML(s.remark)}"</i>\n\n` : '') +
      `<i>Generated securely via SamForm.</i>`;

    const results = {
      whatsapp: null,
      telegram: null,
      emailjs: null
    };

    // 1. Send automated WhatsApp if enabled & phone exists
    if (cfg.enableAutoWhatsApp && cfg.whatsappGatewayUrl && responseRecord.respondentPhone && responseRecord.respondentPhone !== 'N/A') {
      results.whatsapp = await this.sendWhatsAppMessage(responseRecord.respondentPhone, plainText);
    }

    // 2. Send automated Telegram if enabled & telegram user exists
    if (cfg.enableAutoTelegram && cfg.telegramBotToken && responseRecord.respondentTelegram && responseRecord.respondentTelegram !== 'N/A') {
      results.telegram = await this.sendTelegramMessage(responseRecord.respondentTelegram, htmlText);
    }

    // 3. Send automated Email via EmailJS if enabled & email exists
    if (cfg.enableAutoEmailJS && cfg.emailjsServiceId && responseRecord.respondentEmail && responseRecord.respondentEmail.includes('@')) {
      results.emailjs = await this.sendEmailJS(responseRecord.respondentEmail, candidateName, formTitle, s, responseRecord.durationSeconds);
    }

    return results;
  }

  // --- BOT CONFIGURATION MODAL ---
  openConfigModal() {
    const existing = document.getElementById('samform_bot_config_modal');
    if (existing) existing.remove();

    const cfg = this.getConfig();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'samform_bot_config_modal';
    modal.innerHTML = `
      <div class="modal-card modal-lg" style="max-width: 650px; width: 95vw;">
        <div class="modal-header" style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color:#ffffff; padding:1.25rem 1.5rem;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; display:flex; align-items:center; gap:0.5rem;">
              <span style="color:#38bdf8;">${icon('zap', 20)}</span> Automated Bot Dispatch Settings
            </h3>
            <small style="color:rgba(255,255,255,0.8); font-size:0.8rem;">
              Configure free WhatsApp Web Gateway (Option B) & Telegram Bot API
            </small>
          </div>
          <button class="btn-icon" onclick="document.getElementById('samform_bot_config_modal').remove()" style="color:#ffffff; font-size:1.2rem;">✕</button>
        </div>

        <div class="modal-body" style="padding:1.5rem; max-height:75vh; overflow-y:auto;">
          
          <!-- WhatsApp Gateway (Option B) Section -->
          <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:10px; padding:1.25rem; margin-bottom:1.5rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="color:#25D366;">${icon('whatsapp', 22)}</span>
                <strong style="font-size:1rem; color:#0f172a;">WhatsApp Web Gateway (Option B)</strong>
              </div>
              <label class="toggle-label" style="margin:0;">
                <input type="checkbox" id="cfg_enable_wa" ${cfg.enableAutoWhatsApp ? 'checked' : ''} />
                <span>Auto-Send</span>
              </label>
            </div>
            <p style="font-size:0.82rem; color:#64748b; margin-bottom:1rem; line-height:1.4;">
              Connect your free self-hosted <code>whatsapp-gateway</code> (Baileys server hosted on Render/Railway). 
              If left blank, SamForm uses the 1-tap WhatsApp protocol link.
            </p>

            <div style="margin-bottom:0.75rem;">
              <label class="form-label-sm">Gateway Server URL</label>
              <input type="url" id="cfg_wa_url" class="form-input" placeholder="e.g. https://my-wa-gateway.onrender.com" value="${Utils.escapeHTML(cfg.whatsappGatewayUrl || '')}" />
            </div>
            <div>
              <label class="form-label-sm">Gateway Secret API Key (Optional)</label>
              <input type="password" id="cfg_wa_key" class="form-input" placeholder="Secret Token" value="${Utils.escapeHTML(cfg.whatsappApiKey || '')}" />
            </div>
          </div>

          <!-- Telegram Bot & Personal Userbot Section -->
          <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:10px; padding:1.25rem; margin-bottom:1.5rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="color:#229ED9;">${icon('telegram', 22)}</span>
                <strong style="font-size:1rem; color:#0f172a;">Telegram Integration (100% Free)</strong>
              </div>
              <label class="toggle-label" style="margin:0;">
                <input type="checkbox" id="cfg_enable_tg" ${cfg.enableAutoTelegram ? 'checked' : ''} />
                <span>Auto-Send</span>
              </label>
            </div>
            <p style="font-size:0.82rem; color:#64748b; margin-bottom:1rem; line-height:1.4;">
              Enter your <strong>Bot Token</strong> from <code>@BotFather</code> (for bot messaging) OR your <strong>API ID & API Hash</strong> from <a href="https://my.telegram.org" target="_blank" style="color:var(--primary); font-weight:600;">my.telegram.org</a> (to send from your personal account to any phone number).
            </p>

            <div style="margin-bottom:0.75rem;">
              <label class="form-label-sm">Option 1: Telegram Bot Token (@BotFather)</label>
              <input type="text" id="cfg_tg_token" class="form-input" placeholder="e.g. 7842918234:AAHkL_AbCdEf..." value="${Utils.escapeHTML(cfg.telegramBotToken || '')}" />
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
              <div>
                <label class="form-label-sm">Option 2: Telegram API ID (my.telegram.org)</label>
                <input type="text" id="cfg_tg_api_id" class="form-input" placeholder="e.g. 28491023" value="${Utils.escapeHTML(cfg.telegramApiId || '')}" />
              </div>
              <div>
                <label class="form-label-sm">Telegram API Hash (my.telegram.org)</label>
                <input type="password" id="cfg_tg_api_hash" class="form-input" placeholder="e.g. a1b2c3d4e5f6..." value="${Utils.escapeHTML(cfg.telegramApiHash || '')}" />
              </div>
            </div>
          </div>

          <!-- EmailJS Automation Section (100% Free Tier) -->
          <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:10px; padding:1.25rem; margin-bottom:1.5rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="color:#f59e0b;">${icon('mail', 22)}</span>
                <strong style="font-size:1rem; color:#0f172a;">Email.js Automation (100% Free)</strong>
              </div>
              <label class="toggle-label" style="margin:0;">
                <input type="checkbox" id="cfg_enable_emailjs" ${cfg.enableAutoEmailJS ? 'checked' : ''} />
                <span>Auto-Send</span>
              </label>
            </div>
            <p style="font-size:0.82rem; color:#64748b; margin-bottom:1rem; line-height:1.4;">
              Connect your free <strong>EmailJS</strong> account (200 free emails/month). Dispatches personalized results directly into candidate inboxes in the background.
            </p>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
              <div>
                <label class="form-label-sm">Service ID</label>
                <input type="text" id="cfg_emailjs_service" class="form-input" placeholder="e.g. service_xxxx" value="${Utils.escapeHTML(cfg.emailjsServiceId || '')}" />
              </div>
              <div>
                <label class="form-label-sm">Template ID</label>
                <input type="text" id="cfg_emailjs_template" class="form-input" placeholder="e.g. template_xxxx" value="${Utils.escapeHTML(cfg.emailjsTemplateId || '')}" />
              </div>
            </div>
            <div>
              <label class="form-label-sm">Public Key (User ID)</label>
              <input type="text" id="cfg_emailjs_key" class="form-input" placeholder="e.g. user_xxxx or public key" value="${Utils.escapeHTML(cfg.emailjsPublicKey || '')}" />
            </div>
          </div>

          <!-- Auto Dispatch Behavior -->
          <div style="background:#f1f5f9; border-radius:8px; padding:1rem;">
            <label class="toggle-label" style="display:flex; align-items:center; gap:0.5rem;">
              <input type="checkbox" id="cfg_auto_on_review" ${cfg.autoDispatchOnReviewComplete !== false ? 'checked' : ''} />
              <span style="font-weight:600; font-size:0.88rem;">Automatically dispatch messages when instructor marks or reviews a submission</span>
            </label>
          </div>

        </div>

        <div class="modal-footer" style="padding:1rem 1.5rem; background:var(--bg-surface-subtle); display:flex; justify-content:flex-end; gap:0.5rem; border-top:1px solid var(--border-color);">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('samform_bot_config_modal').remove()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="BotDispatcherInstance.handleSaveModal()">Save Bot Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  handleSaveModal() {
    const waUrl = document.getElementById('cfg_wa_url').value.trim();
    const waKey = document.getElementById('cfg_wa_key').value.trim();
    const enableWa = document.getElementById('cfg_enable_wa').checked;

    const tgToken = document.getElementById('cfg_tg_token').value.trim();
    const tgApiId = document.getElementById('cfg_tg_api_id').value.trim();
    const tgApiHash = document.getElementById('cfg_tg_api_hash').value.trim();
    const enableTg = document.getElementById('cfg_enable_tg').checked;

    const emailService = document.getElementById('cfg_emailjs_service').value.trim();
    const emailTemplate = document.getElementById('cfg_emailjs_template').value.trim();
    const emailKey = document.getElementById('cfg_emailjs_key').value.trim();
    const enableEmailJS = document.getElementById('cfg_enable_emailjs').checked;

    const autoOnReview = document.getElementById('cfg_auto_on_review').checked;

    this.saveConfig({
      whatsappGatewayUrl: waUrl,
      whatsappApiKey: waKey,
      enableAutoWhatsApp: enableWa,
      telegramBotToken: tgToken,
      telegramApiId: tgApiId,
      telegramApiHash: tgApiHash,
      enableAutoTelegram: enableTg,
      emailjsServiceId: emailService,
      emailjsTemplateId: emailTemplate,
      emailjsPublicKey: emailKey,
      enableAutoEmailJS: enableEmailJS,
      autoDispatchOnReviewComplete: autoOnReview
    });

    const modal = document.getElementById('samform_bot_config_modal');
    if (modal) modal.remove();
  }
}

// Global Singleton
window.BotDispatcherInstance = new BotDispatcher();
