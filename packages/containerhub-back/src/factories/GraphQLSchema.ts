import {loadFilesSync} from '@graphql-tools/load-files'
import {mergeTypeDefs, mergeResolvers} from '@graphql-tools/merge'
import * as path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const typeDefs = mergeTypeDefs(
    loadFilesSync(path.join(__dirname, '../modules'), {extensions: ['.graphql'], recursive: true})
)

export const resolvers = mergeResolvers(
    loadFilesSync(path.join(__dirname, '../modules'), {extensions: ['.resolvers.ts'], recursive: true})
)
