<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useAuthStore } from '@drax/identity-vue'
import { SettingsApi, type ISettings } from '../../providers/SettingsApi'

const authStore = useAuthStore()
const canUpdate = computed(() => authStore.hasPermission('SETTINGS_UPDATE'))
const loading = ref(false)
const saving = ref(false)
const snackbar = ref({ show: false, text: '', color: 'success' })

const form = ref<ISettings>({
    maxLogsLines: 10000,
    maxMonitoredTasksQuantity: 1000,
    monitorizationTasksInterval: 60
})

const fetchSettings = async () => {
    loading.value = true
    try {
        const data = await SettingsApi.getSettings()
        form.value = { ...data }
    } catch (e: any) {
        snackbar.value = { show: true, text: 'Error al cargar configuraciones', color: 'error' }
    } finally {
        loading.value = false
    }
}

const saveSettings = async () => {
    saving.value = true
    try {
        await SettingsApi.updateSettings(form.value)
        snackbar.value = { show: true, text: 'Configuraciones guardadas', color: 'success' }
    } catch (e: any) {
        snackbar.value = { show: true, text: 'Error al guardar configuraciones', color: 'error' }
    } finally {
        saving.value = false
    }
}

onMounted(() => {
    fetchSettings()
})
</script>

<template>
    <v-container>
        <v-row>
            <v-col cols="12">
                <v-card :loading="loading">
                    <v-card-title>Configuraciones Operacionales</v-card-title>
                    <v-card-text>
                        <v-form @submit.prevent="saveSettings">
                            <v-row>
                                <v-col cols="12" md="4">
                                    <v-text-field
                                        v-model.number="form.maxLogsLines"
                                        label="Límite de líneas de Logs (LOG-03)"
                                        type="number"
                                        min="1"
                                        required
                                        :readonly="!canUpdate"
                                        hint="Cantidad máxima de líneas devueltas por los endpoints de logs"
                                        persistent-hint
                                    ></v-text-field>
                                </v-col>
                                <v-col cols="12" md="4">
                                    <v-text-field
                                        v-model.number="form.maxMonitoredTasksQuantity"
                                        label="Máx Tareas Monitorizadas (LIFE-01)"
                                        type="number"
                                        min="1"
                                        required
                                        :readonly="!canUpdate"
                                        hint="Límite histórico de tareas que se retendrán en memoria/BD"
                                        persistent-hint
                                    ></v-text-field>
                                </v-col>
                                <v-col cols="12" md="4">
                                    <v-text-field
                                        v-model.number="form.monitorizationTasksInterval"
                                        label="Intervalo Monitorización (segundos)"
                                        type="number"
                                        min="1"
                                        required
                                        :readonly="!canUpdate"
                                        hint="Cada cuántos segundos se consultará el estado de las tareas"
                                        persistent-hint
                                    ></v-text-field>
                                </v-col>
                            </v-row>
                            <v-card-actions class="mt-4 px-0">
                                <v-spacer></v-spacer>
                                <v-btn
                                    v-if="canUpdate"
                                    color="primary"
                                    type="submit"
                                    variant="elevated"
                                    :loading="saving"
                                >
                                    Guardar
                                </v-btn>
                            </v-card-actions>
                        </v-form>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>

        <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
            {{ snackbar.text }}
        </v-snackbar>
    </v-container>
</template>
