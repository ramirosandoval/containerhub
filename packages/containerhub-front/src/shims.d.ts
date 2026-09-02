/// <reference types="vite/client" />

declare module '*.vue' {
    const component: any
    export default component
}

declare module '*.css' {
    const content: string
    export default content
}

declare module '*.svg' {
    const content: string
    export default content
}

declare module '*.png' {
    const content: string
    export default content
}

interface ImportMetaEnv {
    readonly VITE_GRAPHQL_URL?: string
    readonly DEV: boolean
    readonly PROD: boolean
    readonly MODE: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
