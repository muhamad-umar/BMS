import { supabase } from '../auth.js';

let inactivityTimer = null;
let warningTimer = null;
let role = null;
let timeoutThresholdMs = 30 * 60 * 1000; // default 30 min
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function initSessionManager(userRole, session) {
    role = userRole;
    if (role === 'owner') {
        timeoutThresholdMs = 15 * 60 * 1000;
    } else {
        timeoutThresholdMs = 30 * 60 * 1000;
    }

    // 1. Absolute Session Expiry Check
    checkAbsoluteExpiry(session);
    
    // Check every 5 minutes for absolute expiry
    setInterval(async () => {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
            checkAbsoluteExpiry(currentSession);
        }
    }, 5 * 60 * 1000);

    // 2. Inactivity Tracking
    setupInactivityTracking();
    
    // 3. Multi-tab Sync listener
    window.addEventListener('storage', (e) => {
        if (e.key === 'bms_last_activity') {
            resetInactivityTimer(false); // Don't broadcast again
        }
    });

    // Listen for auth state changes (e.g. logout in another tab)
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.href = '/';
        }
    });
}

function checkAbsoluteExpiry(session) {
    if (!session || !session.user) return;
    
    // We use session.user.last_sign_in_at which records the actual exact moment the user authenticated
    const startTimeStr = session.user.last_sign_in_at;
    if (!startTimeStr) return;
    
    const startTime = new Date(startTimeStr).getTime();
    const now = Date.now();
    
    if (now - startTime > ABSOLUTE_TIMEOUT_MS) {
        forceLogout('Your session has expired for security. Please log in again.');
    }
}

function setupInactivityTracking() {
    const events = ['click', 'keydown', 'mousemove', 'touchstart'];
    
    let throttleTimer = null;
    const handleActivity = () => {
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => { throttleTimer = null; }, 1000);
        resetInactivityTimer(true);
    };

    events.forEach(event => {
        window.addEventListener(event, handleActivity, { passive: true });
    });
    
    // Initial start
    resetInactivityTimer(true);
}

function resetInactivityTimer(broadcast = false) {
    if (broadcast) {
        localStorage.setItem('bms_last_activity', Date.now().toString());
    }
    
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (warningTimer) clearTimeout(warningTimer);
    
    hideWarningModal();

    // 60 seconds before timeout, show warning
    const warningTimeMs = timeoutThresholdMs - 60000;
    
    warningTimer = setTimeout(() => {
        showWarningModal();
    }, warningTimeMs);
    
    inactivityTimer = setTimeout(() => {
        forceLogout('You have been logged out due to inactivity.');
    }, timeoutThresholdMs);
}

function showWarningModal() {
    if (document.getElementById('inactivity-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'inactivity-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.6); z-index: 999999; 
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 2.5rem; border-radius: 18px; text-align: center; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--warning); margin-bottom: 1rem;"></i>
            <h2 style="color: var(--text-primary); margin-bottom: 1rem; font-size: 1.5rem;">Inactivity Warning</h2>
            <p style="margin-bottom: 1.5rem; color: var(--text-secondary); font-size: 1rem; line-height: 1.5;">You will be logged out in 60 seconds due to inactivity.<br><br>Move your mouse or press any key to stay logged in.</p>
            <button class="btn btn-primary" style="width: 100%;" onclick="document.getElementById('inactivity-modal').remove()">Stay Logged In</button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function hideWarningModal() {
    const modal = document.getElementById('inactivity-modal');
    if (modal) modal.remove();
}

async function forceLogout(message) {
    sessionStorage.setItem('logout_message', message);
    await supabase.auth.signOut();
    window.location.href = '/';
}
