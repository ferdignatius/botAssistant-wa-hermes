import { AppConfig } from "../config/env";

export type Role = 'owner' | 'member' | 'guest';

export interface RoleConfig {
    owners: Set<string>;
    members: Set<string>;
}

export function buildRoleConfig(config: AppConfig): RoleConfig {
    return {
        owners: new Set(config.ownerNumbers),
        members: new Set(config.memberNumbers),
    };
}
