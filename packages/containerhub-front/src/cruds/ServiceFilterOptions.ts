export interface ServiceFilterSource {
    stack?: string | null
    image?: {nameWithTag?: string | null} | null
}

export function buildServiceFilterOptions(services: ServiceFilterSource[]) {
    const stacks = Array.from(new Set(services.map((service) => service.stack).filter((stack): stack is string => Boolean(stack))))
        .sort((a, b) => a.localeCompare(b))
    const images = Array.from(new Set(services.map((service) => service.image?.nameWithTag).filter((image): image is string => Boolean(image))))
    return {stacks, images}
}
