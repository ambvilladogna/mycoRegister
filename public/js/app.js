import { spinner } from "./components/spinner.js";


async function initializeApp() {
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve);
        });
    }
    try {
        spinner.init();
        spinner.startSpinner();
        // import all necessary modules dynamically
        const { OnlineService } = await import("./services/connection.js");
        const { Header } = await import("./components/header.js");
        const { Footer } = await import("./components/footer.js");
        const { AuthEvents } = await import("./services/auth/auth.events.js");
        const { AuthStorage } = await import("./services/auth/auth.storage.js");
        const { AuthService } = await import("./services/auth/auth.service.js");
        const { LoginComponent } = await import("./components/login.js");
        const { fungiSampleModel } = await import("./models/fungiSample.js");
        const { DatabaseService } = await import("./services/dbService.js");
        const { DbCrud } = await import("./services/dbCrud.js");
        const { FungiService } = await import("./services/fungiService.js");
        const { FungiSampleForm } = await import("./components/fungiSampleForm.js");
        const { FungiTableComponent } = await import("./components/fungiTable.js");

        // Create instances of services and components
        const connectionService = await new OnlineService();
        console.log('ConnectionService initialized');
        const authEvents = await new AuthEvents();
        const authStorage = await new AuthStorage();
        const authService = await AuthService.create({ connectionService, authStorage, authEvents });
        console.log('AuthService initialized');
        const loginComponent = await new LoginComponent({ authService, authEvents, connectionService });
        const dbService = await new DatabaseService({ fungiSampleModel, connectionService, authService, authEvents });
        console.log('DatabaseService instance created');
        await dbService.initializeLocalDB();
        const dbCrud = await new DbCrud({ dbService });
        console.log('db reference for CRUD operations created');
        const fungiService = await new FungiService({ authService, dbCrud, fungiSampleModel });
        console.log('FungiService instance created');
        const fungiSampleForm = await new FungiSampleForm({ fungiService, fungiSampleModel });
        console.log('FungiSampleForm component created');
        const fungiTableComponent = await new FungiTableComponent({ dbService, fungiService, fungiSampleModel, fungiSampleForm });
        await fungiTableComponent.init(authService.isAuthenticated());
        console.log('FungiTable component created');

        // Initialize components
        Header.init();
        console.log('Header initialized');
        Footer.init({ connectionService, authEvents, authService, dbService, dbCrud });
        console.log('Footer initialized');
        loginComponent.init();
        console.log('Login component initialized');

        spinner.stopSpinner();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        spinner.stopSpinner();
    }
}

initializeApp();