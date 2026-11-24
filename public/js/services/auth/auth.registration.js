// uses /js/services/connection.js';
// uses /js/services/auth/auth.events.js';

class AuthRegistration {
    constructor(config) {
        this.connectionService = config.connectionService;
        this.authEvents = config.authEvents;
        this.API_BASE_URL = '/api/auth';
    }

    async handleRegistration(name, email, password) {
        // Dispatch logout start event
        this.authEvents.dispatch('auth:registration-start');

        try {
            // Only attempt to contact server if online
            if (this.connectionService.online()) {
                // Call logout API to invalidate the token on server
                const response = await fetch(`${this.API_BASE_URL}/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: name,
                        email: email,
                        password: password
                    })
                });
                const msg = (await response.json()).message;
                if (response.status === 201) {
                    this.authEvents.dispatch('auth:registration-success', { message: msg });
                    return true;
                }
                else {
                    this.authEvents.dispatch('auth:registration-failed', { error: msg });
                    return false;
                }
            } else {
                this.authEvents.dispatch('auth:registration-failed', { error: 'Richiesta registrazione fallita. Non sei online.' });
                return false;
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.authEvents.dispatch('auth:registration-failed', { error: error.message });
            return true;
        }
    }
}

// Module exports
export { AuthRegistration };