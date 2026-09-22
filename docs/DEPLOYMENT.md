# Despliegue de ContainerHub

Este documento detalla el ciclo de vida de empaquetado, distribución y despliegue del proyecto en entornos productivos mediante Docker Swarm.

## 1. Construcción de Imágenes (Build)

El repositorio incluye dos imágenes: la aplicación principal (`containerhub`) y el agente remoto (`containerhub-agent`). La imagen principal se ejecuta como los servicios Swarm `app` (API y frontend) y `monitoring` (recolección histórica); ambos usan el mismo tag inmutable.
Para compilar las imágenes localmente, asegúrate de situarte en la raíz del monorepo:

```bash
# Construir la imagen del Backend y Frontend (ContainerHub Principal)
docker build -t mi-registry.com/containerhub:latest -f Dockerfile .

# Construir la imagen del Agente (Worker Node)
docker build -t mi-registry.com/containerhub-agent:latest -f packages/containerhub-agent/Dockerfile .
```

## 2. Distribución al Registry (Push)

Si deseas desplegar en un clúster multinodo, las imágenes deben residir en un registry accesible por todos los nodos del Swarm.

```bash
# Etiquetar (tag) adecuadamente si no se hizo en el paso previo
docker tag containerhub:latest mi-registry.com/containerhub:latest

# Empujar imágenes al Registry
docker push mi-registry.com/containerhub:latest
docker push mi-registry.com/containerhub-agent:latest
```

## 3. Despliegue manual en Docker Swarm

El stack de ejemplo no es requisito operativo: las tres imágenes se pueden desplegar como servicios independientes. Conserva estos roles:

| Servicio | Proceso y placement | Puertos y mounts |
| --- | --- | --- |
| `containerhub_app` | `node packages/containerhub-back/dist/index.js` en un manager | publica la API; monta Docker socket, datos y los roots que docker-devops aprovisiona |
| `containerhub_agent` | `node packages/containerhub-agent/dist/index.js` global en workers | no publica puerto; monta Docker socket, datos y exactamente los mismos roots de host |
| `containerhub_monitoring` | `node packages/containerhub-back/dist/monitoring.js` en un manager | no publica puerto; no necesita roots de provisioning |

Para que docker-devops pueda crear un archivo de `/storage/...` y montarlo después en un servicio, configura **el mismo valor** y bind mount en `app` y en cada `agent`:

```bash
--env CONTAINERHUB_HOST_VOLUME_ROOTS=/storage,/logs,/localdata \
--mount type=bind,src=/storage,dst=/storage
```

Añade los mounts equivalentes de `/logs` y `/localdata` solo si el entorno permite que docker-devops los use. La allow-list no crea mounts: si un worker no tiene el bind mount, ContainerHub falla el provisioning antes de crear o actualizar el servicio.

Los roots deben ser escribibles solo por el principal que ejecuta ContainerHub/agent; no uses un host path modificable por usuarios o procesos no confiables.

El nombre y el nodo de `containerhub_monitoring` son decisiones de `docker service create`/`update`; el worker no escucha un puerto ni lee esos valores como settings de aplicación.

## 4. Despliegue por stack de ejemplo (Local/Producción)

El archivo `docker-compose.yml` (stack) provisto en la raíz del proyecto está preparado para el entorno Swarm. Utiliza restricciones de ubicación (`node.role == manager` para el backend y `node.role == worker` en modo global para los agentes).

Para desplegar un candidato paralelo en el puerto 9998 y conservar la opción de reemplazar después el endpoint legacy en 9999:

```bash
export CONTAINERHUB_PORT=9998
export CONTAINERHUB_ORIGIN=https://containerhub-dev.example.com
export CONTAINERHUB_IMAGE=REGISTRY/containerhub:TAG_INMUTABLE
export CONTAINERHUB_AGENT_IMAGE=REGISTRY/containerhub-agent:TAG_INMUTABLE
```

`CONTAINERHUB_PORT` controla el listener, el target y el published port. Termina TLS en el reverse proxy/ingress y configura `CONTAINERHUB_ORIGIN` con la URL HTTPS que usarán los navegadores y Docker DevOps. No envíes la API key ni la configuración revelada por HTTP sobre una red compartida. El acceso HTTP directo se limita a loopback o a una red privada explícitamente aislada durante pruebas desechables. App y agentes deben usar imágenes ya distribuidas o accesibles desde todos los nodos del Swarm.

Si habilitas el bootstrap, `CONTAINERHUB_BOOTSTRAP_USERNAME` debe contener solo letras y números; el valor por defecto del stack es `containerhubtest`.

### Preparación de Secretos
Antes del primer despliegue, Docker Swarm necesita los tres secretos externos declarados por el stack. Genera valores nuevos; no reutilices credenciales legacy ni versiones valores de ejemplo:

```bash
openssl rand -hex 32 | docker secret create containerhub-test-jwt -
openssl rand -hex 32 | docker secret create containerhub-test-api-key -
read -rsp 'ContainerHub bootstrap password: ' CONTAINERHUB_BOOTSTRAP_PASSWORD; echo
printf '%s' "$CONTAINERHUB_BOOTSTRAP_PASSWORD" | docker secret create containerhub-test-bootstrap-password -
unset CONTAINERHUB_BOOTSTRAP_PASSWORD
```

### Ejecución del Despliegue

Inicia el despliegue del stack llamado `containerhub`:

```bash
docker stack deploy -c docker-compose.yml containerhub
```

> [!TIP]
> Puedes verificar `app`, `monitoring` y `agent` con `docker stack services containerhub`. Para el recolector separado, usa `docker service logs -f containerhub_monitoring`; no publica un puerto ni reemplaza el agente remoto.

### Integración con Docker DevOps

1. Despliega ContainerHub en paralelo y crea un usuario técnico con un rol que contenga solamente `DOCKER_VIEW`, `DOCKER_CONFIGURATION_VIEW`, `DOCKER_CREATE`, `DOCKER_UPDATE`, `DOCKER_REMOVE`, `DOCKER_NODES_FETCH` y `DOCKER_NETWORK_VIEW`.
2. Genera una API key para ese usuario, limita sus IPv4/IPv6 a las direcciones del backend Docker DevOps cuando la topología lo permita y conserva una copia temporal en el gestor de secretos aprobado para la carga/rotación.
3. En un Environment DEV de Docker DevOps cambia solamente `dockerApiUrl` por la URL HTTPS y `dockerApiToken` por la API key de ContainerHub. Docker DevOps conserva el header Bearer actual.
4. Antes del corte, despliega la corrección de Docker DevOps que elimina el logging del documento `Environment`, del payload `serviceData` y de la respuesta de actualización. Verifica que sus logs no contengan `dockerApiToken` ni valores de env/labels.
5. Trata `dockerApiToken` como una limitación legacy: Docker DevOps lo persiste sin cifrado de campo, lo expone en su GraphQL y lo muestra en las pantallas de Environment. Restringe el CRUD de Environments y el acceso a MongoDB a administradores autorizados; no copies el valor a tickets ni documentación. Restringe, rota y depura los logs históricos según la política de retención porque ejecuciones anteriores a la corrección pueden contener credenciales o configuración.
6. Valida lecturas y un ciclo create/update/delete desechable antes de apagar Docker Fortes.
7. Para rotar la credencial, crea una segunda API key, actualiza los Environments, verifica y recién entonces revoca la anterior.

---

## 5. Transporte interno backend-agent

El stack de compatibilidad usa HTTP/WS sin mTLS entre el backend y el agente para mantener la topología aceptada de Docker Fortes y evitar infraestructura adicional en esta sustitución. Es un riesgo aceptado para este alcance, no una garantía de transporte seguro.

El puerto 9997 del agente debe permanecer únicamente en la red overlay privada: no lo publiques en el host ni lo expongas fuera del Swarm. App y agente deben compartir esa overlay y los mismos roots/bind mounts. Si más adelante se exige autenticación fuerte del agente, trátala como un proyecto de infraestructura separado con identidad de workload y despliegue coordinado en todos los nodos.
