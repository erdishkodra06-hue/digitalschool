/* ========================================
   AUTH JAVASCRIPT - Supabase Integration
   ======================================== */

// ========================================
// CONFIGURATION
// ========================================
const SUPABASE_URL = 'YOUR_SUPABASE_URL';      // Replace with your Supabase project URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // Replace with your anon key

// Treat the literal placeholders as "not configured"
const SUPABASE_CONFIGURED =
    SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
    SUPABASE_URL.startsWith('http');

// Initialize Supabase client (only when real keys are provided)
let supabase = null;

if (typeof window !== 'undefined' && window.supabase && SUPABASE_CONFIGURED) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Show/hide elements
function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true; }

// Set loading state on button
function setLoading(btn, loading) {
    if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// Show error message
function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.textContent = message;
        show(container);
    }
}

// Hide error message
function hideError(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        hide(container);
        container.textContent = '';
    }
}

// Validate email format
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Password strength checker
function checkPasswordStrength(password) {
    let score = 0;
    const checks = {
        length: password.length >= 8,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        number: /\d/.test(password),
        special: /[^a-zA-Z0-9]/.test(password)
    };
    
    score = Object.values(checks).filter(Boolean).length;
    
    let level = 'weak';
    if (score >= 4) level = 'strong';
    else if (score >= 3) level = 'good';
    else if (score >= 2) level = 'fair';
    
    return { score, level, checks };
}

// Update password strength UI
function updatePasswordStrength(password) {
    const strengthEl = document.getElementById('password-strength');
    const fillEl = document.getElementById('strength-fill');
    const textEl = document.getElementById('strength-text');
    
    if (!password) {
        hide(strengthEl);
        return;
    }
    
    show(strengthEl);
    const { level } = checkPasswordStrength(password);
    
    fillEl.className = 'strength-fill ' + level;
    
    const messages = {
        weak: 'Weak - Add more characters',
        fair: 'Fair - Mix letters & numbers',
        good: 'Good - Add special characters',
        strong: 'Strong password!'
    };
    
    textEl.textContent = messages[level];
    textEl.style.color = level === 'weak' ? 'var(--auth-red)' : 
                         level === 'fair' ? 'var(--auth-orange)' :
                         level === 'good' ? 'var(--auth-purple)' : 'var(--auth-green)';
}

// Toggle password visibility
function setupPasswordToggle(wrapper) {
    const toggleBtn = wrapper.querySelector('.toggle-password');
    const input = wrapper.querySelector('input');
    
    if (!toggleBtn || !input) return;
    
    toggleBtn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggleBtn.setAttribute('aria-expanded', isPassword);
        toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
}

// ========================================
// LOCAL DEMO BACKEND (works with NO Supabase keys)
// ========================================
// So the site functions like a real website out-of-the-box, we persist
// accounts/sessions in localStorage when Supabase isn't configured. The
// real Supabase path below is used automatically once keys are added.

const DEMO_USERS_KEY = 'aihub_users';
const DEMO_SESSION_KEY = 'aihub_session';

function _demoUsers() {
    try { return JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '[]'); }
    catch { return []; }
}
function _saveDemoUsers(users) { localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users)); }
function _demoSession() {
    try { return JSON.parse(localStorage.getItem(DEMO_SESSION_KEY) || 'null'); }
    catch { return null; }
}
function _saveDemoSession(user) { localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user)); }
function _clearDemoSession() { localStorage.removeItem(DEMO_SESSION_KEY); }

// Returns a normalized user object shaped like a Supabase user.
function _demoRegister({ firstName, lastName, email, password, dateOfBirth }) {
    const users = _demoUsers();
    if (users.some(u => u.email === email)) {
        const err = new Error('User already registered');
        err.status = 409;
        throw err;
    }
    const user = {
        id: 'demo-' + crypto.randomUUID(),
        email,
        user_metadata: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`, date_of_birth: dateOfBirth }
    };
    users.push({ ...user, password });
    _saveDemoUsers(users);
    _saveDemoSession(user);
    return user;
}

function _demoLogin(email, password) {
    const users = _demoUsers();
    const found = users.find(u => u.email === email);
    if (!found || found.password !== password) {
        const err = new Error('Invalid login credentials');
        err.status = 400;
        throw err;
    }
    const { password: _pw, ...user } = found;
    _saveDemoSession(user);
    return user;
}

// ========================================
// AUTH STATE MANAGEMENT (demo + Supabase)
// ========================================

// Check if user is logged in
async function checkAuthState() {
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.user || null;
    }
    return _demoSession();
}

// Redirect if authenticated (for login/register pages)
async function redirectIfAuthenticated() {
    const user = await checkAuthState();
    if (user && !window.location.pathname.includes('dashboard')) {
        window.location.href = 'dashboard.html'; // Create this later
    }
    return user;
}

// Redirect if not authenticated (for protected pages)
async function requireAuth() {
    const user = await checkAuthState();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

// Sign out
async function signOut() {
    if (supabase) {
        await supabase.auth.signOut();
    } else {
        _clearDemoSession();
    }
    window.location.href = 'login.html';
}

// ========================================
// EMAIL/PASSWORD AUTH (demo + Supabase)
// ========================================

// Sign in with email/password
async function signInWithEmail(email, password) {
    if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });
        if (error) throw error;
        return data;
    }
    const user = _demoLogin(email.trim().toLowerCase(), password);
    return { user, session: { user } };
}

// Sign up with email/password
async function signUpWithEmail(email, password, metadata = {}) {
    if (supabase) {
        const { data, error } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: { data: metadata }
        });
        if (error) throw error;
        return data;
    }
    const firstName = metadata.first_name || '';
    const lastName = metadata.last_name || '';
    const user = _demoRegister({
        firstName, lastName,
        email: email.trim().toLowerCase(),
        password,
        dateOfBirth: metadata.date_of_birth || null
    });
    return { user, session: { user } };
}

// Send password reset email
async function resetPassword(email) {
    if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html'
        });
        if (error) throw error;
        return true;
    }
    // Demo: nothing to do, but pretend success
    return true;
}

// ========================================
// OAUTH AUTH
// ========================================
// Sign in with OAuth provider (Supabase only — requires real keys)
async function signInWithOAuth(provider) {
    if (!supabase) {
        throw new Error('OAuth requires Supabase configuration');
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin + '/auth-callback.html'
        }
    });
    if (error) throw error;
    return data;
}

// ========================================
// PROFILE MANAGEMENT
// ========================================

// Get user profile
async function getProfile(userId) {
    if (!supabase) throw new Error('Supabase not initialized');
    
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) throw error;
    return data;
}

// Update user profile
async function updateProfile(userId, updates) {
    if (!supabase) throw new Error('Supabase not initialized');
    
    const { data, error } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

// Get user progress
async function getUserProgress(userId) {
    if (!supabase) throw new Error('Supabase not initialized');
    
    const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId);
    
    if (error) throw error;
    return data;
}

// Get user achievements
async function getUserAchievements(userId) {
    if (!supabase) throw new Error('Supabase not initialized');
    
    const { data, error } = await supabase
        .from('user_achievements')
        .select(`
            *,
            achievements (
                id,
                code,
                name,
                description,
                icon,
                xp_reward
            )
        `)
        .eq('user_id', userId);
    
    if (error) throw error;
    return data;
}

// ========================================
// FORM HANDLERS
// ========================================

// Setup login form
function setupLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return; // login page only
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = form.querySelector('.auth-submit');
    const errorEl = document.getElementById('login-error');
    
    // Password toggle
    setupPasswordToggle(passwordInput.closest('.input-wrapper'));
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('login-error');
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        // Validation
        if (!email || !password) {
            showError('login-error', 'Please fill in all fields');
            return;
        }
        
        if (!isValidEmail(email)) {
            showError('login-error', 'Please enter a valid email address');
            return;
        }
        
        setLoading(submitBtn, true);
        
        try {
            await signInWithEmail(email, password);
            // Success - redirect will happen via auth state listener
            window.location.href = 'index.html';
        } catch (error) {
            let message = 'Sign in failed. Please try again.';
            
            if (error.message.includes('Invalid login credentials')) {
                message = 'Invalid email or password';
            } else if (error.message.includes('Email not confirmed')) {
                message = 'Please check your email and confirm your account';
            } else if (error.message.includes('Too many requests')) {
                message = 'Too many attempts. Please wait a moment.';
            }
            
            showError('login-error', message);
        } finally {
            setLoading(submitBtn, false);
        }
    });
}

// Setup register form
function setupRegisterForm() {
    const form = document.getElementById('register-form');
    if (!form) return; // login page only
    const firstNameInput = document.getElementById('register-firstname');
    const lastNameInput = document.getElementById('register-lastname');
    const emailInput = document.getElementById('register-email');
    const confirmEmailInput = document.getElementById('register-confirm-email');
    const dobInput = document.getElementById('register-dob');
    const passwordInput = document.getElementById('register-password');
    const termsInput = document.getElementById('terms-agree');
    const submitBtn = form.querySelector('.auth-submit');
    const errorEl = document.getElementById('register-error');

    // Email confirm-match hint
    function checkEmailMatch() {
        const hintEl = document.getElementById('email-match-hint');
        if (!hintEl) return;
        const c = confirmEmailInput.value.trim();
        if (!c) { hintEl.hidden = true; return; }
        hintEl.hidden = false;
        if (c.toLowerCase() === emailInput.value.trim().toLowerCase()) {
            hintEl.textContent = '✓ Emails match';
            hintEl.className = 'form-hint success';
        } else {
            hintEl.textContent = '✗ Emails do not match';
            hintEl.className = 'form-hint error';
        }
    }

    // Password toggles
    setupPasswordToggle(passwordInput.closest('.input-wrapper'));

    // Live feedback
    passwordInput.addEventListener('input', () => updatePasswordStrength(passwordInput.value));
    emailInput.addEventListener('input', checkEmailMatch);
    confirmEmailInput.addEventListener('input', checkEmailMatch);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('register-error');

        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        const confirmEmail = confirmEmailInput.value.trim().toLowerCase();
        const dateOfBirth = dobInput.value;
        const password = passwordInput.value;
        const terms = termsInput.checked;

        // Validation
        if (!firstName || !lastName || !email || !confirmEmail || !dateOfBirth || !password) {
            showError('register-error', 'Please fill in all fields');
            return;
        }

        if (!isValidEmail(email)) {
            showError('register-error', 'Please enter a valid email address');
            return;
        }

        if (email !== confirmEmail) {
            showError('register-error', 'The two email addresses do not match');
            return;
        }

        // Date of birth -> age 12–18
        let age = null;
        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            const now = new Date();
            age = now.getFullYear() - dob.getFullYear();
            const m = now.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
        }
        if (age === null || age < 12 || age > 18) {
            showError('register-error', 'You must be between 12 and 18 years old');
            return;
        }

        const { level } = checkPasswordStrength(password);
        if (level === 'weak') {
            showError('register-error', 'Password is too weak. Use at least 8 characters with mixed case, numbers, and symbols');
            return;
        }

        if (!terms) {
            showError('register-error', 'You must agree to the Terms of Service and Privacy Policy');
            return;
        }

        setLoading(submitBtn, true);

        try {
            // Sign up (demo backend or Supabase, depending on config)
            const { data } = await signUpWithEmail(email, password, {
                first_name: firstName,
                last_name: lastName,
                full_name: `${firstName} ${lastName}`,
                date_of_birth: dateOfBirth
            });

            // In demo mode there is no email confirmation step.
            if (supabase && data.user && !data.session) {
                showError('register-error', 'Account created! Please check your email to confirm your account.', 'success');
            } else {
                window.location.href = 'index.html';
            }
        } catch (error) {
            let message = 'Registration failed. Please try again.';

            if (error.message.includes('User already registered')) {
                message = 'An account with this email already exists';
            } else if (error.message.includes('Password should be at least')) {
                message = 'Password must be at least 8 characters';
            } else if (error.message.includes('Invalid email')) {
                message = 'Please enter a valid email address';
            }

            showError('register-error', message);
        } finally {
            setLoading(submitBtn, false);
        }
    });
}

// Setup tab switching
function setupTabSwitching() {
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    const switchToRegister = document.getElementById('switch-to-register');
    const switchToLogin = document.getElementById('switch-to-login');
    
    function switchTab(tabName) {
        tabs.forEach(tab => {
            const isActive = tab.dataset.tab === tabName;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive);
        });
        
        forms.forEach(form => {
            const isActive = form.id === `${tabName}-form`;
            form.hidden = !isActive;
            form.setAttribute('aria-hidden', !isActive);
        });
        
        // Update footer text
        if (switchToRegister && switchToLogin) {
            switchToRegister.hidden = tabName === 'register';
            switchToLogin.hidden = tabName === 'login';
        }
        
        // Clear errors
        hideError('login-error');
        hideError('register-error');
    }
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    if (switchToRegister) {
        switchToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('register');
        });
    }
    
    if (switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('login');
        });
    }
}

// Setup OAuth buttons
function setupOAuthButtons() {
    const buttons = document.querySelectorAll('.btn-oauth');
    
    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const provider = btn.dataset.provider;
            btn.disabled = true;
            btn.innerHTML = '<svg class="spinner" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" stroke-linecap="round"/></svg>';
            
            try {
                await signInWithOAuth(provider);
                // Redirect happens automatically
            } catch (error) {
                console.error('OAuth error:', error);
                btn.disabled = false;
                btn.innerHTML = btn.dataset.provider === 'github' 
                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg> GitHub'
                    : '<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Google';
                
                // Show error in appropriate form
                const activeForm = document.querySelector('.auth-form:not([hidden])');
                const errorId = activeForm?.id === 'register-form' ? 'register-error' : 'login-error';
                showError(errorId, `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign in failed. Please try again.`);
            }
        });
    });
}

// ========================================
// NAVIGATION AUTH BUTTONS (index.html)
// ========================================

// Render the Login/Sign-up (or user menu) inside the top nav.
// Works even before Supabase is configured (uses the demo session if present).
async function renderNavAuth() {
    const container = document.getElementById('nav-actions');
    if (!container) return; // not on a page with a nav

    try {
        const user = await checkAuthState();
        if (user) {
            const email = user.email || 'user';
            const initials = email.charAt(0).toUpperCase();
            const name = (user.user_metadata && user.user_metadata.full_name) || email;
            container.innerHTML = `
                <span class="nav-user">
                    <span class="nav-avatar">${initials}</span>
                    ${name}
                </span>
                <button class="nav-btn" id="nav-logout">Log Out</button>
            `;
            const logoutBtn = document.getElementById('nav-logout');
            if (logoutBtn) logoutBtn.addEventListener('click', async () => {
                await signOut();
                window.location.href = 'index.html';
            });
        } else {
            container.innerHTML = `
                <a href="login.html" class="nav-btn">Log In</a>
                <a href="login.html?mode=register" class="nav-btn nav-btn-primary">Sign Up</a>
            `;
        }
    } catch (err) {
        // On error, still show the links
        container.innerHTML = `
            <a href="login.html" class="nav-btn">Log In</a>
            <a href="login.html?mode=register" class="nav-btn nav-btn-primary">Sign Up</a>
        `;
    }
}

// Wire up the hero buttons on the home page.
function setupHomePage() {
    const cta = document.getElementById('hero-cta');
    const signup = document.getElementById('hero-signup');

    if (cta) {
        cta.addEventListener('click', () => {
            document.getElementById('what-is-ai')?.scrollIntoView({ behavior: 'smooth' });
        });
    }
    if (signup) {
        signup.addEventListener('click', () => {
            window.location.href = 'login.html?mode=register';
        });
    }
}

// Open the on-page signup modal.
function openSignupModal() {
    const modal = document.getElementById('signup-modal');
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const first = modal.querySelector('input, select');
    if (first) setTimeout(() => first.focus(), 50);
}

function closeSignupModal() {
    const modal = document.getElementById('signup-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
}

// Wire the home-page signup modal: open/close + credential submission.
function setupHomeSignup() {
    const modal = document.getElementById('signup-modal');
    if (!modal) return;

    const closeBtn = document.getElementById('signup-modal-close');
    const form = document.getElementById('home-signup-form');
    const errorEl = document.getElementById('signup-modal-error');

    if (closeBtn) closeBtn.addEventListener('click', closeSignupModal);

    // Close on overlay click (outside the modal box)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSignupModal();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) closeSignupModal();
    });

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }

        const firstName = document.getElementById('su-firstname').value.trim();
        const lastName = document.getElementById('su-lastname').value.trim();
        const email = document.getElementById('su-email').value.trim().toLowerCase();
        const confirmEmail = document.getElementById('su-confirm-email').value.trim().toLowerCase();
        const dateOfBirth = document.getElementById('su-dob').value;
        const password = document.getElementById('su-password').value;

        // Basic validation
        if (!firstName || !lastName || !email || !confirmEmail || !dateOfBirth || !password) {
            if (errorEl) { errorEl.textContent = 'Please fill in every field.'; errorEl.hidden = false; }
            return;
        }
        if (!isValidEmail(email)) {
            if (errorEl) { errorEl.textContent = 'Please enter a valid email address.'; errorEl.hidden = false; }
            return;
        }
        if (email !== confirmEmail) {
            if (errorEl) { errorEl.textContent = 'The two email addresses do not match.'; errorEl.hidden = false; }
            return;
        }
        // Date of birth -> age 12–18
        let age = null;
        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            const now = new Date();
            age = now.getFullYear() - dob.getFullYear();
            const m = now.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
        }
        if (age === null || age < 12 || age > 18) {
            if (errorEl) { errorEl.textContent = 'You must be between 12 and 18 years old.'; errorEl.hidden = false; }
            return;
        }
        if (password.length < 8) {
            if (errorEl) { errorEl.textContent = 'Password must be at least 8 characters.'; errorEl.hidden = false; }
            return;
        }

        const btn = form.querySelector('.btn');
        const btnText = btn?.querySelector('.btn-text');
        if (btn) { btn.disabled = true; if (btnText) btnText.textContent = 'Creating account…'; }

        try {
            const { data } = await signUpWithEmail(email, password, {
                first_name: firstName,
                last_name: lastName,
                full_name: `${firstName} ${lastName}`,
                date_of_birth: dateOfBirth
            });

            closeSignupModal();
            // Demo mode signs in immediately; Supabase may require email confirmation.
            if (supabase && data.user && !data.session) {
                window.location.href = 'login.html?registered=1';
            } else {
                window.location.href = 'index.html';
            }
        } catch (err) {
            let msg = 'Could not create your account. Please try again.';
            if (err.message && err.message.includes('User already registered')) {
                msg = 'An account with this email already exists. Try logging in.';
            }
            if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
        } finally {
            if (btn) { btn.disabled = false; if (btnText) btnText.textContent = 'Create Account'; }
        }
    });
}
// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Check for Supabase config
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('⚠️ Supabase credentials not configured! Update SUPABASE_URL and SUPABASE_ANON_KEY in auth.js');
        // Show config warning on page
        const warning = document.createElement('div');
        warning.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--auth-orange);color:var(--color-bg);padding:12px 16px;border-radius:8px;font-size:14px;font-weight:500;z-index:9999;max-width:300px;box-shadow:var(--shadow-xl)';
        warning.innerHTML = '⚠️ Supabase not configured. Edit auth.js to add your credentials.';
        document.body.appendChild(warning);
    }
    
    // Initialize forms (only present on login.html)
    setupLoginForm();
    setupRegisterForm();
    setupTabSwitching();
    setupOAuthButtons();

    // Home page bits (nav auth buttons + hero buttons)
    renderNavAuth();
    setupHomePage();
    setupHomeSignup();
    
    // Check for URL params (e.g., ?mode=register)
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'register') {
        const registerTab = document.querySelector('.auth-tab[data-tab="register"]');
        if (registerTab) registerTab.click();
    }
});

// Export for use in other pages
window.Auth = {
    signOut,
    checkAuthState,
    requireAuth,
    getProfile,
    updateProfile,
    getUserProgress,
    getUserAchievements,
    supabase: () => supabase
};