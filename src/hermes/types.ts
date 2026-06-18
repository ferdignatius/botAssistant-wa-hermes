import { Role } from "../auth/roles";

export interface HermesPayload {
    source: 'whatsapp';
    chat_type: 'dm' | 'group';
    chat_id: string;
    chat_name?: string;
    sender: string;
    sender_name?: string;
    role: Role;
    message: string;
}

export interface HermesResponse {
    reply: string;
    thinking?: string;
}