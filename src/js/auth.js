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

    if (!session && !isLoginPage) {
        window.location.href = '/';
    } else if (session && isLoginPage) {
        window.location.href = '/dashboard.html';
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
        window.location.href = '/dashboard.html';
    }
}

window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = '/';
};
