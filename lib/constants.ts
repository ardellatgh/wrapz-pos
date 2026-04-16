/** Fixed row id for event_settings singleton upserts (matches first insert from app). */
export const EVENT_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000001";

/** Exact phrase required in UI and server purge API body (must match character-for-character). */
export const PURGE_CONFIRM_PHRASE = "PURGE EVENT DATA" as const;
