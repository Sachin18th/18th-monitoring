import { generateUUID } from './utils';

export const sessionManager = {
    sessionId: '',
    userId: '',

    init() {
        // Securely leveraging sessionStorage isolating mapping per tab/window instance natively
        let sid = sessionStorage.getItem('kpi_sid');
        if (!sid) {
            sid = generateUUID();
            sessionStorage.setItem('kpi_sid', sid);
        }
        this.sessionId = sid;

        // Extract native authenticated properties
        const uid = localStorage.getItem('kpi_uid');
        if (uid) this.userId = uid;
    },

    updateUser(userId: string) {
        this.userId = userId;
        localStorage.setItem('kpi_uid', userId);
    }
};
