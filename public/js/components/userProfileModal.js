// User Profile Modal component
import ModalUtils from '../utils/modal.js';
import { listSpeciesModal } from './listSpeciesModal.js';
import { changePasswordModal } from './changePasswordModal.js';
import { deleteAccountModal } from './deleteAccountModal.js';

const userProfileModal = {
  constructor(config) {
    this.modal = null;
  },

  init: async function (authService, connectionService, dbService, dbCrud) {
    const session = await authService.getSessionInfo();
    const self = this;
    this.modal = ModalUtils.create('Profilo utente', function (modalBody) {
      modalBody.innerHTML = `
          <div>    
              <p>Nome utente: ${session.username}</p>
              <p>Email: ${session.email}</p>
              <div id="admin-keys" class="hidden">
                  <p>Ruolo: ${session.role}</p>
              </div>
              <br>
              <hr>
              <br>
              <div class="btnColumn">
                  <div id="admin-actions" class="btnColumn maxWidth hidden">
                      <button id="manage-allowed-btn" class="btn primary maxWidth">Gestisci le autorizzazioni</button>
                      <button id="storage-info-btn" class="btn primary maxWidth">Storage info</button>
                      <button id="get-db-perf-reccom-btn" class="btn primary maxWidth">DB performance</button>
                      <button id="db-compact-btn" class="btn primary maxWidth">DB compact</button>
                  </div>
                  <button id="list-species-btn" class="btn primary maxWidth">Estrai elenco specie</button>
                  <button id="change-password-btn" class="btn primary maxWidth">Modifica Password</button>
                  <button id="logout-btn" class="btn primary maxWidth">Esci</button>
                  <br>
                  <a href="#" id="delete-account">Rimuovi account</a>
              </div>    
          </div>    
          `;
      Promise.resolve().then(() => {
        const listSpeciesdBtn = modalBody.querySelector('#list-species-btn');
        if (listSpeciesdBtn) {
          listSpeciesdBtn.addEventListener('click', async () => {
            listSpeciesModal.show(dbCrud);
          });
        }
        const changePasswordBtn = modalBody.querySelector('#change-password-btn');
        if (changePasswordBtn) {
          changePasswordBtn.addEventListener('click', async () => {
            changePasswordModal.show(session, authService);
          });
        }
        const logoutBtn = modalBody.querySelector('#logout-btn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', () => {
            authService.handleLogout()
            self.modal.destroy();
            self.modal = null;
          });
        }
        const deleteAccountBtn = modalBody.querySelector('#delete-account');
        if (deleteAccountBtn) {
          deleteAccountBtn.addEventListener('click', async () => {
            await deleteAccountModal.show(session, authService, connectionService);
            self.modal.destroy();
            self.modal = null;
          });
        }
        if (session.role === 'admin') {
          const adminKeys = modalBody.querySelector('#admin-keys');
          if (adminKeys) {
            adminKeys.classList.remove('hidden');
          } else {
            console.error('Admin keys section not found in modal!');
          }
          const adminActions = modalBody.querySelector('#admin-actions');
          if (adminActions) {
            adminActions.classList.remove('hidden');
          } else {
            console.error('Admin actions section not found in modal!');
          }
          const manageAllowedBtn = modalBody.querySelector('#manage-allowed-btn');
          if (manageAllowedBtn) {
            manageAllowedBtn.addEventListener('click', async () => {
              document.getElementById('app-container').classList.add('hidden');
              document.getElementById('admin-container').classList.remove('hidden');
              try {
                const { allowedEmailTableComponent } = await import('./allowedEmailTable.js')
                await allowedEmailTableComponent.init(authService, connectionService);
                console.log('allowedEmailTable module loaded and ready!');
              } catch (error) {
                console.error('Error loading allowedEmailTable module:', error);
              };
              self.modal.destroy();
              self.modal = null;
            });
          }
          const storageInfoBtn = modalBody.querySelector('#storage-info-btn');
          if (storageInfoBtn) {
            storageInfoBtn.addEventListener('click', async () => {
              const storageEstimates = await dbService.getStorageEstimate();
              alert(`DB Storage Estimates:\n${JSON.stringify(storageEstimates)}`);
              console.log('DB Storage Estimates:', storageEstimates);
            });
          }
          const getDbPerfReccomBtn = modalBody.querySelector('#get-db-perf-reccom-btn');
          if (getDbPerfReccomBtn) {
            getDbPerfReccomBtn.addEventListener('click', async () => {
              const reccomendations = await dbService.getPerformanceRecommendations();
              alert(`DB Performance Recommendations:\n${JSON.stringify(reccomendations)}`);
              console.log('DB Performance Recommendations:', reccomendations);
            });
          }
          const dbCompactBtn = modalBody.querySelector('#db-compact-btn');
          if (dbCompactBtn) {
            dbCompactBtn.addEventListener('click', async () => {
              try {
                await dbService.compactDatabase();
                alert('Database compattato con successo.');
              } catch (error) {
                alert(`Errore durante la compattazione del database: ${error.message}`);
              }
            });
          }
        }
      });
    });
  },

  show: async function (authService, connectionService, dbService, dbCrud) {
    if (!this.modal) await this.init(authService, connectionService, dbService, dbCrud);
    this.modal.show();
  }
};

export { userProfileModal };