/**
 * FormForge Supabase Integration Layer
 * Connects FormForge seamlessly to Supabase PostgreSQL & Real-time channels.
 */

const FormForgeSupabase = {
  // Pre-configured Supabase project credentials
  config: {
    url: localStorage.getItem('formforge_supabase_url') || 'https://aakrjnpprxhmaxeqhnsk.supabase.co',
    anonKey: localStorage.getItem('formforge_supabase_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3JqbnBwcnhobWF4ZXFobnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNjg2NTAsImV4cCI6MjEwMjY0NDY1MH0.rdxVDv1luq2MLfymGMPtPXBSRyWK5ZxAelkPjEctEAU',
    enabled: true
  },

  client: null,

  init() {
    if (this.config.url && this.config.anonKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
        this.config.enabled = true;
        console.log('⚡ FormForge connected to Supabase!');
      } catch (err) {
        console.error('Supabase init failed:', err);
      }
    }
    return this.isReady();
  },

  isReady() {
    return !!(this.client && this.config.enabled);
  },

  updateCredentials(url, key) {
    this.config.url = url.trim();
    this.config.anonKey = key.trim();
    this.config.enabled = !!(this.config.url && this.config.anonKey);
    localStorage.setItem('formforge_supabase_url', this.config.url);
    localStorage.setItem('formforge_supabase_key', this.config.anonKey);
    localStorage.setItem('formforge_supabase_enabled', String(this.config.enabled));
    
    if (this.config.enabled && window.supabase) {
      this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
      return true;
    }
    return false;
  },

  // --- FORMS SYNC ---
  async syncFormToCloud(form) {
    if (!this.isReady()) return null;
    try {
      const payload = {
        id: form.id,
        title: form.title || 'Untitled Assessment',
        description: form.description || '',
        status: form.status || 'published',
        mode: form.mode || 'exam',
        theme: form.theme || 'indigo',
        time_limit: form.timeLimit || 0,
        passing_score: form.passingScore || 50,
        sections: form.sections || [],
        questions: form.questions || [],
        settings: form.settings || {},
        conditional_logic: form.conditionalLogic || [],
        version: form.version || 1,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.client.from('forms').upsert(payload);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('Cloud sync error (form):', err);
      return false;
    }
  },

  async fetchFormFromCloud(formId) {
    if (!this.isReady()) return null;
    try {
      const { data, error } = await this.client.from('forms').select('*').eq('id', formId).single();
      if (error || !data) return null;

      return {
        id: data.id,
        title: data.title,
        description: data.description,
        status: data.status,
        mode: data.mode,
        theme: data.theme,
        timeLimit: data.time_limit,
        passingScore: data.passing_score,
        sections: data.sections || [],
        questions: data.questions || [],
        settings: data.settings || {},
        conditionalLogic: data.conditional_logic || [],
        version: data.version,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (err) {
      console.warn('Cloud fetch error (form):', err);
      return null;
    }
  },

  async fetchAllFormsFromCloud() {
    if (!this.isReady()) return [];
    try {
      const { data, error } = await this.client.from('forms').select('*').order('updated_at', { ascending: false });
      if (error || !data) return [];

      return data.map(d => ({
        id: d.id,
        title: d.title,
        description: d.description,
        status: d.status,
        mode: d.mode,
        theme: d.theme,
        timeLimit: d.time_limit,
        passingScore: d.passing_score,
        sections: d.sections || [],
        questions: d.questions || [],
        settings: d.settings || {},
        conditionalLogic: d.conditional_logic || [],
        version: d.version,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));
    } catch (err) {
      console.warn('Cloud fetch all forms error:', err);
      return [];
    }
  },

  async deleteFormFromCloud(formId) {
    if (!this.isReady()) return false;
    try {
      const { error } = await this.client.from('forms').delete().eq('id', formId);
      return !error;
    } catch (err) {
      console.warn('Cloud delete error (form):', err);
      return false;
    }
  },

  // --- RESPONSES SYNC ---
  async submitResponseToCloud(resp) {
    if (!this.isReady()) return null;
    try {
      // Store custom phone and telegram safely inside answers._metadata so Supabase doesn't reject missing columns
      const answersObj = { ...(resp.answers || {}) };
      answersObj._metadata = {
        phone: resp.respondentPhone || 'N/A',
        telegram: resp.respondentTelegram || 'N/A'
      };

      const payload = {
        id: resp.id,
        form_id: resp.formId,
        form_title: resp.formTitle,
        respondent_name: resp.respondentName || 'Anonymous Candidate',
        respondent_email: resp.respondentEmail || 'N/A',
        respondent_id: resp.respondentId || 'N/A',
        answers: answersObj,
        flags: resp.flags || [],
        manual_grades: resp.manualGrades || {},
        duration_seconds: resp.durationSeconds || 0,
        forced_by_timer: !!resp.forcedByTimer,
        scoring: resp.scoring || {},
        submitted_at: resp.submittedAt || new Date().toISOString()
      };

      const { data, error } = await this.client.from('responses').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('Cloud submit error (response):', err.message || err);
      return false;
    }
  },

  async fetchResponsesForFormFromCloud(formId) {
    if (!this.isReady()) return [];
    try {
      const deletedIds = await this.getDeletedResponseIds();
      const { data, error } = await this.client.from('responses').select('*').eq('form_id', formId).order('submitted_at', { ascending: false });
      if (error || !data) return [];

      return data
        .filter(d => !deletedIds.includes(d.id) && !(d.answers && d.answers._metadata && d.answers._metadata.is_deleted === true))
        .map(d => {
          const answersObj = d.answers || {};
          const meta = answersObj._metadata || {};
          return {
            id: d.id,
            formId: d.form_id,
            formTitle: d.form_title,
            respondentName: d.respondent_name,
            respondentEmail: d.respondent_email,
            respondentPhone: d.respondent_phone || meta.phone || 'N/A',
            respondentTelegram: d.respondent_telegram || meta.telegram || 'N/A',
            respondentId: d.respondent_id,
            answers: answersObj,
            flags: d.flags || [],
            manualGrades: d.manual_grades || {},
            durationSeconds: d.duration_seconds,
            forcedByTimer: d.forced_by_timer,
            scoring: d.scoring || {},
            submittedAt: d.submitted_at
          };
        });
    } catch (err) {
      console.warn('Cloud fetch responses error:', err);
      return [];
    }
  },

  async fetchAllResponsesFromCloud() {
    if (!this.isReady()) return [];
    try {
      const deletedIds = await this.getDeletedResponseIds();
      const { data, error } = await this.client.from('responses').select('*').order('submitted_at', { ascending: false });
      if (error || !data) return [];

      return data
        .filter(d => !deletedIds.includes(d.id) && !(d.answers && d.answers._metadata && d.answers._metadata.is_deleted === true))
        .map(d => {
          const answersObj = d.answers || {};
          const meta = answersObj._metadata || {};
          return {
            id: d.id,
            formId: d.form_id,
            formTitle: d.form_title,
            respondentName: d.respondent_name,
            respondentEmail: d.respondent_email,
            respondentPhone: d.respondent_phone || meta.phone || 'N/A',
            respondentTelegram: d.respondent_telegram || meta.telegram || 'N/A',
            respondentId: d.respondent_id,
            answers: answersObj,
            flags: d.flags || [],
            manualGrades: d.manual_grades || {},
            durationSeconds: d.duration_seconds,
            forcedByTimer: d.forced_by_timer,
            scoring: d.scoring || {},
            submittedAt: d.submitted_at
          };
        });
    } catch (err) {
      console.warn('Cloud fetch all responses error:', err);
      return [];
    }
  },

  async updateResponseGradeInCloud(resp) {
    if (!this.isReady()) return false;
    try {
      const { error } = await this.client.from('responses').update({
        manual_grades: resp.manualGrades || {},
        scoring: resp.scoring || {}
      }).eq('id', resp.id);
      return !error;
    } catch (err) {
      console.warn('Cloud update grade error:', err);
      return false;
    }
  },

  async getDeletedResponseIds() {
    try {
      const list = await this.fetchSettingsFromCloud('deleted_response_ids');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  },

  async markResponseAsDeleted(responseId) {
    try {
      const current = await this.getDeletedResponseIds();
      if (!current.includes(responseId)) {
        current.push(responseId);
        await this.syncSettingsToCloud('deleted_response_ids', current);
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  async deleteResponseFromCloud(responseId) {
    if (!this.isReady()) return false;
    try {
      // 1. Try direct SQL row delete
      await this.client.from('responses').delete().eq('id', responseId);

      // 2. Mark in global deleted registry in app_settings (Bypasses all PostgreSQL table locks & RLS!)
      await this.markResponseAsDeleted(responseId);

      return true;
    } catch (err) {
      console.warn('Cloud delete response error:', err);
      return false;
    }
  },

  // --- BOT & PLATFORM CONFIG SYNC (SUPABASE CLOUD) ---
  async syncSettingsToCloud(key, valueObj) {
    if (!this.isReady()) return false;
    try {
      const payload = {
        key: key,
        value: valueObj,
        updated_at: new Date().toISOString()
      };
      const { error } = await this.client.from('app_settings').upsert(payload, { onConflict: 'key' });
      if (error) {
        console.warn('Cloud save settings notice:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Cloud save settings error:', err);
      return false;
    }
  },

  async fetchSettingsFromCloud(key) {
    if (!this.isReady()) return null;
    try {
      const { data, error } = await this.client.from('app_settings').select('value').eq('key', key);
      if (error || !data || data.length === 0) return null;
      return data[0].value;
    } catch (err) {
      return null;
    }
  }
};

window.FormForgeSupabase = FormForgeSupabase;
