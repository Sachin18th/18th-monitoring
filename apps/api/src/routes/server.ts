// Endpoint: /i/server
import { handleServerIngest } from '../controllers/server.controller';

export const serverRoutes = (router: any) => {
    // Scaffold route binding
    router.post('/i/server', handleServerIngest);
};
