// Delete Account Modal component
import ModalUtils from '../utils/modal.js';

const deleteAccountModal = {
  constructor() {
    this.modal = null;
  },

  init: async function (session, authService, connectionService) {
    const self = this;
    this.modal = ModalUtils.create('Rimuovi Account', function (modalBody) {
      modalBody.innerHTML = `
          <div>    
              <div>
                  <p>Eseguendo questa azione</p>
                  <p>sarai scollegato e il tuo account</p>
                  <p>sarà rimosso permanentemente.</p>
                  <p>Dovrai registrarti di nuovo per poter accedere.</p>
                  <p>Conferma inserendo la password.</p>
              </div>    
              <br>
              <form autocomplete="off">
                  <div class="form-group">
                    <label for="password">Password:</label>
                    <div class="auth-password-field">
                      <input type="password" id="password" name="password" required autocomplete="off">
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
            const password = modalBody.querySelector('#password').value.trim();
            const messageDiv = modalBody.querySelector('#modal-message');
            messageDiv.textContent = '';
            messageDiv.className = 'modal-error';

            if (!password) {
              messageDiv.className = 'modal-error';
              messageDiv.textContent = 'Inserisci la password';
              return;
            }

            try {
              const { authUsers } = await import('../services/auth/auth.users.js');
              await authUsers.init({ authService, connectionService });
              const success = await authUsers.deleteAccount(session, password);
              if (success) {
                messageDiv.className = 'modal-success';
                messageDiv.textContent = 'Account rimosso.';
              } else {
                messageDiv.className = 'modal-error';
                messageDiv.textContent = "Errore durante la rimozione dell'account. Prova ancora.";
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
              self.modal.destroy();
              self.modal = null;
              await authService.handleLogout();
            } catch (error) {
              messageDiv.className = 'modal-error';
              messageDiv.textContent = error.message || "Errore durante la rimozione dell'account.";
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
        const passwordField = modalBody.querySelector('#password');
        const toggleBtn = passwordField.nextElementSibling;
        if (toggleBtn) {
          toggleBtn.addEventListener('click', async () => {
            if (passwordField.type === 'password') {
              passwordField.type = 'text';
              toggleBtn.textContent = 'Nascondi';
            } else {
              passwordField.type = 'password';
              toggleBtn.textContent = 'Mostra';
            }
          });
        }
      });
    });
  },

  show: async function (session, authService, connectionService) {
    if (!this.modal) await this.init(session, authService, connectionService);
    this.modal.show();
  }
};

export { deleteAccountModal };