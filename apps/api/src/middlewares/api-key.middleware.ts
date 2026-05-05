// import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
// import crypto from 'crypto';
// import { ResponseUtil } from '../utils/response';
// import { GovernanceService } from '../services/governance.service';
// import { AuditService } from '../services/audit.service';

// /**
//  * Robust API Key Authentication Middleware for the Exposure Layer.
//  * Supports prefix-based lookups, secret hashing validation, and scope verification.
//  * 
//  * @param requiredScopes - List of scopes required to access the endpoint.
//  */
// export const apiKeyAuth = (requiredScopes: string[] = []) => {
//     return async (req: any, reply: any) => {
//         const apiKey = req.headers['x-api-key'];
//         const traceId = req.id as string;

//         if (!apiKey) {
//             return reply.code(401).send(ResponseUtil.error([{ 
//                 code: 'UNAUTHORIZED_MISSING_KEY', 
//                 message: 'Missing required X-API-KEY header.' 
//             }], traceId));
//         }

//         // Formats supported: "prefix.secret"
//         const parts = String(apiKey).split('.');
//         if (parts.length !== 2) {
//             return reply.code(401).send(ResponseUtil.error([{ 
//                 code: 'UNAUTHORIZED_INVALID_FORMAT', 
//                 message: 'Invalid API Key format. Expected [prefix].[secret]' 
//             }], traceId));
//         }

//         const [prefix, secret] = parts;
//         let foundKey: any = null;
//         let foundSiteId: string = '';

//         // Optimized lookup across tenant isolation boundaries (simulated via Map iteration)
//         for (const [siteId, keys] of GlobalMemoryStore.projectAccessKeys.entries()) {
//             const key = keys.find((k: any) => k.prefix === prefix && k.status === 'active');
//             if (key) {
//                 foundKey = key;
//                 foundSiteId = siteId;
                
//                 // Find Tenant ID for this project
//                 const project = GlobalMemoryStore.projects.get(siteId);
//                 if (project) {
//                     req.tenantId = project.tenantId;
//                 }
                
//                 break;
//             }
//         }

//         if (!foundKey) {
//             await AuditService.log({ action: 'API_AUTH_FAILURE', actorId: 'anonymous', status: 'FAILURE', metadata: { reason: 'Key not found', prefix, traceId } });
//             return reply.code(401).send(ResponseUtil.error([{ 
//                 code: 'UNAUTHORIZED_KEY_NOT_FOUND', 
//                 message: 'The provided API Key prefix does not exist or the key is inactive.' 
//             }], traceId));
//         }

//         // Automated Abuse Detection
//         if (GovernanceService.isSuspicious(foundKey.id)) {
//             await AuditService.log({ action: 'API_KEY_SUSPENDED', actorId: 'system', targetId: foundKey.id, status: 'SUCCESS', metadata: { reason: 'Automated abuse detection triggered' } });
//             return reply.code(403).send(ResponseUtil.error([{
//                 code: 'ACCOUNT_SUSPENDED',
//                 message: 'This API key has been temporarily suspended due to suspicious activity patterns.'
//             }], traceId));
//         }

//         // Cryptographic verification of the secret
//         const [salt, hash] = foundKey.secretHash.split(':');
//         try {
//             const derivedBuffer = crypto.scryptSync(secret, salt, 64);
//             const derivedHash = derivedBuffer.toString('hex');
            
//             // Constant-time comparison to prevent timing attacks
//             if (!crypto.timingSafeEqual(Buffer.from(derivedHash), Buffer.from(hash))) {
//                 return reply.code(401).send(ResponseUtil.error([{ 
//                     code: 'UNAUTHORIZED_INVALID_SECRET', 
//                     message: 'API Key authentication failed: Secret mismatch.' 
//                 }], traceId));
//             }
//         } catch (err) {
//              return reply.code(500).send(ResponseUtil.error([{ 
//                 code: 'AUTH_PROCESSING_ERROR', 
//                 message: 'Internal error during authentication processing.' 
//             }], traceId));
//         }

//         // Granular Scope Authorization
//         if (requiredScopes.length > 0) {
//             const keyScopes = foundKey.scopes || [];
//             const hasRequiredScopes = requiredScopes.every(scope => keyScopes.includes(scope));
            
//             if (!hasRequiredScopes) {
//                 return reply.code(403).send(ResponseUtil.error([{ 
//                     code: 'FORBIDDEN_INSUFFICIENT_SCOPES', 
//                     message: `This API Key lacks the required scopes: ${requiredScopes.join(', ')}.` 
//                 }], traceId));
//             }
//         }

//         // IP Whitelisting / CIDR restriction
//         const clientIp = req.ip;
//         // Simple 0.0.0.0/0 check (MVP)
//         const allowedIps = foundKey.allowedIps || [];
//         if (allowedIps.length > 0 && !allowedIps.includes('0.0.0.0/0')) {
//             if (!allowedIps.includes(clientIp)) {
//                 return reply.code(403).send(ResponseUtil.error([{ 
//                     code: 'FORBIDDEN_IP_RESTRICTED', 
//                     message: `This API Key is restricted to specific IP addresses. Your IP: ${clientIp}` 
//                 }], traceId));
//             }
//         }

//         // Attach Secure Context for downstream handlers
//         req.user = {
//             id: foundKey.id,
//             name: foundKey.label,
//             role: 'API_CLIENT',
//             scopes: foundKey.scopes,
//             tenantId: req.tenantId, // Ensure tenantId is present
//             assignedProjects: [foundSiteId],
//             isVip: foundKey.isVip || false
//         };
//         req.siteId = foundSiteId;
//         req.authMode = 'API_KEY';
        
//         // Audit Key Usage
//         foundKey.lastUsedAt = new Date().toISOString();
        
//         console.log(`[AUTH] API Key "${foundKey.label}" authenticated for project ${foundSiteId}.`);
//     };
// };


import { prisma } from '@kpi-platform/db';
import crypto from 'crypto';
import { ResponseUtil } from '../utils/response';
import { GovernanceService } from '../services/governance.service';
import { AuditService } from '../services/audit.service';

/**
 * Robust API Key Authentication Middleware for the Exposure Layer.
 * Supports prefix-based lookups, secret hashing validation, and scope verification.
 * 
 * @param requiredScopes - List of scopes required to access the endpoint.
 */
export const apiKeyAuth = (requiredScopes: string[] = []) => {
    return async (req: any, reply: any) => {
        const apiKey = req.headers['x-api-key'];
        const traceId = req.id as string;

        if (!apiKey) {
            return reply.code(401).send(ResponseUtil.error([{ 
                code: 'UNAUTHORIZED_MISSING_KEY', 
                message: 'Missing required X-API-KEY header.' 
            }], traceId));
        }

        // Formats supported: "prefix.secret"
        const parts = String(apiKey).split('.');
        if (parts.length !== 2) {
            return reply.code(401).send(ResponseUtil.error([{ 
                code: 'UNAUTHORIZED_INVALID_FORMAT', 
                message: 'Invalid API Key format. Expected [prefix].[secret]' 
            }], traceId));
        }

        const [prefix, secret] = parts;
        let foundKey: any = null;
        let foundSiteId: string = '';

        // Query database for the API key by prefix
        const key = await prisma.projectAccessKey.findFirst({
            where: { label: prefix, status: 'ACTIVE' },
            select: {
                id: true,
                label: true,
                keyHash: true,
                scopes: true,
                allowedIps: true,
                isVip: true,
                projectId: true
            }
        });

        if (!key) {
            await AuditService.log({ action: 'API_AUTH_FAILURE', actorId: 'anonymous', status: 'FAILURE', metadata: { reason: 'Key not found', prefix, traceId } });
            return reply.code(401).send(ResponseUtil.error([{ 
                code: 'UNAUTHORIZED_KEY_NOT_FOUND', 
                message: 'The provided API Key prefix does not exist or the key is inactive.' 
            }], traceId));
        }

        foundKey = key;
        foundSiteId = key.projectId;

        // Get project details for tenant info
        const project = await prisma.project.findUnique({
            where: { id: foundSiteId },
            select: { tenantId: true }
        });

        if (project) {
            req.tenantId = project.tenantId;
        }

        // Automated Abuse Detection
        if (GovernanceService.isSuspicious(foundKey.id)) {
            await AuditService.log({ action: 'API_KEY_SUSPENDED', actorId: 'system', targetId: foundKey.id, status: 'SUCCESS', metadata: { reason: 'Automated abuse detection triggered' } });
            return reply.code(403).send(ResponseUtil.error([{
                code: 'ACCOUNT_SUSPENDED',
                message: 'This API key has been temporarily suspended due to suspicious activity patterns.'
            }], traceId));
        }

        // Cryptographic verification of the secret
        const [salt, hash] = foundKey.keyHash.split(':');
        try {
            const derivedBuffer = crypto.scryptSync(secret, salt, 64);
            const derivedHash = derivedBuffer.toString('hex');
            
            // Constant-time comparison to prevent timing attacks
            if (!crypto.timingSafeEqual(Buffer.from(derivedHash), Buffer.from(hash))) {
                return reply.code(401).send(ResponseUtil.error([{ 
                    code: 'UNAUTHORIZED_INVALID_SECRET', 
                    message: 'API Key authentication failed: Secret mismatch.' 
                }], traceId));
            }
        } catch (err) {
             return reply.code(500).send(ResponseUtil.error([{ 
                code: 'AUTH_PROCESSING_ERROR', 
                message: 'Internal error during authentication processing.' 
            }], traceId));
        }

        // Granular Scope Authorization
        if (requiredScopes.length > 0) {
            const keyScopes = foundKey.scopes || [];
            const hasRequiredScopes = requiredScopes.every(scope => keyScopes.includes(scope));
            
            if (!hasRequiredScopes) {
                return reply.code(403).send(ResponseUtil.error([{ 
                    code: 'FORBIDDEN_INSUFFICIENT_SCOPES', 
                    message: `This API Key lacks the required scopes: ${requiredScopes.join(', ')}.` 
                }], traceId));
            }
        }

        // IP Whitelisting / CIDR restriction
        const clientIp = req.ip;
        const allowedIps = foundKey.allowedIps || [];
        if (allowedIps.length > 0 && !allowedIps.includes('0.0.0.0/0')) {
            if (!allowedIps.includes(clientIp)) {
                return reply.code(403).send(ResponseUtil.error([{ 
                    code: 'FORBIDDEN_IP_RESTRICTED', 
                    message: `This API Key is restricted to specific IP addresses. Your IP: ${clientIp}` 
                }], traceId));
            }
        }

        // Attach Secure Context for downstream handlers
        req.user = {
            id: foundKey.id,
            name: foundKey.label,
            role: 'API_CLIENT',
            scopes: foundKey.scopes,
            tenantId: req.tenantId,
            assignedProjects: [foundSiteId],
            isVip: foundKey.isVip || false
        };
        req.siteId = foundSiteId;
        req.authMode = 'API_KEY';
        
        // Audit Key Usage
        foundKey.lastUsedAt = new Date().toISOString();
        
        console.log(`[AUTH] API Key "${foundKey.label}" authenticated for project ${foundSiteId}.`);
    };
};