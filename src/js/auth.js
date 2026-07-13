import { createClient } from '@supabase/supabase-js';
import { initSessionManager } from './modules/sessionManager.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

// Expose supabase to window if needed by other non-module scripts
window.supabase = supabase;

document.addEventListener("DOMContentLoaded", async () => {
    // Check for session timeout messages
    const msg = sessionStorage.getItem('logout_message');
    if (msg) {
        sessionStorage.removeItem('logout_message');
        const errorMsg = document.getElementById('error-message');
        if (errorMsg) {
            errorMsg.textContent = msg;
            errorMsg.style.display = 'block';
            errorMsg.style.color = 'var(--warning)';
        } else {
            alert(msg);
        }
    }

    await checkAuthentication();
    
    // Bind login form if it exists
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

async function checkAuthentication() {
    const { data: { session }, error } = await supabase.auth.getSession();
    const isLoginPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
    const isDashboardPage = window.location.pathname.endsWith('/dashboard.html') || window.location.pathname === 'dashboard.html';
    const isStaffPage = window.location.pathname.endsWith('/staff_dashboard.html') || window.location.pathname === 'staff_dashboard.html';

    if (!session && !isLoginPage) {
        // Allow access to reset-password page if recovering
        if (window.location.pathname.endsWith('/reset-password.html')) return;
        window.location.href = '/';
        return;
    }
    
    if (session) {
        // Enforce password change
        if (session.user.user_metadata?.must_change_password) {
            if (!window.location.pathname.endsWith('/reset-password.html')) {
                window.location.href = '/reset-password.html';
            }
            return;
        }

        if (window.location.pathname.endsWith('/reset-password.html')) {
            // Logged in and no password change required, don't force them out immediately
            // but let them stay on reset password if they want, or maybe we redirect?
            // Actually, if they don't need to change password, and they land on reset-password, let them change it manually.
        }
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role, full_name')
            .eq('user_id', session.user.id)
            .single();
            
        const role = profile?.role || 'staff';
        const fullName = profile?.full_name || (role === 'owner' ? 'Admin User' : 'Staff Member');
        
        // Initialize session timeouts
        initSessionManager(role, session);
        
        // Update greeting in the UI if we are on a dashboard page
        const titleEl = document.getElementById('topbar-title');
        if (titleEl) {
            titleEl.textContent = `Hi, ${fullName}`;
        }
        
        if (role === 'staff' && (isDashboardPage || isLoginPage)) {
            window.location.href = '/staff_dashboard.html';
        } else if (role === 'owner' && (isStaffPage || isLoginPage)) {
            window.location.href = '/dashboard.html';
        }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');
    
    // Disable button to prevent multiple submissions
    const btn = document.querySelector('button[type="submit"]');
    if(btn) btn.disabled = true;

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });
    
    if (error) {
        errorMsg.textContent = error.message;
        errorMsg.style.display = 'block';
        if(btn) btn.disabled = false;
    } else {
        if (data.user.user_metadata?.must_change_password) {
            window.location.href = '/reset-password.html';
            return;
        }

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('user_id', data.user.id)
            .single();
        const role = profile?.role || 'staff';
        if (role === 'staff') {
            window.location.href = '/staff_dashboard.html';
        } else {
            window.location.href = '/dashboard.html';
        }
    }
}

window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/';
};
