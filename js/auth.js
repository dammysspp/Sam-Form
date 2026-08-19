const FormForgeAuth = {
  SESSION_KEY: 'formforge_admin_auth',
  AUTH_TIMESTAMP_KEY: 'formforge_admin_auth_time',
  
  // SHA-256 Cryptographic Hashes (one-way digest)
  AUTH_HASHES: {
    userHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    passHash: 'd51775b1672a8bb3801f04c6da12890b1b3a9365c84900bb2c52ae192abc9d32'
  },

  // Helper to hash strings with browser native crypto.subtle
  async sha256(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  // Check if admin is currently authenticated
  isAuthenticated() {
    const isAuth = sessionStorage.getItem(this.SESSION_KEY) === 'true' || localStorage.getItem(this.SESSION_KEY) === 'true';
    return isAuth;
  },

  // Enforce authentication gate on protected pages
  guard() {
    // If we are on responder.html (the candidate exam/quiz link), no sign-in is required!
    const path = window.location.pathname.toLowerCase();
    if (path.includes('responder.html')) {
      return true;
    }

    if (!this.isAuthenticated()) {
      this.showLoginModal();
      return false;
    }
    return true;
  },

  // Show beautiful login modal
  showLoginModal() {
    const existing = document.getElementById('ff_admin_auth_modal');
    if (existing) return;

    const modal = document.createElement('div');
    modal.id = 'ff_admin_auth_modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 27, 75, 0.98) 100%);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      backdrop-filter: blur(12px);
      font-family: var(--font-main, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: #0f172a;
    `;

    modal.innerHTML = `
      <div style="background: #ffffff; width: 100%; max-width: 420px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); overflow: hidden; animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
        <!-- Modal Brand Header -->
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: #ffffff; padding: 2rem 1.75rem; text-align: center;">
          <div style="width: 56px; height: 56px; background: rgba(255, 255, 255, 0.15); border-radius: 14px; margin: 0 auto 1rem auto; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 255, 255, 0.3);">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </div>
          <h2 style="margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em;">SamForm Admin</h2>
          <p style="margin: 0.35rem 0 0 0; font-size: 0.88rem; color: rgba(255, 255, 255, 0.85);">
            Created by <strong>Samsco Communications</strong>
          </p>
        </div>

        <!-- Form Body -->
        <form id="ff_login_form" onsubmit="FormForgeAuth.handleLogin(event)" style="padding: 2rem 1.75rem;">
          <div id="ff_login_error" style="display: none; background: #fef2f2; border: 1px solid #f87171; color: #991b1b; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1.25rem;">
          </div>

          <div style="margin-bottom: 1.25rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 700; color: #334155; margin-bottom: 0.4rem;">
              Admin Username
            </label>
            <input type="text" id="ff_username" required autocomplete="username"
              placeholder="e.g. admin"
              style="width: 100%; box-sizing: border-box; padding: 0.75rem 1rem; font-size: 0.95rem; border: 1.5px solid #cbd5e1; border-radius: 8px; outline: none; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='#4f46e5'" onblur="this.style.borderColor='#cbd5e1'" />
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 700; color: #334155; margin-bottom: 0.4rem;">
              Password
            </label>
            <input type="password" id="ff_password" required autocomplete="current-password"
              placeholder="••••••••"
              style="width: 100%; box-sizing: border-box; padding: 0.75rem 1rem; font-size: 0.95rem; border: 1.5px solid #cbd5e1; border-radius: 8px; outline: none; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='#4f46e5'" onblur="this.style.borderColor='#cbd5e1'" />
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #64748b; cursor: pointer;">
              <input type="checkbox" id="ff_remember_me" checked style="accent-color: #4f46e5;" />
              Remember this browser
            </label>
          </div>

          <button type="submit" id="btn_auth_submit"
            style="width: 100%; background: #4f46e5; color: #ffffff; padding: 0.85rem; font-size: 1rem; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; transition: background 0.2s, transform 0.1s;"
            onmouseover="this.style.background='#4338ca'" onmouseout="this.style.background='#4f46e5'">
            Sign In to Console →
          </button>
        </form>

        <div style="background: #f8fafc; padding: 1rem 1.75rem; border-top: 1px solid #e2e8f0; text-align: center;">
          <small style="color: #64748b; font-size: 0.78rem;">
            Public assessment links (<code>responder.html</code>) remain accessible to candidates without login.
          </small>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
      const userInp = document.getElementById('ff_username');
      if (userInp) userInp.focus();
    }, 100);
  },

  async handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('ff_username').value.trim();
    const pass = document.getElementById('ff_password').value;
    const remember = document.getElementById('ff_remember_me').checked;
    const errBox = document.getElementById('ff_login_error');
    const submitBtn = document.getElementById('btn_auth_submit');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';
    }

    try {
      const inputUserHash = await this.sha256(user);
      const inputPassHash = await this.sha256(pass);

      if (inputUserHash === this.AUTH_HASHES.userHash && inputPassHash === this.AUTH_HASHES.passHash) {
        if (remember) {
          localStorage.setItem(this.SESSION_KEY, 'true');
          localStorage.setItem(this.AUTH_TIMESTAMP_KEY, Date.now().toString());
        } else {
          sessionStorage.setItem(this.SESSION_KEY, 'true');
        }

        const modal = document.getElementById('ff_admin_auth_modal');
        if (modal) modal.remove();

        if (window.Utils) {
          Utils.showToast('Welcome, Administrator!', 'success');
        }

        window.location.reload();
        return;
      }
    } catch (err) {
      console.error('Auth verification error', err);
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Console →';
    }

    if (errBox) {
      errBox.textContent = 'Invalid credentials. Please enter the correct username and password.';
      errBox.style.display = 'block';
    }
    const passInp = document.getElementById('ff_password');
    if (passInp) {
      passInp.value = '';
      passInp.focus();
    }
  },

  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.AUTH_TIMESTAMP_KEY);
    window.location.href = 'index.html';
  }
};

window.FormForgeAuth = FormForgeAuth;
