// pwa-registration.js - Service Worker registration and update handling

// Check if service worker is supported
if ('serviceWorker' in navigator) {
    console.log('PWA starting...');
    window.addEventListener('load', () => {
        registerServiceWorker();
    });
} else {
    console.warn('Service Worker not supported in this browser');
}

let refreshing = false;
let registration = null;

async function registerServiceWorker() {
    try {
        registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered with scope:', registration.scope);

        // Set up update handling
        setupUpdateHandling(registration);

        // Start periodic update checks
        startPeriodicUpdateChecks(registration);

        // Check for updates immediately after registration
        setTimeout(() => checkForUpdates(registration), 1000);

        return registration;
    } catch (error) {
        console.error('Service Worker registration failed:', error);
    }
}

function setupUpdateHandling(registration) {
    // Listen for controller change once
    let hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        updatePromptShown = false;
        updateAvailable = false;

        if (refreshing) return;


        // Only reload if we had a controller before (i.e., this is an update, not first install)
        if (hadController) {
            refreshing = true;
            console.log('Service Worker updated, reloading...');
            showUpdateAppliedMessage();
            setTimeout(() => window.location.reload(), 1500);
        } else {
            console.log('Service Worker installed for first time, no reload needed');
        }
    });

    // Check if there's an update waiting right now
    if (registration.waiting) {
        promptUserToUpdate(registration);
    }

    // Listen for updates found later
    registration.addEventListener('updatefound', () => {
        console.log('Service Worker found an update');
        const newWorker = registration.installing;

        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New update available
                promptUserToUpdate(registration);
            }
        });
    });
}

// Periodic update checks - essential for WebKit browsers
function startPeriodicUpdateChecks(registration) {
    // Check for updates every 300 seconds while app is active
    const updateInterval = setInterval(() => {
        if (document.hidden) return; // Don't check when tab is hidden

        checkForUpdates(registration);
    }, 300000);

    // Check when user returns to tab
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkForUpdates(registration);
        }
    });

    // Check when user focuses the window
    window.addEventListener('focus', () => {
        checkForUpdates(registration);
    });

    // Clean up interval when page unloads
    window.addEventListener('beforeunload', () => {
        clearInterval(updateInterval);
    });
}

// Active update checking
async function checkForUpdates(registration) {
    try {
        console.log('Checking for service worker updates...');
        await registration.update();
        // console.log('Update check completed');
    } catch (error) {
        console.error('Update check failed:', error);
    }
}

let updatePromptShown = false;
let updateAvailable = false;

function promptUserToUpdate(registration) {
    // Prevent duplicate prompts
    if (updatePromptShown) return;

    updatePromptShown = true;
    updateAvailable = true;

    // Remove any existing update banner
    const existingBanner = document.getElementById('update-banner');
    if (existingBanner) existingBanner.remove();

    // Create update notification
    const updateBanner = document.createElement('div');
    updateBanner.id = 'update-banner';
    updateBanner.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            text-align: center;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
            <span>🚀 Nuova versione disponibile!</span>
            <div>
                <button id="update-now" style="
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-left: 10px;
                    font-size: 14px;
                ">Aggiorna ora</button>
                <button id="update-later" style="
                    background: transparent;
                    border: none;
                    color: rgba(255,255,255,0.8);
                    cursor: pointer;
                    margin-left: 10px;
                    font-size: 14px;
                ">Più tardi</button>
            </div>
        </div>
    `;

    document.body.prepend(updateBanner);

    // Handle update now
    document.getElementById('update-now').onclick = () => {
        performUpdate(registration);
        updateBanner.remove();
        updatePromptShown = false; // Reset for next update cycle
        updateAvailable = false;
    };

    // Handle update later
    document.getElementById('update-later').onclick = () => {
        updateBanner.remove();
        updatePromptShown = false; // Reset the flag
        // Ask again in 5 minutes only if update is still available
        setTimeout(() => {
            if (updateAvailable) promptUserToUpdate(registration);
        }, 5 * 60 * 1000);
    };

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
        if (updateBanner.parentNode) {
            updateBanner.remove();
            updatePromptShown = false; // Reset the flag
            // Ask again in 2 minutes only if update is still available
            setTimeout(() => {
                if (updateAvailable) promptUserToUpdate(registration);
            }, 2 * 60 * 1000);
        }
    }, 30000);
}

function performUpdate(registration) {
    if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
        console.log('No update available to apply');
        // Force a check and reload if needed
        checkForUpdates(registration).then(() => {
            setTimeout(() => window.location.reload(), 1000);
        });
    }
}

function showUpdateAppliedMessage() {
    const message = document.createElement('div');
    message.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        ">
            ✅ Aggiornamento applicato!
        </div>
    `;
    document.body.appendChild(message);

    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, 3000);
}

// Expose functions for manual control
window.mycoRegisterPWA = {
    checkForUpdates: () => registration && checkForUpdates(registration),
    forceUpdate: () => registration && performUpdate(registration),
    getRegistration: () => registration
};