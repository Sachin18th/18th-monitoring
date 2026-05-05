// Endpoint: /i/server
import { handleServerIngest } from '../controllers/server.controller';

export const serverRoutes = (router: any) => {
    // Scaffold route binding
    router.post('/i/server', handleServerIngest);
<<<<<<< HEAD
};

=======
};
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
