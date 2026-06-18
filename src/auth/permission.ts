import { Role, RoleConfig } from "./roles";

export function resolveRole(phoneNumber: string, roleConfig: RoleConfig): Role {
    if (roleConfig.owners.has(phoneNumber)) return 'owner';
    if (roleConfig.members.has(phoneNumber)) return 'member';
    return 'guest';
}

export function isAllowed(role: Role): boolean {
    return role === 'owner' || role === 'member';
}
