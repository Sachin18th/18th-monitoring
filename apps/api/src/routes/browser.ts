// Endpoint: /i/browser
import { handleBrowserIngest } from '../controllers/browser.controller';

export const browserRoutes = (router: any) => {
    // Scaffold route binding
    router.post('/i/browser', handleBrowserIngest);
};
