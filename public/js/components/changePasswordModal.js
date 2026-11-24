// Change Password Modal component
import ModalUtils from '../utils/modal.js';

const changePasswordModal = {
  constructor() {
    this.modal = null;
  },

  init: async function (session, authService) {
    const self = this;
    this.modal = ModalUtils.create('Modifica Password', function (modalBody) {
      modalBody.innerHTML = `
          <div>    
              <form autocomplete="off">
                  <div class="form-group">
                    <label for="current-password">Password attuale:</label>
                    <div class="auth-password-field">
                      <input type="password" id="current-password" name="current-password" required autocomplete="off">
                      <button type="button" class="auth-password-toggle">Mostra</button>
                    </div>
                  </div>
                  <div></div>
                  <div class="form-group">
                    <label for="new-password">Nuova password:</label>
                    <div class="auth-password-field">
                      <input type="password" id="new-password" name="new-password" required minlength="8" autocomplete="new-password">
                      <button type="button" class="auth-password-toggle">Mostra</button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="confirm-password">Conferma nuova password:</label>
                    <div class="auth-password-field">
                      <input type="password" id="confirm-password" name="confirm-password" required minlength="8" autocomplete="new-password">
                      <button type="button" class="auth-password-toggle">Mostra</button>
                    </div>
                  </div>
                  <div class="btnColumn">
                      <button type="submit" class="btn primary maxWidth">Conferma</button>
                      <button type="button" id="cancel-btn" class="btn primary maxWidth">Annulla</button>
                  </div>    
              </form>
              <div id="modal-message"></div>
          </div>
          `;
      Promise.resolve().then(() => {
        const submitBtn = modalBody.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            const currentPassword = modalBody.querySelector('#current-password').value.trim();
            const newPassword = modalBody.querySelector('#new-password').value.trim();
            const confirmPassword = modalBody.querySelector('#confirm-password').value.trim();
            const messageDiv = modalBody.querySelector('#modal-message');
            messageDiv.textContent = '';
            messageDiv.className = 'modal-error';

            if (!currentPassword || !newPassword || !confirmPassword) {
              messageDiv.className = 'modal-error';
              messageDiv.textContent = 'Compila tutti i campi necessari.';
              return;
            }

            if (newPassword !== confirmPassword) {
              messageDiv.className = 'modal-error';
              messageDiv.textContent = 'Le password non corrispondono.';
              return;
            }

            try {
              const success = await authService.changePassword(session.username, currentPassword, newPassword);
              if (success) {
                messageDiv.className = 'modal-success';
                messageDiv.textContent = 'Password modificata';
                await new Promise(resolve => setTimeout(resolve, 2000));
                self.modal.destroy();
                self.modal = null;
              } else {
                messageDiv.className = 'modal-error';
                messageDiv.textContent = 'Errore durante la modifica della password. Prova ancora.';
              }
            } catch (error) {
              messageDiv.className = 'modal-error';
              messageDiv.textContent = error.message || 'Errore durante la modifica della password.';
            }
          });
        }
        const cancelBtn = modalBody.querySelector('#cancel-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', async () => {
            self.modal.destroy();
            self.modal = null;
          });
        }
        const passwordField = modalBody.querySelector('#current-password');
        const passwordToggleBtn = passwordField.nextElementSibling;
        if (passwordToggleBtn) {
          passwordToggleBtn.addEventListener('click', async () => {
            if (passwordField.type === 'password') {
              passwordField.type = 'text';
              passwordToggleBtn.textContent = 'Nascondi';
            } else {
              passwordField.type = 'password';
              passwordToggleBtn.textContent = 'Mostra';
            }
          });
        }
        const newPasswordField = modalBody.querySelector('#new-password');
        const newPasswordToggleBtn = newPasswordField.nextElementSibling;
        if (newPasswordToggleBtn) {
          newPasswordToggleBtn.addEventListener('click', async () => {
            if (newPasswordField.type === 'password') {
              newPasswordField.type = 'text';
              newPasswordToggleBtn.textContent = 'Nascondi';
            } else {
              newPasswordField.type = 'password';
              newPasswordToggleBtn.textContent = 'Mostra';
            }
          });
        }
        const confirmPasswordField = modalBody.querySelector('#confirm-password');
        const confirmPasswordToggleBtn = confirmPasswordField.nextElementSibling;
        if (confirmPasswordToggleBtn) {
          confirmPasswordToggleBtn.addEventListener('click', async () => {
            if (confirmPasswordField.type === 'password') {
              confirmPasswordField.type = 'text';
              confirmPasswordToggleBtn.textContent = 'Nascondi';
            } else {
              confirmPasswordField.type = 'password';
              confirmPasswordToggleBtn.textContent = 'Mostra';
            }
          });
        }
      });
    });
  },

  show: async function (session, authService) {
    if (!this.modal) await this.init(session, authService);
    this.modal.show();
  }
};

export { changePasswordModal };