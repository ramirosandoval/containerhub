import {stat} from 'node:fs/promises'
import {relative, resolve, sep} from 'node:path'
import fastifyStatic from '@fastify/static'

const backendPrefixes = ['/api/', '/graphql', '/documentation']

function isBackendPath(pathname: string): boolean {
    return backendPrefixes.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))
}

function frontendFile(frontDirectory: string, pathname: string): string | undefined {
    const absolutePath = resolve(frontDirectory, `.${pathname}`)
    if (absolutePath !== frontDirectory && !absolutePath.startsWith(`${frontDirectory}${sep}`)) return undefined
    return relative(frontDirectory, absolutePath)
}

async function isFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile()
    } catch {
        return false
    }
}

export async function registerFrontendStatic(fastify: any, frontDirectory: string): Promise<void> {
    const rootDirectory = resolve(frontDirectory)
    await fastify.register(fastifyStatic, {root: rootDirectory, serve: false})
    fastify.get('/*', async (request: {url: string}, reply: any) => {
        const pathname = decodeURIComponent(request.url.split('?')[0])
        if (isBackendPath(pathname)) return reply.code(404).send()
        const file = frontendFile(rootDirectory, pathname)
        if (file && await isFile(resolve(rootDirectory, file))) return reply.sendFile(file)
        return reply.sendFile('index.html')
    })
}
