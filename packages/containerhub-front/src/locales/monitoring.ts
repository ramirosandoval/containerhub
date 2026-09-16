export const monitoringEs = {
    title: 'Monitoreo de servicios', notice: 'Las muestras se recolectan mientras el backend está activo y la configuración está habilitada.',
    field: {service: 'Servicio', stack: 'Stack', type: 'Tipo', status: 'Estado configurado', interval: 'Intervalo', period: 'Período / retención', collectionType: 'Réplicas', since: 'Desde', until: 'Hasta', holdingTime: 'Retención (días)'},
    create: 'Configurar servicios', service: 'Servicio', stack: 'Stack', search: 'Buscar servicio', status: 'Estado configurado', interval: 'Intervalo', period: 'Período / retención', actions: 'Acciones',
    refresh: 'Actualizar', cancel: 'Cancelar', save: 'Guardar', confirm: 'Confirmar', pause: 'Pausar', resume: 'Reanudar', delete: 'Eliminar',
    confirmPause: '¿Pausar esta configuración?', confirmResume: '¿Reanudar esta configuración?', confirmDelete: '¿Eliminar esta configuración? No se elimina el servicio Docker.',
    calendar: 'Calendario', permanent: 'Permanente', collectionType: 'Réplicas', replic: 'Una réplica', global: 'Todas las réplicas',
    since: 'Desde', until: 'Hasta', holdingTime: 'Retención (días)', days: 'días', monitoring: 'Habilitado', paused: 'Pausado',
    services: 'Servicios', configured: 'Ya configurado', required: 'Campo requerido', dateOrder: 'Hasta debe ser posterior a Desde', positive: 'Debe ser un entero mayor que cero',
    selectionRequired: 'Selecciona al menos un servicio sin configurar.', failed: 'No se pudo completar la operación.', created: 'Configuraciones creadas: {created}. Servicios ya configurados: {skipped}.',
    history: 'Historial de monitoreo', historyFailed: 'No se pudo cargar el historial.', noSamples: 'No hay muestras para el período seleccionado.', apply: 'Aplicar', task: 'Tarea', node: 'Nodo', sampleLimit: 'Máximo de muestras', sampledAt: 'Muestra', cpu: 'CPU', memory: 'Memoria', io: 'Lectura de disco', network: 'Red recibida'
}
export const monitoringEn = {
    title: 'Services monitoring', notice: 'Samples are collected while the backend is running and the configuration is enabled.',
    field: {service: 'Service', stack: 'Stack', type: 'Type', status: 'Configured state', interval: 'Interval', period: 'Period / retention', collectionType: 'Replicas', since: 'From', until: 'Until', holdingTime: 'Retention (days)'},
    create: 'Configure services', service: 'Service', stack: 'Stack', search: 'Search service', status: 'Configured state', interval: 'Interval', period: 'Period / retention', actions: 'Actions',
    refresh: 'Refresh', cancel: 'Cancel', save: 'Save', confirm: 'Confirm', pause: 'Pause', resume: 'Resume', delete: 'Delete',
    confirmPause: 'Pause this configuration?', confirmResume: 'Resume this configuration?', confirmDelete: 'Delete this configuration? The Docker service is not deleted.',
    calendar: 'Calendar', permanent: 'Permanent', collectionType: 'Replicas', replic: 'One replica', global: 'All replicas',
    since: 'From', until: 'Until', holdingTime: 'Retention (days)', days: 'days', monitoring: 'Enabled', paused: 'Paused',
    services: 'Services', configured: 'Already configured', required: 'Required field', dateOrder: 'Until must be after From', positive: 'Must be an integer greater than zero',
    selectionRequired: 'Select at least one unconfigured service.', failed: 'The operation could not be completed.', created: 'Configurations created: {created}. Already configured services: {skipped}.',
    history: 'Monitoring history', historyFailed: 'Could not load monitoring history.', noSamples: 'There are no samples for the selected period.', apply: 'Apply', task: 'Task', node: 'Node', sampleLimit: 'Sample limit', sampledAt: 'Sample', cpu: 'CPU', memory: 'Memory', io: 'Disk read', network: 'Network received'
}
