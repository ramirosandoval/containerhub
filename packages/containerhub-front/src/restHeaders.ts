export function authorizationHeader(accessToken: string | null): Record<string, string> {
    return accessToken ? {Authorization: `Bearer ${accessToken}`} : {}
}
