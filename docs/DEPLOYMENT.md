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

El archivo `docker-compose.yml` (stack) provisto en la raíz del proyecto está preparado para el entorno Swarm. Utiliza restricciones de ubicación (`node.role == manager` para el backend y `node.role == worker` en modo global para los agentes) e inyecta los secretos requeridos de mTLS.

### Preparación de Secretos
Antes del primer despliegue, Docker Swarm necesita los certificados en texto plano creados como "secrets". Puedes generarlos o simularlos localmente para desarrollo:

```bash
# Crear secretos dummy (solo para validación local en desarrollo)
echo "dummy-jwt-secret" | docker secret create containerhub-test-jwt -
echo "dummy-api-key-secret" | docker secret create containerhub-test-api-key -
echo "admin123" | docker secret create containerhub-test-bootstrap-password -

# Crear secretos de certificados (mTLS)
# (En producción, reemplaza estos echos por cat de los verdaderos archivos de certificados x509)
echo "ca-cert" | docker secret create containerhub-agent-ca.pem -
echo "server-cert" | docker secret create containerhub-agent-server-cert.pem -
echo "server-key" | docker secret create containerhub-agent-server-key.pem -
echo "client-cert" | docker secret create containerhub-agent-client-cert.pem -
echo "client-key" | docker secret create containerhub-agent-client-key.pem -
```

### Ejecución del Despliegue

Inicia el despliegue del stack llamado `containerhub`:

```bash
docker stack deploy -c docker-compose.yml containerhub
```

> [!TIP]
> Puedes verificar `app`, `monitoring` y `agent` con `docker stack services containerhub`. Para el recolector separado, usa `docker service logs -f containerhub_monitoring`; no publica un puerto ni reemplaza el agente remoto.

---

## 5. Modo "Legacy/Inseguro" (Sin mTLS)

Por diseño y seguridad, ContainerHub implementa **Mutual TLS (mTLS)** de forma **estricta y hardcodeada** para proteger el socket remoto contra acceso no autorizado, ya que los agentes de Docker exponen permisos que equivalen a acceso de administrador/root en el host. 

Si te encuentras en un entorno aislado donde es mandatorio operar en un **modo legacy o inseguro (HTTP/WS sin cifrar ni verificar)**, deberás aplicar modificaciones directas al código fuente antes de compilar.

### A. Modificaciones requeridas en el Backend (`containerhub-back`)

1. **`AgentHealthClient.ts`**:
   - Cambia la importación nativa: de `import {request as httpsRequest} from 'node:https'` a `node:http`.
   - Remueve la validación que lanza errores si faltan los `fileVariables` de certificados.
   - En `requestAgent()`, remueve las llaves `{ ca, cert, key, servername }` de las opciones de conexión.
2. **`AgentTerminalClient.ts`**:
   - Reemplaza el esquema estricto del socket de `wss://` a `ws://`.
   - Elimina las `connectionOptions` (que incluyen los certificados del cliente) enviadas al constructor del WebSocket.

### B. Modificaciones requeridas en el Agente (`containerhub-agent`)

1. **`server.ts`**:
   - Elimina la verificación de variables obligatorias como `CONTAINERHUB_AGENT_CA_FILE` en `readAgentServerConfig()`.
   - En la función `buildAgentServer`, reemplaza la instanciación de Fastify `Fastify({https})` simplemente por `Fastify()` sin inyectar objetos de seguridad TLS.

### C. Configuración final en `docker-compose.yml`

Una vez modificados los clientes y el agente, ajusta la receta del orquestador:

1. **Remueve las variables de entorno** referidas a las llaves TLS en los apartados `environment:` tanto de `app` como de `agent` (p. ej. `CONTAINERHUB_AGENT_CA_FILE`).
2. **Elimina las referencias en `secrets:`** dentro de la definición de ambos servicios, así como el bloque inferior global de `secrets:`.
3. Re-compila las imágenes (Paso 1) y redespliega el stack usando `docker stack deploy`.

> [!WARNING]
> **Riesgo Crítico de Seguridad:**
> Deshabilitar mTLS significa exponer la terminal de contenedores y los binarios del host en texto plano sobre la red. Nunca emplees el modo legacy en producción a menos que la infraestructura subyacente (como una malla de servicio tipo Istio o Linkerd) garantice el cifrado extremo a extremo de forma externa.
