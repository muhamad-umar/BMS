/**
 * auth.js
 * Basic security checks for the frontend.
 * Ensures the user is logged in before accessing protected pages.
 */

document.addEventListener("DOMContentLoaded", () => {
    checkAuthentication();
});

function checkAuthentication() {
    // We are simply checking localStorage for a mock token.
    // In production with Supabase, this will check supabase.auth.getSession()
    const token = localStorage.getItem('bms_auth_token');
    const isLoginPage = window.location.pathname.includes('login.html');

    if (!token && !isLoginPage) {
        // Not logged in, trying to access a protected page
        window.location.href = 'login.html';
    } else if (token && isLoginPage) {
        // Already logged in, trying to access login page
        window.location.href = 'index.html';
    }
}

function logout() {
    localStorage.removeItem('bms_auth_token');
    window.location.href = 'login.html';
}
