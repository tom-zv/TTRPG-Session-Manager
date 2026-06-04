export type UserDB = {
    preferences?: import("shared/domain/users/preferences.js").UserPreferences,
    id: number,
    username: string,
    password_hash: string,
    email: string,
    is_gm: boolean,
    last_login: string, 
    created_at: string    
}
