import {CommonI18nMessages} from '@drax/common-front'
import {IdentityI18nMessages} from '@drax/identity-front'
import {AuditI18nMessages} from '@drax/audit-front'
import {createI18n} from 'vue-i18n'
import {es, en} from './messages'

export function buildI18n() {
    const common = CommonI18nMessages as unknown as Record<'es' | 'en', Record<string, unknown>>
    const identity = IdentityI18nMessages as unknown as Record<'es' | 'en', Record<string, unknown>>
    const audit = AuditI18nMessages as unknown as Record<'es' | 'en', Record<string, unknown>>
    return createI18n({
        legacy: false,
        locale: 'es',
        fallbackLocale: 'en',
        messages: {
            es: {...common.es, ...identity.es, ...audit.es, ...es},
            en: {...common.en, ...identity.en, ...audit.en, ...en},
        },
    } as Parameters<typeof createI18n>[0])
}