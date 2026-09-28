import {constants} from 'node:fs'
import {lstat, mkdir, open, realpath, stat} from 'node:fs/promises'
import path from 'node:path'

function isPathInside(target: string, root: string): boolean {
    return target === root || target.startsWith(`${root}${path.sep}`)
}

function configuredHostVolumeRoots(): string[] {
    const configuredRoots = process.env.CONTAINERHUB_HOST_VOLUME_ROOTS
        ?.split(',')
        .map((root) => root.trim())
        .filter(Boolean)
    const roots = configuredRoots?.length ? configuredRoots : [process.env.DOCKER_DATA_PATH?.trim() ?? '']
    if (!roots.length || roots.some((root) => !path.isAbsolute(root))) {
        throw new Error('CONTAINERHUB_HOST_VOLUME_ROOTS must contain absolute paths')
    }
    return [...new Set(roots.map((root) => path.resolve(root)))]
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

function protectedDatabasePaths(): string[] {
    const dockerDataPath = process.env.DOCKER_DATA_PATH?.trim()
    const databasePaths = [
        process.env.DRAX_SQLITE_FILE?.trim(),
        dockerDataPath && path.join(dockerDataPath, 'containerhub.sqlite')
    ].filter((databasePath): databasePath is string => Boolean(databasePath && path.isAbsolute(databasePath)))
    return [...new Set(databasePaths.map((databasePath) => path.resolve(databasePath)))]
}

async function isDatabaseFile(target: string, databasePaths: string[]): Promise<boolean> {
    for (const databasePath of databasePaths) {
        if (target === databasePath) return true
        try {
            const [targetStats, databaseStats] = await Promise.all([stat(target), stat(databasePath)])
            if (targetStats.dev === databaseStats.dev && targetStats.ino === databaseStats.ino) return true
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
    }
    return false
}

type SafeDataPath = {root: string; target: string}

async function safeDataPath(hostPath: string, fileName?: string): Promise<SafeDataPath> {
    const dockerDataPath = process.env.DOCKER_DATA_PATH?.trim()
    const target = path.isAbsolute(hostPath)
        ? path.resolve(hostPath, fileName ?? '')
        : dockerDataPath
            ? path.resolve(dockerDataPath, hostPath, fileName ?? '')
            : (() => { throw new Error('DOCKER_DATA_PATH must be configured for relative host paths') })()
    const root = configuredHostVolumeRoots().find((candidate) => isPathInside(target, candidate))
    if (!root) throw new Error('Invalid host path')

    if (await isDatabaseFile(target, protectedDatabasePaths())) throw new Error('Cannot overwrite ContainerHub database file')

    const [realRoot, realExistingPath] = await Promise.all([
        realpath(root),
        existingRealPath(target),
        rejectSymlinkComponents(root, target)
    ])
    if (!isPathInside(realExistingPath, realRoot)) throw new Error('Invalid host path')

    return {root, target}
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

async function writeSecureFile(root: string, target: string, content: string) {
    const directory = await openSecureDirectory(root, path.dirname(target))
    const filePath = `/proc/self/fd/${directory.fd}/${path.basename(target)}`
    let file
    try {
        try {
            file = await open(filePath, constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        } catch (error) {
            if (!isNodeError(error, 'ENOENT')) throw error
            try {
                file = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o666)
            } catch (createError) {
                if (!isNodeError(createError, 'EEXIST')) throw createError
                file = await open(filePath, constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
            }
        }
        const candidate = await file.stat()
        if (!candidate.isFile()) throw new Error('Target must be a regular file')
        const dockerDataPath = process.env.DOCKER_DATA_PATH?.trim()
        if (dockerDataPath) {
            try {
                const database = await stat(path.resolve(dockerDataPath))
                if (candidate.dev === database.dev && candidate.ino === database.ino) throw new Error(`Refusing to overwrite ContainerHub database file: ${target}`)
            } catch (error) {
                if (!isNodeError(error, 'ENOENT')) throw error
            }
        }
        await file.truncate(0)
        await file.writeFile(content)
    } finally {
        await file?.close().catch(() => undefined)
        await directory.close().catch(() => undefined)
    }
}

export async function createHostFolder(hostPath: string): Promise<void> {
    const {root, target} = await safeDataPath(hostPath)
    const directory = await openSecureDirectory(root, target)
    await directory.close()
}

export async function createHostFile(hostPath: string, fileName: string, fileContent: string): Promise<void> {
    const {root, target} = await safeDataPath(hostPath, fileName)
    await writeSecureFile(root, target, fileContent)
}
