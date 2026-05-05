import crypto from 'crypto';

/**
 * VaultService (Secure Credential Management)
 * 
 * In a real production environment, this would interface with AWS KMS, HashiCorp Vault, or Azure KeyVault.
 * For this implementation, we use a local AES-256-GCM implementation.
 */
export class VaultService {
    private static readonly ALGORITHM = 'aes-256-gcm';
    private static readonly ENCRYPTION_KEY = process.env.VAULT_MASTER_KEY || 'default-32-byte-master-key-must-be-safe-!@#';
    
    /**
     * Encrypts a sensitive credential object.
     */
    static encrypt(data: Record<string, any>): string {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.ALGORITHM, Buffer.from(this.ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
        
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();

        return Buffer.concat([iv, tag, encrypted]).toString('base64');
    }

    /**
     * Decrypts a vault string back into a credential object.
     */
    static decrypt(encryptedData: string): Record<string, any> {
        const payload = Buffer.from(encryptedData, 'base64');
        
        const iv = payload.subarray(0, 12);
        const tag = payload.subarray(12, 28);
        const text = payload.subarray(28);

        const decipher = crypto.createDecipheriv(this.ALGORITHM, Buffer.from(this.ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
        decipher.setAuthTag(tag);

        const decrypted = decipher.update(text) + decipher.final('utf8');
        return JSON.parse(decrypted);
    }
}
