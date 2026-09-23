<template>
    <v-dialog v-model="creating" max-width="1000" :persistent="busy">
        <v-card :title="t('monitoring.create')">
            <v-card-text>
                <v-alert v-if="formError" type="error" class="mb-4">{{ formError }}</v-alert>
                <v-form ref="formElement" @submit.prevent="save">
                    <v-row>
                        <v-col cols="12" md="6">
                            <v-select v-model="stackFilter" :items="stacks" :label="t('monitoring.stack')" clearable/>
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-text-field v-model="serviceSearch" :label="t('monitoring.search')" clearable/>
                        </v-col>
                    </v-row>
                    <v-data-table
                        v-model="selectedServices"
                        :items="filteredServices"
                        :headers="serviceHeaders"
                        item-value="id"
                        show-select
                        :loading="servicesLoading"
                        :items-per-page="5"
                        :items-per-page-options="[5, 10, 25, 50, 100]"
                        :item-selectable="service => !configuredServices[service.id]"
                    >
                        <template #item.status="{item}">{{ configuredServices[item.id] ? t(`monitoring.${configuredServices[item.id]}`) : '—' }}</template>
                    </v-data-table>
                    <v-row class="mt-3">
                        <v-col cols="12" md="6">
                            <v-select v-model="form.collectionInterval" :items="['15s', '30s', '45s', '60s']" :label="t('monitoring.interval')"/>
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-select v-model="form.collectionType" :items="collectionTypes" :label="t('monitoring.collectionType')"/>
                        </v-col>
                        <v-col cols="12">
                            <v-radio-group v-model="form.type" inline>
                                <v-radio value="calendar" :label="t('monitoring.calendar')"/>
                                <v-radio value="permanent" :label="t('monitoring.permanent')"/>
                            </v-radio-group>
                        </v-col>
                        <template v-if="form.type === 'calendar'">
                            <v-col cols="12" md="6">
                                <v-text-field v-model="form.since" type="date" :min="today" :label="t('monitoring.since')" :rules="[required]"/>
                            </v-col>
                            <v-col cols="12" md="6">
                                <v-text-field v-model="form.until" type="date" :min="form.since" :label="t('monitoring.until')" :rules="[required, value => value > form.since || t('monitoring.dateOrder')]"/>
                            </v-col>
                        </template>
                        <v-col v-else cols="12">
                            <v-text-field v-model.number="form.holdingTime" type="number" min="1" step="1" :label="t('monitoring.holdingTime')" :rules="[value => Number.isInteger(Number(value)) && Number(value) > 0 || t('monitoring.positive')]"/>
                        </v-col>
                    </v-row>
                </v-form>
            </v-card-text>
            <v-card-actions>
                <v-spacer/>
                <v-btn :disabled="busy" @click="creating = false">{{ t('monitoring.cancel') }}</v-btn>
                <v-btn color="primary" :loading="busy" :disabled="servicesLoading || !selectedServices.length" @click="save">{{ t('monitoring.save') }}</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import {computed, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {monitoringProvider, type MonitoringConfiguration} from '@/cruds/MonitoringCrud'
import type {Service} from '@/cruds/ServiceCrud'
import {restGet} from '@/rest'

const {refresh} = defineProps<{refresh: () => Promise<void>}>()
const emit = defineEmits<{created: [outcome: {created: MonitoringConfiguration[]; skipped: string[]}]}>()
const busy = defineModel<boolean>('busy', {required: true})
const {t} = useI18n()
const creating = ref(false)
const formError = ref('')
const servicesLoading = ref(false)
const services = ref<Service[]>([])
const configuredServices = ref<Record<string, string>>({})
const selectedServices = ref<string[]>([])
const stackFilter = ref<string | null>(null)
const serviceSearch = ref('')
const formElement = ref<{validate(): Promise<{valid: boolean}>} | null>(null)
function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const today = localDate(new Date())
const defaultUntil = new Date()
defaultUntil.setDate(defaultUntil.getDate() + 30)
const form = reactive({type: 'calendar' as 'calendar' | 'permanent', collectionInterval: '15s', collectionType: 'replic' as 'replic' | 'global', since: today, until: localDate(defaultUntil), holdingTime: 30})
const serviceHeaders = computed(() => [{title: t('monitoring.service'), key: 'name'}, {title: t('monitoring.stack'), key: 'stack'}, {title: t('monitoring.status'), key: 'status', sortable: false}])
const stacks = computed(() => [...new Set(services.value.flatMap(service => service.stack ? [service.stack] : []))].sort())
const filteredServices = computed(() => services.value.filter(service => (!stackFilter.value || service.stack === stackFilter.value) && service.name.toLowerCase().includes((serviceSearch.value || '').toLowerCase())))
const collectionTypes = computed(() => ['replic', 'global'].map(value => ({title: t(`monitoring.${value}`), value})))
function required(value: unknown) { return Boolean(value) || t('monitoring.required') }

async function open() {
    creating.value = true
    formError.value = ''
    selectedServices.value = []
    services.value = []
    servicesLoading.value = true
    try {
        const availableServices = await restGet<Service[]>('/api/services')
        const statuses = await monitoringProvider.statuses(availableServices.map(service => service.id))
        configuredServices.value = Object.fromEntries(statuses.map(configuration => [configuration.serviceId, configuration.status]))
        services.value = availableServices
    } catch (failure) { formError.value = failure instanceof Error ? failure.message : t('monitoring.failed') }
    finally { servicesLoading.value = false }
}

async function save() {
    if (!(await formElement.value?.validate())?.valid) return
    if (!selectedServices.value.length) { formError.value = t('monitoring.selectionRequired'); return }
    busy.value = true
    formError.value = ''
    try {
        const outcome = await monitoringProvider.createForServices({...form, serviceIds: selectedServices.value})
        emit('created', outcome)
        creating.value = false
        await refresh()
    } catch (failure) { formError.value = failure instanceof Error ? failure.message : t('monitoring.failed') }
    finally { busy.value = false }
}

defineExpose({open})
</script>
