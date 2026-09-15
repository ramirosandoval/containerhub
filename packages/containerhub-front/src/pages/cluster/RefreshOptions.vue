<template>
    <v-card variant="outlined" class="mt-4">
        <v-card-title>{{ t('cluster.options.title') }}</v-card-title>
        <v-card-subtitle>{{ t('cluster.options.subtitle') }}</v-card-subtitle>
        <v-card-text>
            <v-row class="ma-0 pa-0" align="center">
                <v-col cols="12" md="3">
                    <v-switch 
                        :label="t('cluster.options.onlyDisplayRunningTasks')"
                        v-model="model.onlyDisplayRunningTasks"
                        hide-details
                        color="primary"
                    ></v-switch>
                </v-col>
                <v-col cols="12" md="3">
                    <v-switch 
                        :label="t('cluster.options.displayNodeLabels')"
                        v-model="model.displayNodeLabels"
                        hide-details
                        color="primary"
                    ></v-switch>
                </v-col>
                <v-col cols="12" md="3">
                    <v-switch
                        :label="t('cluster.options.autoRefresh')"
                        v-model="model.autoRefresh"
                        hide-details
                        color="primary"
                    ></v-switch>
                </v-col>
                <v-col cols="12" md="3">
                    <v-autocomplete
                        :label="t('cluster.options.refreshRate')"
                        :items="['5s', '10s', '20s', '30s', '45s', '60s']"
                        v-model="model.refreshRate"
                        hide-details
                        :disabled="!model.autoRefresh"
                    ></v-autocomplete>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'

export type ClusterDisplayOptions = {
    onlyDisplayRunningTasks: boolean
    displayNodeLabels: boolean
    autoRefresh: boolean
    refreshRate: string
}

const model = defineModel<ClusterDisplayOptions>({required: true})
const {t} = useI18n()
</script>
