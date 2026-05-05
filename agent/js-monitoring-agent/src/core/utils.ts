export const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const getDeviceMetadata = () => {
    return {
        userAgent: navigator.userAgent,
        screenSize: \x\,
        language: navigator.language,
        timestamp: new Date().toISOString()
    };
<<<<<<< HEAD
};
=======
};
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
