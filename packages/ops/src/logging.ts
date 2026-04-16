export const Logger = {
    info(msg: string, ctx?: any) {
        // TODO: Replace cleanly substituting Pino logging JSON mappings natively
        console.log([INFO] \ - \, ctx ? JSON.stringify(ctx) : '');
    },
    error(msg: string, err?: any, ctx?: any) {
        console.error([ERROR] \ - \, err?.message || err, ctx ? JSON.stringify(ctx) : '');
    },
    warn(msg: string, ctx?: any) {
        console.warn([WARN] \ - \, ctx ? JSON.stringify(ctx) : '');
    }
};
