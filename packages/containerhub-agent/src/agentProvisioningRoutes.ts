import {constants} from 'node:fs'
import {lstat, mkdir, open, realpath, stat} from 'node:fs/promises'
import path from 'node:path'
import type {FastifyInstance} from 'fastify'

function isPathInside(target: string, root: string): boolean {
    return target === root || target.startsWith(`${root}${path.sep}`)
}

async function existingRealPath(target: string): Promise<string> {
    let candidate = target
    while (true) {
        try {
            return await realpath(candidate)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            const parent = path.dirname(candidate)
            if (parent === candidate) throw new Error('Invalid host path')
            candidate = parent
        }
    }
}

async function rejectSymlinkComponents(root: string, target: string): Promise<void> {
    let candidate = root
    for (const component of path.relative(root, target).split(path.sep).filter(Boolean)) {
        candidate = path.join(candidate, component)
        try {
            if ((await lstat(candidate)).isSymbolicLink()) throw new Error('Invalid host path')
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
            throw error
        }
    }
}

async function isDatabaseFile(target: string, databasePath: string): Promise<boolean> {
    if (target === databasePath) return true
    try {
        const [targetStats, databaseStats] = await Promise.all([stat(target), stat(databasePath)])
        return targetStats.dev === databaseStats.dev && targetStats.ino === databaseStats.ino
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw error
    }
}

function isNodeError(error: unknown, code: string): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as {code?: string}).code === code
}

async function openSecureDirectory(root: string, target: string) {
    const relative = path.relative(root, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Invalid host volume path: ${target}`)
    let directory = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
        for (const segment of relative.split(path.sep).filter(Boolean)) {
            const child = `/proc/self/fd/${directory.fd}/${segment}`
            try {
                await mkdir(child)
            } catch (error) {
                if (!isNodeError(error, 'EEXIST')) throw error
            }
            const next = await open(child, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
            await directory.close()
            directory = next
        }
        return directory
    } catch (error) {
        await directory.close().catch(() => undefined)
        throw error
    }
}

async function writeSecureFile(root: string, target: string, content: string, databasePath: string) {
    const directory = await openSecureDirectory(root, path.dirname(target))
    const filePath = `/proc/self/fd/${directory.fd}/${path.basename(target)}`
    let file
    try {
        try {
            file = await open(filePath, constants.O_WRONLY | constants.O_NOFOLLOW)
        } catch (error) {
            if (!isNodeError(error, 'ENOENT')) throw error
            try {
                file = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o666)
            } catch (createError) {
                if (!isNodeError(createError, 'EEXIST')) throw createError
                file = await open(filePath, constants.O_WRONLY | constants.O_NOFOLLOW)
            }
        }
        const candidate = await file.stat()
        try {
            const database = await stat(databasePath)
            if (candidate.dev === database.dev && candidate.ino === database.ino) throw new Error(`Refusing to overwrite ContainerHub database file: ${target}`)
        } catch (error) {
            if (!isNodeError(error, 'ENOENT')) throw error
        }
        await file.truncate(0)
        await file.writeFile(content)
    } finally {
        await file?.close().catch(() => undefined)
        await directory.close().catch(() => undefined)
    }
}

function hostPathFromFolder(folder: unknown): string {
    if (typeof folder === 'string' && folder) return folder
    if (typeof folder !== 'object' || folder === null) throw new Error('Folder path is required')
    const candidate = folder as {hostPath?: unknown; path?: unknown}
    if (typeof candidate.hostPath === 'string' && candidate.hostPath) return candidate.hostPath
    if (typeof candidate.path === 'string' && candidate.path) return candidate.path
    throw new Error('Folder path is required')
}

function fileInput(file: unknown): {fileName: string; fileContent: string; hostPath: string} {
    if (typeof file !== 'object' || file === null) throw new Error('fileName, fileContent and hostPath are required')
    const candidate = file as {fileName?: unknown; fileContent?: unknown; hostPath?: unknown}
    if (!candidate.fileName || candidate.fileContent === undefined || !candidate.hostPath || typeof candidate.fileName !== 'string' || typeof candidate.hostPath !== 'string') {
        throw new Error('fileName, fileContent and hostPath are required')
    }
    if (typeof candidate.fileContent !== 'string') throw new Error('fileContent must be a string')
    return {fileName: candidate.fileName, fileContent: candidate.fileContent, hostPath: candidate.hostPath}
}

export function registerAgentProvisioningRoutes(server: FastifyInstance, dockerDataPath: string, hostVolumeRoots: string[]): void {
    const safeDataPath = async (hostPath: string, fileName?: string): Promise<{root: string; target: string}> => {
        const target = path.isAbsolute(hostPath)
            ? path.resolve(hostPath, fileName ?? '')
            : path.resolve(dockerDataPath, hostPath, fileName ?? '')
        const root = hostVolumeRoots.find((candidate) => isPathInside(target, candidate))
        if (!root) throw new Error('Invalid host path')

        const [realRoot, realExistingPath] = await Promise.all([
            realpath(root),
            existingRealPath(target),
            rejectSymlinkComponents(root, target)
        ])
        if (!isPathInside(realExistingPath, realRoot)) throw new Error('Invalid host path')

        if (await isDatabaseFile(target, path.resolve(dockerDataPath, 'containerhub.sqlite'))) throw new Error('Cannot overwrite ContainerHub database file')
        return {root, target}
    }

    server.post('/folders', async (request: any) => {
        if (!Array.isArray(request.body)) throw new Error('Request body must be an array')
        await Promise.all(request.body.map(async (folder: unknown) => {
            const {root, target} = await safeDataPath(hostPathFromFolder(folder))
            const directory = await openSecureDirectory(root, target)
            await directory.close()
        }))
        return {success: true}
    })

    server.post('/files', async (request: any) => {
        if (!Array.isArray(request.body)) throw new Error('Request body must be an array')
        await Promise.all(request.body.map(async (file: unknown) => {
            const {fileName, fileContent, hostPath} = fileInput(file)
            const {root, target} = await safeDataPath(hostPath, fileName)
            await writeSecureFile(root, target, fileContent, path.resolve(dockerDataPath, 'containerhub.sqlite'))
        }))
        return {message: 'File successfully created!'}
    })
}
