// Footer component
// uses /js/services/connection.js';
// uses /js/services/auth/auth.events.js';
// uses /js/services/auth/auth.service.js';

import { spinner } from './spinner.js';

// The following line is modified by the build process.
const version = __APP_VERSION__;

async function showUserProfile(authService, connectionService, dbService) {
  const { userProfileModal } = await import('./userProfileModal.js');
  userProfileModal.show(authService, connectionService, dbService);
}

const Footer = {
  // Initialize footer
  init: function (config) {
    const connectionService = config.connectionService;
    const authEvents = config.authEvents;
    const authService = config.authService;
    const dbService = config.dbService;
    const footerContainer = document.getElementById('footer-container');
    if (!footerContainer) return;

    // Create footer content
    const footer = document.createElement('footer');
    footer.className = 'app-footer';
    footer.innerHTML = `
        <div class="footer-content">
          <div class="copyright">
            <p class="full-copyright-text">
              mycoRegister ${version} - Made by <a href="https://github.com/quackmore">quackmore</a> with <a href="https://claude.ai">claude.ai</a>
            </p>
            <div class="copyright-mobile">
              i
              <div class="tooltip">
                <p>mycoRegister ${version}</p>
                <p>Made by <a href="https://github.com/quackmore">quackmore</a> with <a href="https://claude.ai">claude.ai</a></p>
              </div>
            </div>
          </div>

          <div class="connection-status">
            <span id="sync-offline" class="sync-offline">
              <span class="sync-offline-text"></span>
            </span>
            <span id="sync-status" class="sync-status">
              <span class="status-text"></span>
            </span>
            <span id="connection-indicator" class="online">Online</span>
            <button id="user-profile-btn" class="btn secondary">User Profile</button>
          </div>
        </div>
      `;

    // Insert footer into container
    footerContainer.appendChild(footer);

    // Initialize
    this.initConnectionStatus(connectionService);
    this.initSyncStatus(dbService);
    this.initSyncOffline(authService, authEvents);
    this.initUserProfileBtn(authService, authEvents, connectionService, dbService);
  },

  initConnectionStatus: function (connectionService) {
    const connectionIndicator = document.getElementById('connection-indicator');
    if (!connectionIndicator) return;

    // checkout connection status at startup in case events were missed
    if (connectionService.online()) {
      connectionIndicator.textContent = 'Online';
      connectionIndicator.className = 'online';
    }
    else {
      connectionIndicator.textContent = 'Offline';
      connectionIndicator.className = 'offline';
    }

    connectionService.on('online', () => {
      connectionIndicator.textContent = 'Online';
      connectionIndicator.className = 'online';
    });

    connectionService.on('offline', () => {
      connectionIndicator.textContent = 'Offline';
      connectionIndicator.className = 'offline';
    });
  },

  initSyncStatus: async function (dbService) {
    const syncStatus = document.getElementById('sync-status');
    if (!syncStatus) return;
    const statusText = syncStatus.querySelector('.status-text');
    if (!statusText) return;

    statusText.textContent = '';
    syncStatus.classList.remove('active');

    dbService.addEventListener('sync:state-changed', (event) => {
      const { newState } = event.detail;
      switch (newState) {
        case 'change':
          statusText.textContent = 'Sinc.';
          syncStatus.classList.add('active');
          spinner.startSpinner();
          break;
        case 'error':
          statusText.textContent = 'Err. sinc.';
          syncStatus.classList.add('active');
          spinner.stopSpinner();
          break;
        default:
          statusText.textContent = '';
          syncStatus.classList.remove('active');
          spinner.stopSpinner();
          break;
      }
    });

    dbService.addEventListener('sync:change', (event) => {
      const { info } = event.detail;
      if (!info || !info.change) return;
      if (info.direction === 'pull') {
        statusText.textContent = `Sinc. ${Math.floor(info.change.docs_written / (info.change.docs_written + info.change.pending) * 100)}%`;
      }
    });
  },

  initSyncOffline: function (authService, authEvents) {
    const syncOffline = document.getElementById('sync-offline');
    if (!syncOffline) return;
    const syncOfflineText = syncOffline.querySelector('.sync-offline-text');
    if (!syncOfflineText) return;

    syncOfflineText.textContent = 'Sinc.';
    syncOffline.style.textDecoration = 'line-through';
    if (authService.isSyncOnline()) {
      syncOffline.classList.remove('active');
    } else {
      if (authService.isAuthenticated()) {
        syncOffline.classList.add('active');
      }
    }
    authEvents.on(authEvents.eventTypes.SYNC_OFFLINE, async () => {
      if (authService.isAuthenticated()) {
        syncOffline.classList.add('active');
      }
    });
    authEvents.on(authEvents.eventTypes.SYNC_ONLINE, async () => {
      syncOffline.classList.remove('active');
    });
  },

  initUserProfileBtn: function (authService, authEvents, connectionService, dbService) {
    const userProfileBtn = document.getElementById('user-profile-btn');
    userProfileBtn.style.display = "none";
    userProfileBtn.addEventListener('click', () => showUserProfile(authService, connectionService, dbService));

    if (authService.isAuthenticated()) {
      authService.getSessionInfo().then(session => {
        userProfileBtn.innerHTML = session.username;
        userProfileBtn.style.display = "inline-block";
      });
    }

    authEvents.on(authEvents.eventTypes.AUTHENTICATED, async () => {
      const session = await authService.getSessionInfo();
      userProfileBtn.innerHTML = session.username;
      userProfileBtn.style.display = "inline-block";
    });
    authEvents.on(authEvents.eventTypes.UNAUTHENTICATED, async () => {
      userProfileBtn.style.display = "none";
    });
  }
};

export { Footer };