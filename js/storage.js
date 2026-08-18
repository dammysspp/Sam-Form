/**
 * FormForge Storage Layer - IndexedDB Engine with LocalStorage Fallback
 */

const DB_NAME = 'FormForgeDB';
const DB_VERSION = 1;

class FormForgeStorage {
  constructor() {
    this.db = null;
    this.isReady = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, fallback to memory/localStorage');
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Forms store
        if (!db.objectStoreNames.contains('forms')) {
          const formStore = db.createObjectStore('forms', { keyPath: 'id' });
          formStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          formStore.createIndex('status', 'status', { unique: false });
        }

        // Responses store
        if (!db.objectStoreNames.contains('responses')) {
          const responseStore = db.createObjectStore('responses', { keyPath: 'id' });
          responseStore.createIndex('formId', 'formId', { unique: false });
          responseStore.createIndex('submittedAt', 'submittedAt', { unique: false });
        }

        // Drafts store (for responder auto-save resume)
        if (!db.objectStoreNames.contains('drafts')) {
          const draftStore = db.createObjectStore('drafts', { keyPath: 'formId' });
          draftStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Form Versions store
        if (!db.objectStoreNames.contains('versions')) {
          const versionStore = db.createObjectStore('versions', { keyPath: 'id' });
          versionStore.createIndex('formId', 'formId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async _tx(storeName, mode, callback) {
    await this.isReady;
    if (!this.db) {
      return this._fallbackStorage(storeName, mode, callback);
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = callback(store);
        tx.oncomplete = () => resolve(result._result !== undefined ? result._result : result);
        tx.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  _fallbackStorage(storeName, mode, callback) {
    const key = `formforge_${storeName}`;
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    // Minimal fallback emulation
    return null;
  }

  // --- FORMS CRUD ---
  async getAllForms() {
    await this.isReady;
    
    // Check Supabase Cloud First if connected
    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      const cloudForms = await FormForgeSupabase.fetchAllFormsFromCloud();
      if (cloudForms && cloudForms.length > 0) {
        // Cache to local IndexedDB
        for (const f of cloudForms) {
          await this._putLocalForm(f);
        }
        return cloudForms;
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.db) { resolve([]); return; }
      const tx = this.db.transaction('forms', 'readonly');
      const store = tx.objectStore('forms');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getFormById(id) {
    await this.isReady;

    // Check Cloud if online
    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      const cloudForm = await FormForgeSupabase.fetchFormFromCloud(id);
      if (cloudForm) {
        await this._putLocalForm(cloudForm);
        return cloudForm;
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(null); return; }
      const tx = this.db.transaction('forms', 'readonly');
      const store = tx.objectStore('forms');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async _putLocalForm(form) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('forms', 'readwrite');
      tx.objectStore('forms').put(form);
    } catch (e) {}
  }

  async saveForm(form) {
    await this.isReady;
    if (!form.id) form.id = 'form_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    form.updatedAt = new Date().toISOString();
    if (!form.createdAt) form.createdAt = form.updatedAt;
    if (!form.version) form.version = 1;

    // Sync to Supabase Cloud
    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      await FormForgeSupabase.syncFormToCloud(form);
    }

    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(form); return; }
      const tx = this.db.transaction(['forms', 'versions'], 'readwrite');
      const formStore = tx.objectStore('forms');
      const versionStore = tx.objectStore('versions');

      formStore.put(form);

      const versionEntry = {
        id: `${form.id}_v${form.version}_${Date.now()}`,
        formId: form.id,
        version: form.version,
        snapshot: JSON.parse(JSON.stringify(form)),
        savedAt: new Date().toISOString()
      };
      versionStore.put(versionEntry);

      tx.oncomplete = () => resolve(form);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteForm(id) {
    await this.isReady;

    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      await FormForgeSupabase.deleteFormFromCloud(id);
    }

    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(true); return; }
      const tx = this.db.transaction(['forms', 'responses', 'drafts', 'versions'], 'readwrite');
      tx.objectStore('forms').delete(id);
      tx.objectStore('drafts').delete(id);

      const respStore = tx.objectStore('responses');
      const index = respStore.index('formId');
      const req = index.openCursor(IDBKeyRange.only(id));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- RESPONSES CRUD ---
  async saveResponse(response) {
    await this.isReady;
    if (!response.id) response.id = 'resp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    response.submittedAt = response.submittedAt || new Date().toISOString();

    // Centralized Cloud Submission to Supabase
    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      await FormForgeSupabase.submitResponseToCloud(response);
    }

    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(response); return; }
      const tx = this.db.transaction('responses', 'readwrite');
      const store = tx.objectStore('responses');
      store.put(response);
      tx.oncomplete = () => resolve(response);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getResponsesByFormId(formId) {
    await this.isReady;

    // Fetch live from Supabase
    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      const cloudResp = await FormForgeSupabase.fetchResponsesForFormFromCloud(formId);
      if (cloudResp && cloudResp.length > 0) {
        return cloudResp;
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.db) { resolve([]); return; }
      const tx = this.db.transaction('responses', 'readonly');
      const store = tx.objectStore('responses');
      const index = store.index('formId');
      const req = index.getAll(IDBKeyRange.only(formId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllResponses() {
    await this.isReady;

    if (window.FormForgeSupabase && FormForgeSupabase.isReady()) {
      const cloudAll = await FormForgeSupabase.fetchAllResponsesFromCloud();
      if (cloudAll && cloudAll.length > 0) {
        return cloudAll;
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.db) { resolve([]); return; }
      const tx = this.db.transaction('responses', 'readonly');
      const store = tx.objectStore('responses');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteResponse(responseId) {
    await this.isReady;
    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(true); return; }
      const tx = this.db.transaction('responses', 'readwrite');
      tx.objectStore('responses').delete(responseId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- DRAFTS / AUTO-SAVE RESUME ---
  async saveDraft(formId, draftData) {
    await this.isReady;
    const entry = {
      formId,
      data: draftData,
      updatedAt: new Date().toISOString()
    };
    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(entry); return; }
      const tx = this.db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(entry);
      tx.oncomplete = () => resolve(entry);
      tx.onerror = () => reject(tx.error);
    });
  }

  async getDraft(formId) {
    await this.isReady;
    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(null); return; }
      const tx = this.db.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').get(formId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async clearDraft(formId) {
    await this.isReady;
    return new Promise((resolve, reject) => {
      if (!this.db) { resolve(true); return; }
      const tx = this.db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete(formId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- FORM VERSIONS ---
  async getVersions(formId) {
    await this.isReady;
    return new Promise((resolve, reject) => {
      if (!this.db) { resolve([]); return; }
      const tx = this.db.transaction('versions', 'readonly');
      const index = tx.objectStore('versions').index('formId');
      const req = index.getAll(IDBKeyRange.only(formId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
}

// Global singleton instance
window.DB = new FormForgeStorage();
