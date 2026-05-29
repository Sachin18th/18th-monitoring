import { prisma } from '@kpi-platform/db';
import { AuthService } from '../services/auth.service';
import { PagePermissionsService } from '../services/page-permissions.service';
import { PROJECT_PAGE_KEYS } from '@kpi-platform/shared-types';
import crypto from 'crypto';

const normalizeRole = (role: unknown) => String(role || '').toUpperCase();

const normalizePageKeys = (pageKeys: unknown) => PagePermissionsService.normalizeSelectedPageKeys(pageKeys);

const writePagePermissions = async (tx: any, userId: string, projectId: string, pageKeys: unknown) => {
    const selected = new Set(normalizePageKeys(pageKeys));

    await Promise.all(
        PROJECT_PAGE_KEYS.map((pageKey) => tx.userPagePermission.upsert({
            where: {
                userId_projectId_pageKey: {
                    userId,
                    projectId,
                    pageKey
                }
            },
            update: { isAllowed: selected.has(pageKey) },
            create: {
                userId,
                projectId,
                pageKey,
                isAllowed: selected.has(pageKey)
            }
        }))
    );
};

export const listPlatformUsers = async (req: any, reply: any) => {
    const { projectId } = req.params;
    
    // Additional security for non-SuperAdmins
    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this project administration.' });
    }

    const users = await prisma.user.findMany({
        where: {
            role: {
                not: 'SUPER_ADMIN'
            },
              projectAccess: {
                some: { projectId }
            }
        },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            pagePermissions: {
                where: { projectId },
                select: {
                    pageKey: true,
                    isAllowed: true
                }
            }
        }
    });

    return users.map((user) => ({
        ...user,
        pagePermissions: Array.isArray(user.pagePermissions) ? user.pagePermissions : []
    }));
};

export const listPageKeys = async (_req: any, reply: any) => {
    return reply.code(200).send({
        success: true,
        data: PagePermissionsService.getPageKeyOptions()
    });
};

export const getCurrentUserPermissions = async (req: any, reply: any) => {
    const projectId = String(req.query?.projectId || req.params?.projectId || '').trim();

    if (!projectId) {
        return reply.code(400).send({ error: 'Missing projectId' });
    }

    const allowedPageKeys = await PagePermissionsService.getAllowedPageKeys(req.user, projectId);
    const hasExplicitPermissions = req.user.role !== 'SUPER_ADMIN'
        ? (await PagePermissionsService.getPermissionRows(req.user.id, projectId)).length > 0
        : false;

    return reply.code(200).send({
        success: true,
        data: {
            projectId,
            allowedPageKeys,
            hasExplicitPermissions,
            pageKeys: PagePermissionsService.getPageKeyOptions()
        }
    });
};

export const invitePlatformUser = async (req: any, reply: any) => {
    const projectId = String(req.body?.projectId || req.params?.projectId || '').trim();
    const { email, name, password } = req.body;
    const requestedRole = normalizeRole(req.body?.role);
    const allowedRoles = ['PROJECT_ADMIN', 'OPERATOR', 'VIEWER'];
    const role = allowedRoles.includes(requestedRole) ? requestedRole : 'VIEWER';
    const roleOverride = req.body?.roleOverride ?? null;
    const pageKeys = normalizePageKeys(req.body?.pageKeys);

    if (!projectId || !email || !password || !name) {
        return reply.code(400).send({ error: 'Missing fields' });
    }

    if (!allowedRoles.includes(role)) {
        return reply.code(400).send({ error: 'Invalid role' });
    }

    if (!Array.isArray(req.body?.pageKeys)) {
        return reply.code(400).send({ error: 'Invalid pageKeys' });
    }

    const tenantId = req.user.tenantId;

    try {
        const user = await prisma.$transaction(async (tx) => {
            const existingUser = await tx.user.findUnique({
                where: { email }
            });

            const passwordHash = await AuthService.hashPassword(password);

            const targetUser = existingUser
                ? await tx.user.update({
                    where: { id: existingUser.id },
                    data: {
                        name,
                        tenantId,
                        passwordHash,
                        role,
                        status: 'ACTIVE'
                    }
                })
                : await tx.user.create({
                    data: {
                        id: crypto.randomUUID(),
                        email,
                        name,
                        tenantId,
                        passwordHash,
                        role,
                        status: 'ACTIVE'
                    } as any
                });

            await tx.userProjectAccess.upsert({
                where: {
                    userId_projectId: {
                        userId: targetUser.id,
                        projectId
                    }
                },
                update: {
                    roleOverride
                },
                create: {
                    userId: targetUser.id,
                    projectId,
                    roleOverride,
                    assignedAt: new Date()
                }
            });

            await writePagePermissions(tx, targetUser.id, projectId, pageKeys);

            return targetUser;
        });

        const { passwordHash: _, ...userWithoutPass } = user as any;

        return reply.code(201).send({
            success: true,
            user: userWithoutPass
        });
    } catch (e: any) {
        const isUniqueEmailViolation = e?.code === 'P2002' && Array.isArray(e?.meta?.target)
            ? e.meta.target.includes('email')
            : e?.code === 'P2002';

        if (isUniqueEmailViolation) {
            return reply.code(409).send({
                error: 'Conflict',
                message: 'A user with this email already exists.'
            });
        }

        return reply.code(400).send({
            error: 'Invite user failed',
            message: e.message || 'Failed to invite user.'
        });
    }
};

export const updateUserPagePermissions = async (req: any, reply: any) => {
    const { userId } = req.params;
    const projectId = String(req.body?.projectId || req.params?.projectId || '').trim();
    const pageKeys = normalizePageKeys(req.body?.pageKeys);

    if (!projectId) {
        return reply.code(400).send({ error: 'Missing projectId' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true }
        });

        if (!user) {
            return reply.code(404).send({ error: 'Not found', message: 'User not found.' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.userProjectAccess.upsert({
                where: {
                    userId_projectId: {
                        userId: user.id,
                        projectId
                    }
                },
                update: {},
                create: {
                    userId: user.id,
                    projectId,
                    assignedAt: new Date()
                }
            });

            await writePagePermissions(tx, user.id, projectId, pageKeys);
        });

        return reply.code(200).send({
            success: true,
            userId,
            projectId,
            pageKeys
        });
    } catch (e: any) {
        return reply.code(400).send({ error: e.message || 'Failed to update permissions.' });
    }
};

export const createPlatformUser = async (req: any, reply: any) => {
    const { projectId } = req.params;
    const { email, name, password } = req.body;
    const requestedRole = String(req.body?.role || '').toUpperCase();
    const allowedRoles = ['PROJECT_ADMIN', 'OPERATOR', 'VIEWER'];
    const role = allowedRoles.includes(requestedRole) ? requestedRole : 'VIEWER';
    const roleOverride = req.body?.roleOverride ?? null;

    if (!email || !password || !name) {
        return reply.code(400).send({ error: 'Missing fields' });
    }

    if (!allowedRoles.includes(role)) {
        return reply.code(400).send({ error: 'Invalid role' });
    }

    // Security check
    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
        const existingUser = await prisma.user.findUnique({
            where: { email },
            include: { projectAccess: true }
        });

        if (existingUser) {
            const alreadyAssigned = await prisma.userProjectAccess.findUnique({
                where: {
                    userId_projectId: {
                        userId: existingUser.id,
                        projectId
                    }
                }
            });

            if (alreadyAssigned) {
                return reply.code(200).send({
                    success: false,
                    message: 'User already has access to this project.'
                });
            }

            await prisma.userProjectAccess.create({
                data: {
                    userId: existingUser.id,
                    projectId,
                    roleOverride,
                    assignedAt: new Date()
                }
            });

            return reply.code(200).send({
                success: true,
                message: 'User assigned to project successfully.'
            });
        }

        const tenantId = req.user.tenantId;

        const newUser = await prisma.$transaction(async (tx) => {
            const passwordHash = await AuthService.hashPassword(password);

            const user = await tx.user.create({
                data: {
                    id: crypto.randomUUID(),
                    email,
                    name,
                    tenantId,
                    passwordHash,
                    role,
                    status: 'ACTIVE'
                } as any
            });

            await tx.userProjectAccess.create({
                data: {
                    userId: user.id,
                    projectId,
                    roleOverride,
                    assignedAt: new Date()
                }
            });

            return user;
        });

        const { passwordHash: _, ...userWithoutPass } = newUser;
        return reply.code(201).send({
            success: true,
            user: userWithoutPass
        });
    } catch (e: any) {
        const isUniqueEmailViolation = e?.code === 'P2002' && Array.isArray(e?.meta?.target)
            ? e.meta.target.includes('email')
            : e?.code === 'P2002';

        if (isUniqueEmailViolation) {
            return reply.code(409).send({
                error: 'Conflict',
                message: 'A user with this email already exists.'
            });
        }

        return reply.code(400).send({
            error: 'Create user failed',
            message: e.message || 'Failed to create user.'
        });
    }
};

export const updatePlatformUser = async (req: any, reply: any) => {
    const { projectId, userId } = req.params;
    const { email, name, role, status } = req.body;
    const requestedRole = String(role || '').toUpperCase();
    const allowedRoles = ['PROJECT_ADMIN', 'OPERATOR', 'VIEWER'];
    const normalizedStatus = String(status || '').toUpperCase();

    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this project administration.' });
    }

    if (!email || !name) {
        return reply.code(400).send({ error: 'Missing fields' });
    }

    if (role && !allowedRoles.includes(requestedRole)) {
        return reply.code(400).send({ error: 'Invalid role' });
    }

    if (status && !['ACTIVE', 'INACTIVE'].includes(normalizedStatus)) {
        return reply.code(400).send({ error: 'Invalid status' });
    }

    try {
        const existingAccess = await prisma.userProjectAccess.findUnique({
            where: {
                userId_projectId: {
                    userId,
                    projectId
                }
            }
        });

        if (!existingAccess && req.user.role !== 'SUPER_ADMIN') {
            return reply.code(404).send({ error: 'Not found', message: 'User is not assigned to this project.' });
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: {
                email,
                name,
                ...(role ? { role: requestedRole } : {}),
                ...(status ? { status: normalizedStatus } : {})
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                updatedAt: true
            }
        });

        return { success: true, user: updated };
    } catch (e: any) {
        return reply.code(400).send({ error: e.message });
    }
};

export const updatePlatformUserStatus = async (req: any, reply: any) => {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
        return reply.code(400).send({ error: 'Invalid status' });
    }

    try {
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { status },
            select: {
                id: true,
                email: true,
                name: true,
                status: true
            }
        });
        return { success: true, user: updated };
    } catch (e: any) {
        return reply.code(404).send({ error: e.message });
    }
};

export const deletePlatformUser = async (req: any, reply: any) => {
    const { projectId, userId } = req.params;

    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this project administration.' });
    }

    try {
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true }
        });

        if (!targetUser) {
            return reply.code(404).send({ error: 'Not found', message: 'User not found.' });
        }

        if (normalizeRole(targetUser.role) === 'SUPER_ADMIN') {
            return reply.code(403).send({ error: 'Forbidden', message: 'Super admin accounts cannot be removed from the roster.' });
        }

        const access = await prisma.userProjectAccess.findUnique({
            where: {
                userId_projectId: {
                    userId,
                    projectId
                }
            }
        });

        if (!access) {
            return reply.code(404).send({ error: 'Not found', message: 'User is not assigned to this project.' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.userPagePermission.deleteMany({
                where: {
                    userId,
                    projectId
                }
            });

            await tx.userProjectAccess.delete({
                where: {
                    userId_projectId: {
                        userId,
                        projectId
                    }
                }
            });
        });

        return reply.code(200).send({
            success: true,
            userId,
            projectId
        });
    } catch (e: any) {
        return reply.code(400).send({ error: e.message || 'Failed to delete user.' });
    }
};

export const purgeDemoData = async (req: any, reply: any) => {
    // Only Super Admins can purge demo data
    if (req.user.role !== 'SUPER_ADMIN') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only Super Admins can perform this action.' });
    }

    try {
        // Delete all demo data from database (orders, events, logs)
        await Promise.all([
            prisma.canonicalOrder.deleteMany({}),
            prisma.ingestionEvent.deleteMany({}),
            prisma.kpiValue.deleteMany({})
        ]);
        
        return { success: true, message: 'Demo data purged successfully.' };
    } catch (e: any) {
        return reply.code(500).send({ error: 'Purge failed', message: e.message });
    }
};
