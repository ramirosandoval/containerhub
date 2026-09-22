import {useEntityStore} from '@drax/crud-vue'
import AuditCrud from '@drax/audit-vue/src/cruds/AuditCrud'
import GhostContainersCrud from '@/cruds/GhostContainersCrud'
import GitLabProjectsCrud from '@/cruds/GitLabProjectsCrud'
import MonitoringCrud from '@/cruds/MonitoringCrud'
import NetworksCrud from '@/cruds/NetworksCrud'
import NodesCrud from '@/cruds/NodesCrud'
import RegistryImagesCrud from '@/cruds/RegistryImagesCrud'
import ServiceCrud from '@/cruds/ServiceCrud'
import StacksCrud from '@/cruds/StacksCrud'
import TaskMonitorizationCrud from '@/cruds/TaskMonitorizationCrud'

export function setupEntities(): void {
    useEntityStore().setEntities([
        AuditCrud.instance,
        ServiceCrud.instance,
        MonitoringCrud.instance,
        NetworksCrud.instance,
        NodesCrud.instance,
        StacksCrud.instance,
        GhostContainersCrud.instance,
        RegistryImagesCrud.instance,
        GitLabProjectsCrud.instance,
        TaskMonitorizationCrud.instance,
    ])
}
