export type UserDB = {
    id: number,
    username: string,
    password_hash: string,
    email: string,
    is_dm: boolean,
    last_login: string, 
    created_at: string    
}