import { supabase } from '../auth.js';

function showToast(msg, type = 'success') {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    // Fallback to alert which is overridden in core.js anyway
    alert(msg);
}

export function initSettings() {
    // Change Password
    const btnChangePassword = document.getElementById('btn-change-password');
    if (btnChangePassword) {
        btnChangePassword.addEventListener('click', async () => {
            try {
                btnChangePassword.disabled = true;
                btnChangePassword.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending link...';

                const { data: { user } } = await supabase.auth.getUser();
                if (!user || !user.email) throw new Error("No authenticated user found.");

                const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                    redirectTo: window.location.origin + '/reset-password.html'
                });

                if (error) throw error;
                
                showToast(`A password reset link has been sent to ${user.email}. Please check your inbox.`, 'success');
            } catch (err) {
                showToast(err.message, 'danger');
            } finally {
                btnChangePassword.disabled = false;
                btnChangePassword.innerHTML = '<i class="fas fa-key" style="margin-right: 0.5rem;"></i> Change Password';
            }
        });
    }

    // Add User (Owner only)
    const formAddUser = document.getElementById('form-add-user');
    if (formAddUser) {
        formAddUser.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('add-user-name').value.trim();
            const email = document.getElementById('add-user-email').value.trim();
            const submitBtn = formAddUser.querySelector('button[type="submit"]');

            if (!name || !email) return;

            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

                const { data, error } = await supabase.functions.invoke('admin-create-user', {
                    body: { full_name: name, email: email }
                });

                if (error) {
                    throw new Error(error.message || 'Failed to create user');
                }

                if (data && data.error) {
                    throw new Error(data.error);
                }

                // Success
                document.getElementById('modal-add-user').style.display = 'none';
                
                const tempPwdModal = document.getElementById('modal-temp-password');
                document.getElementById('temp-pwd-name').textContent = name;
                document.getElementById('temp-pwd-display').textContent = data.temporary_password;
                
                tempPwdModal.style.display = 'block';
                formAddUser.reset();

            } catch (err) {
                showToast(err.message, 'danger');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
            }
        });
    }
}
