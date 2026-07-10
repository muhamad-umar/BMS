import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

// Expose supabase to window if needed by other non-module scripts
window.supabase = supabase;

document.addEventListener("DOMContentLoaded", async () => {
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
    const isDashboardPage = window.location.pathname.endsWith('dashboard.html');
    const isStaffPage = window.location.pathname.endsWith('staff_dashboard.html');

    if (!session && !isLoginPage) {
        window.location.href = '/';
        return;
    }
    
    if (session) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
            
        const role = profile?.role || 'staff';
        
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
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', data.user.id)
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
