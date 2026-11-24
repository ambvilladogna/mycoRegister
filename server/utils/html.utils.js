require('dotenv').config();

/**
 * Generate success message for verification email
 * @returns {string} - HTML content
 */
const generateEmalVerificationSuccessHTML = () => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .button { background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
        .footer { margin-top: 20px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Verifica il tuo indirizzo email</h2>
        <p>La tua email è stata verificata. Puoi accedere al 'Registro micologico di AMB Villa D'ogna' utilizzando il link qui sotto.</p>
        <p><a href="${process.env.BASE_URL}">Accedi a 'Registro micologico di AMB Villa D'ogna'</a></p>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate error message for verification email
 * @returns {string} - HTML content
 */
const generateEmalVerificationErrorHTML = () => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .button { background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
        .footer { margin-top: 20px; font-size: 12px; color: #777; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Verify Your Email Address</h2>
        <p>Your Email was not verified. Most likely the verification token  expired.</p>
        <p>You can try to register again using the link below.</p>
        <p><a href="${process.env.BASE_URL}">Register to mycoRegister</a></p>
      </div>
    </body>
    </html>
  `;
};

const generateResetPasswordFormHTML = (token) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reset Password</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
          .form-group { margin-bottom: 15px; position: relative; }
          label { display: block; margin-bottom: 5px; }
          input { width: 100%; padding: 8px 40px 8px 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
          button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #0056b3; }
          .error { color: red; margin-top: 10px; }
          .success { color: green; margin-top: 10px; }
          .auth-password-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #6c757d; font-size: 14px; padding: 4px; margin-top: 12px; }
          .auth-password-toggle:hover { color: #495057; }
        </style>
    </head>
    <body>
      <h2>Registro micologico di AMB Villa D'ogna</h2>
        <form id="resetForm" data-token="${token}">
          <div class="form-group">
            <label for="password">Nuova Password:</label>
            <input type="password" id="password" name="password" required minlength="8">
            <button type="button" id="toggle-password" class="auth-password-toggle">Mostra</button>
          </div>
          <div class="form-group">
            <label for="confirmPassword">Conferma Password:</label>
            <input type="password" id="confirmPassword" name="confirmPassword" required>
            <button type="button" id="toggle-confirmPassword" class="auth-password-toggle">Mostra</button>
          </div>
          <button type="submit">Reset Password</button>
        </form>
        <div id="message" class="error"></div>
      <script src="/api/auth/reset-form.js"></script>
    </body>
    </html>
    `;
};

const generateResetPasswordFormJS = () => {
  return `
    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const messageDiv = document.getElementById('message');
      const token = document.getElementById('resetForm').dataset.token;
      
      // Clear previous messages
      messageDiv.textContent = '';
      messageDiv.className = 'error';
      
      if (password !== confirmPassword) {
        messageDiv.textContent = 'Le password non corrispondono.';
        return;
      }
      
      if (password.length < 8) {
        messageDiv.textContent = 'La password deve essere almeno di 8 caratteri';
        return;
      }
      
      try {
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            token: token, 
            password: password 
          })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          messageDiv.className = 'success';
          messageDiv.textContent = 'Reset password completato. Ora puoi utilizzare la nuova password.';
          document.getElementById('resetForm').style.display = 'none';
        } else {
          messageDiv.textContent = result.error || 'Qualcosa è andato storto.';
        }
      } catch (error) {
        messageDiv.textContent = 'Errore di connessione.';
      }
    });

    // Function to toggle password visibility
    function togglePasswordVisibility(fieldId, buttonId) {
      const field = document.getElementById(fieldId);
      const button = document.getElementById(buttonId);
  
      if (field.type === 'password') {
        field.type = 'text';
        button.textContent = 'Nascondi';
      } else {
        field.type = 'password';
        button.textContent = 'Mostra';
      }
    }

    // Add event listeners for password toggle buttons
    document.getElementById('toggle-password').addEventListener('click', function(e) {
      e.preventDefault();
      togglePasswordVisibility('password', 'toggle-password');
    });

    document.getElementById('toggle-confirmPassword').addEventListener('click', function(e) {
      e.preventDefault();
      togglePasswordVisibility('confirmPassword', 'toggle-confirmPassword');
    });
  `;
};

module.exports = {
  generateEmalVerificationSuccessHTML,
  generateEmalVerificationErrorHTML,
  generateResetPasswordFormHTML,
  generateResetPasswordFormJS
};