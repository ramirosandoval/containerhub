const UUIDISH_API_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function promoteBearerApiKey(headers: Record<string, string | string[] | undefined>) {
    const authorization = headers.authorization
    if (typeof authorization !== 'string' || headers['x-api-key']) return
    const credential = authorization.replace(/^Bearer\s+/i, '')
    if (!UUIDISH_API_KEY.test(credential)) return
    headers['x-api-key'] = credential
    delete headers.authorization
}
